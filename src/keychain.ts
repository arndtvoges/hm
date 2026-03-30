import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { deleteSecret, getSecret, isKeyringAvailable, setSecret } from "./keyring";
import type { Provider } from "./provider";
import { ENV_VARS, KEY_PREFIXES, KEY_URLS, KEYRING_ACCOUNTS, PROVIDER_NAMES } from "./provider";
import { selector } from "./selector";

const SERVICE = "hm-cli";

const CONFIG_DIR = join(homedir(), ".config", "hm");
const SETUP_DONE_FILE = join(CONFIG_DIR, ".setup-done");

/**
 * Resolve an API key for the given provider.
 * Order: env var → system keyring → interactive prompt.
 */
export async function getApiKey(provider: Provider): Promise<string> {
  // 1. Check provider-specific environment variable
  const envKey = process.env[ENV_VARS[provider]];
  if (envKey) return envKey;

  // 2. Try system keyring
  if (await isKeyringAvailable()) {
    try {
      const key = await getSecret(SERVICE, KEYRING_ACCOUNTS[provider]);
      if (key) return key;
    } catch {
      // Keyring lookup failed — fall through to prompt
    }
  }

  // 3. No key found — ask the user interactively
  return await promptForKey(provider);
}

/**
 * Try to detect which provider has a stored key (env or keyring).
 * Returns the first provider found, or null.
 */
export async function detectProviderFromKeyring(): Promise<Provider | null> {
  // Check env vars first
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";

  // Check keyring
  if (await isKeyringAvailable()) {
    for (const provider of ["anthropic", "openai"] as Provider[]) {
      try {
        const key = await getSecret(SERVICE, KEYRING_ACCOUNTS[provider]);
        if (key) return provider;
      } catch {
        // continue
      }
    }
  }

  return null;
}

export async function setApiKey(provider: Provider, key: string): Promise<void> {
  await setSecret(SERVICE, KEYRING_ACCOUNTS[provider], key);
}

export async function deleteApiKey(provider?: Provider): Promise<void> {
  if (provider) {
    await deleteSecret(SERVICE, KEYRING_ACCOUNTS[provider]);
  } else {
    // Delete all stored keys
    const errors: string[] = [];
    for (const p of ["anthropic", "openai"] as Provider[]) {
      try {
        await deleteSecret(SERVICE, KEYRING_ACCOUNTS[p]);
      } catch {
        errors.push(p);
      }
    }
    if (errors.length === 2) {
      throw new Error("No stored API keys found.");
    }
  }
}

async function promptForKey(provider: Provider): Promise<string> {
  const keyringOk = await isKeyringAvailable();
  const name = PROVIDER_NAMES[provider];
  const prefix = KEY_PREFIXES[provider];
  const url = KEY_URLS[provider];

  process.stdout.write("\n");
  process.stdout.write("Welcome to hm!\n");
  process.stdout.write("\n");
  process.stdout.write(`To get started, you need an ${name} API key.\n`);
  process.stdout.write(`Get one at: ${url}\n`);
  if (!keyringOk) {
    process.stdout.write("\nNote: No system keyring found. Key cannot be saved.\n");
    process.stdout.write(`Set ${ENV_VARS[provider]} in your environment to persist it.\n`);
  }
  process.stdout.write("\n");
  process.stdout.write("Enter your API key: ");

  const key = await readLine();

  if (!key.startsWith(prefix)) {
    throw new Error(`Invalid API key. Expected a key starting with "${prefix}".`);
  }

  if (keyringOk) {
    await setApiKey(provider, key);
    process.stdout.write("\u2713 Key saved to system keyring.\n");
  }

  return key;
}

/**
 * Interactive provider chooser for first-time setup when no provider is known.
 */
export async function chooseProvider(): Promise<Provider> {
  process.stdout.write("\n");
  process.stdout.write("Which AI provider do you want to use?\n\n");
  const choice = await selector([
    { label: "Anthropic", description: "Claude (recommended)" },
    { label: "OpenAI", description: "GPT-4.1" },
  ]);
  return choice === "Anthropic" ? "anthropic" : "openai";
}

async function readLine(): Promise<string> {
  for await (const chunk of process.stdin) {
    return new TextDecoder().decode(chunk).trim();
  }
  return "";
}

export async function isShellSetupDone(): Promise<boolean> {
  return existsSync(SETUP_DONE_FILE);
}

export async function markShellSetupDone(): Promise<void> {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(SETUP_DONE_FILE, "");
}
