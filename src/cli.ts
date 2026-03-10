#!/usr/bin/env bun
import { readSync } from "node:fs";
import { getApiKey, deleteApiKey } from "./keychain";
import { maybeSetupShell } from "./setup";
import { generateCommand } from "./api";
import { confirmDangerous, warnDangerous } from "./danger";
import { execute } from "./executor";
import { spinner } from "./spinner";
import { runAgentMode } from "./agent";
import { captureTerminalOutput, getLastCommand, replayCommand } from "./terminal";
import { copyToClipboard } from "./clipboard";
import { DIM, RESET, CYAN } from "./color";
import { getScrollbackHint } from "./shell";

async function resolveApiKeyOrExit(): Promise<string> {
  try {
    return await getApiKey();
  } catch (err: unknown) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

function printUsage(): void {
  process.stdout.write("Usage: hm <prompt>       Translate prompt to shell command\n");
  process.stdout.write("       hm                Doctor mode — diagnose last error\n");
  process.stdout.write("       hm .. [prompt]    Agent mode\n");
  process.stdout.write("       hm . <prompt>     Dry-run (copy to clipboard)\n");
  process.stdout.write("       hm --reset-key    Remove stored API key\n");
  process.stdout.write("       hm --help         Show this help\n");
}

async function main() {
  const args = process.argv.slice(2);

  // Handle --help / -h flag
  if (args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  // Handle --reset-key flag
  if (args[0] === "--reset-key") {
    try {
      await deleteApiKey();
      process.stdout.write("API key removed. Run hm again to set a new one.\n");
    } catch {
      process.stdout.write("No stored API key found.\n");
    }
    process.exit(0);
  }

  // Agent mode: hm .. <prompt>
  if (args[0] === "..") {
    args.shift();
    const prompt = args.join(" ");
    const apiKey = await resolveApiKeyOrExit();
    await runAgentMode(prompt, apiKey);
    process.exit(0);
  }

  // Doctor mode: bare `hm` with no args
  if (args.length === 0) {
    const apiKey = await resolveApiKeyOrExit();

    let terminalOutput = await captureTerminalOutput();
    const lastCommand = await getLastCommand();

    // If no scrollback available, offer to re-run the last command
    if (!terminalOutput && lastCommand) {
      process.stdout.write(`${DIM}Couldn't capture terminal scrollback. ${getScrollbackHint()}${RESET}\n`);
      process.stdout.write(`Re-run ${CYAN}${lastCommand}${RESET} to capture its output? (Y/n): `);

      const buf = Buffer.alloc(64);
      const n = readSync(0, buf, 0, 64, null);
      const answer = buf.toString("utf8", 0, n).trim().toLowerCase();

      if (answer === "" || answer === "y" || answer === "yes") {
        process.stdout.write(`${DIM}running: ${lastCommand}${RESET}\n`);
        terminalOutput = await replayCommand(lastCommand);
      }
    }

    await runAgentMode("", apiKey, {
      doctor: true,
      terminalOutput,
      lastCommand,
    });
    process.exit(0);
  }

  // Dry-run mode: hm . <prompt>
  const dryRun = args[0] === ".";
  if (dryRun) args.shift();

  const prompt = args.join(" ");

  // Resolve API key (env var → Keychain → interactive prompt)
  const apiKey = await resolveApiKeyOrExit();

  // One-time shell setup (noglob alias)
  await maybeSetupShell();

  // Call Claude
  const spin = spinner();
  const onSigint = () => { spin.stop(); process.exit(130); };
  process.on("SIGINT", onSigint);
  let result;
  try {
    result = await generateCommand(prompt, apiKey);
  } catch (err: unknown) {
    spin.stop();
    process.removeListener("SIGINT", onSigint);
    const errMessage = err instanceof Error ? err.message : String(err);
    if (errMessage.includes("401") || errMessage.includes("authentication")) {
      process.stderr.write(`Error: Invalid API key. Run \`hm --reset-key\` to set a new one.\n`);
    } else if (errMessage.includes("429") || errMessage.includes("rate")) {
      process.stderr.write(`Error: Rate limited. Wait a moment and try again.\n`);
    } else if (errMessage.includes("5") && errMessage.includes("error")) {
      process.stderr.write(`Error: Anthropic API is having issues. Try again in a minute.\n`);
    } else if (errMessage.includes("fetch") || errMessage.includes("ENOTFOUND") || errMessage.includes("ECONNREFUSED")) {
      process.stderr.write(`Error: Can't reach the Anthropic API. Check your internet connection.\n`);
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
        process.stdout.write(`${DIM}Clipboard not available. Copy the command above manually.${RESET}\n`);
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
