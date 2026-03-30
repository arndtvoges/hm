#!/usr/bin/env bun
import { readSync } from "node:fs";
import { runAgentMode } from "./agent";
import { generateCommand } from "./api";
import { copyToClipboard } from "./clipboard";
import { CYAN, DIM, RESET } from "./color";
import { confirmDangerous, warnDangerous } from "./danger";
import { execute } from "./executor";
import { chooseProvider, deleteApiKey, detectProviderFromKeyring, getApiKey } from "./keychain";
import {
  detectProviderFromEnv,
  getDefaultProvider,
  PROVIDER_NAMES,
  type Provider,
  setDefaultProvider,
} from "./provider";
import { maybeSetupShell } from "./setup";
import { getScrollbackHint } from "./shell";
import { spinner } from "./spinner";
import { captureTerminalOutput, getLastCommand, replayCommand } from "./terminal";

async function resolveProvider(args: string[]): Promise<{ provider: Provider; args: string[] }> {
  // 1. Check for --provider flag
  const providerIdx = args.indexOf("--provider");
  if (providerIdx !== -1 && args[providerIdx + 1]) {
    const value = args[providerIdx + 1];
    if (value !== "anthropic" && value !== "openai") {
      process.stderr.write(`Error: Unknown provider "${value}". Use "anthropic" or "openai".\n`);
      process.exit(1);
    }
    const remaining = [...args.slice(0, providerIdx), ...args.slice(providerIdx + 2)];
    return { provider: value, args: remaining };
  }

  // 2. Auto-detect from environment variables
  const detected = detectProviderFromEnv();
  if (detected) {
    return { provider: detected, args };
  }

  // 3. Check saved default provider (~/.config/hm/provider)
  const saved = getDefaultProvider();
  if (saved) return { provider: saved, args };

  // 4. Check keyring for stored keys
  const fromKeyring = await detectProviderFromKeyring();
  if (fromKeyring) return { provider: fromKeyring, args };

  // 5. Neither found — ask the user and save their choice
  const chosen = await chooseProvider();
  setDefaultProvider(chosen);
  return { provider: chosen, args };
}

async function resolveApiKeyOrExit(provider: Provider): Promise<string> {
  try {
    return await getApiKey(provider);
  } catch (err: unknown) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

function printUsage(): void {
  process.stdout.write("Usage: hm <prompt>              Translate prompt to shell command\n");
  process.stdout.write("       hm                       Doctor mode — diagnose last error\n");
  process.stdout.write("       hm .. [prompt]           Agent mode\n");
  process.stdout.write("       hm . <prompt>            Dry-run (copy to clipboard)\n");
  process.stdout.write("       hm --provider <name>     Use anthropic or openai (one-time)\n");
  process.stdout.write("       hm --set-provider <name> Set default provider\n");
  process.stdout.write("       hm --reset-key           Remove stored API key(s)\n");
  process.stdout.write("       hm --help                Show this help\n");
}

async function main() {
  let args = process.argv.slice(2);

  // Handle --help / -h flag
  if (args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  // Handle --set-provider flag
  if (args[0] === "--set-provider") {
    const value = args[1];
    if (value !== "anthropic" && value !== "openai") {
      process.stderr.write(
        `Error: Unknown provider "${value || ""}". Use "anthropic" or "openai".\n`,
      );
      process.exit(1);
    }
    setDefaultProvider(value);
    process.stdout.write(`Default provider set to ${PROVIDER_NAMES[value]}.\n`);
    process.exit(0);
  }

  // Handle --reset-key flag
  if (args[0] === "--reset-key") {
    try {
      await deleteApiKey();
      process.stdout.write("API key(s) removed. Run hm again to set a new one.\n");
    } catch {
      process.stdout.write("No stored API keys found.\n");
    }
    process.exit(0);
  }

  // Resolve provider (flag, env var, keyring, or interactive chooser)
  const resolved = await resolveProvider(args);
  const provider = resolved.provider;
  args = resolved.args;

  // Agent mode: hm .. <prompt>
  if (args[0] === "..") {
    args.shift();
    const prompt = args.join(" ");
    const apiKey = await resolveApiKeyOrExit(provider);
    await runAgentMode(prompt, apiKey, undefined, provider);
    process.exit(0);
  }

  // Doctor mode: bare `hm` with no args
  if (args.length === 0) {
    const apiKey = await resolveApiKeyOrExit(provider);

    let terminalOutput = await captureTerminalOutput();
    const lastCommand = await getLastCommand();

    // If no scrollback available, offer to re-run the last command
    if (!terminalOutput && lastCommand) {
      process.stdout.write(
        `${DIM}Couldn't capture terminal scrollback. ${getScrollbackHint()}${RESET}\n`,
      );
      process.stdout.write(`Re-run ${CYAN}${lastCommand}${RESET} to capture its output? (Y/n): `);

      const buf = Buffer.alloc(64);
      const n = readSync(0, buf, 0, 64, null);
      const answer = buf.toString("utf8", 0, n).trim().toLowerCase();

      if (answer === "" || answer === "y" || answer === "yes") {
        process.stdout.write(`${DIM}running: ${lastCommand}${RESET}\n`);
        terminalOutput = await replayCommand(lastCommand);
      }
    }

    await runAgentMode(
      "",
      apiKey,
      {
        doctor: true,
        terminalOutput,
        lastCommand,
      },
      provider,
    );
    process.exit(0);
  }

  // Dry-run mode: hm . <prompt>
  const dryRun = args[0] === ".";
  if (dryRun) args.shift();

  const prompt = args.join(" ");

  // Resolve API key (env var → Keychain → interactive prompt)
  const apiKey = await resolveApiKeyOrExit(provider);

  // One-time shell setup (noglob alias)
  await maybeSetupShell();

  // Call AI provider
  const spin = spinner();
  const onSigint = () => {
    spin.stop();
    process.exit(130);
  };
  process.on("SIGINT", onSigint);
  let result: Awaited<ReturnType<typeof generateCommand>>;
  try {
    result = await generateCommand(prompt, apiKey, provider);
  } catch (err: unknown) {
    spin.stop();
    process.removeListener("SIGINT", onSigint);
    const errMessage = err instanceof Error ? err.message : String(err);
    const providerName = PROVIDER_NAMES[provider];
    if (
      errMessage.includes("401") ||
      errMessage.includes("authentication") ||
      errMessage.includes("Incorrect API key")
    ) {
      process.stderr.write(`Error: Invalid API key. Run \`hm --reset-key\` to set a new one.\n`);
    } else if (errMessage.includes("429") || errMessage.includes("rate")) {
      process.stderr.write(`Error: Rate limited. Wait a moment and try again.\n`);
    } else if (errMessage.includes("5") && errMessage.includes("error")) {
      process.stderr.write(`Error: ${providerName} API is having issues. Try again in a minute.\n`);
    } else if (
      errMessage.includes("fetch") ||
      errMessage.includes("ENOTFOUND") ||
      errMessage.includes("ECONNREFUSED")
    ) {
      process.stderr.write(
        `Error: Can't reach the ${providerName} API. Check your internet connection.\n`,
      );
    } else {
      process.stderr.write(`Error: ${errMessage}\n`);
    }
    process.exit(1);
  }

  spin.stop();
  process.removeListener("SIGINT", onSigint);
  const { command, summary, dangerous } = result;

  process.stdout.write(`${DIM}${summary}${RESET}\n${DIM}${CYAN}$ ${command}${RESET}\n`);

  if (dryRun) {
    if (dangerous) {
      warnDangerous();
    } else {
      const copied = await copyToClipboard(command);
      if (copied) {
        process.stdout.write(`${DIM}Copied to clipboard.${RESET}\n`);
      } else {
        process.stdout.write(
          `${DIM}Clipboard not available. Copy the command above manually.${RESET}\n`,
        );
      }
    }
    process.exit(0);
  }

  // Danger gate — confirm before executing if dangerous
  if (dangerous) {
    const confirmed = await confirmDangerous(command, summary);
    if (!confirmed) {
      process.stdout.write(`${DIM}Cancelled.${RESET}\n`);
      process.exit(0);
    }
  }

  // Execute
  const exitCode = await execute(command);
  process.exit(exitCode);
}

main();
