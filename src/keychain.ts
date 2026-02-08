import { getSecret, setSecret, deleteSecret, isKeyringAvailable } from "./keyring";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const SERVICE = "hm-cli";
const ACCOUNT = "anthropic-api-key";

const CONFIG_DIR = join(homedir(), ".config", "hm");
const SETUP_DONE_FILE = join(CONFIG_DIR, ".setup-done");

export async function getApiKey(): Promise<string> {
  // 1. Check environment variable first
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    return envKey;
  }

  // 2. Try system keyring
  if (await isKeyringAvailable()) {
    try {
      const key = await getSecret(SERVICE, ACCOUNT);
      if (key) {
        return key;
      }
    } catch {
      // Keyring lookup failed — fall through to prompt
    }
  }

  // 3. No key found anywhere — ask the user interactively
  const key = await promptForKey();
  return key;
}

export async function setApiKey(key: string): Promise<void> {
  await setSecret(SERVICE, ACCOUNT, key);
}

export async function deleteApiKey(): Promise<void> {
  await deleteSecret(SERVICE, ACCOUNT);
}

async function promptForKey(): Promise<string> {
  const keyringOk = await isKeyringAvailable();

  process.stdout.write("\n");
  process.stdout.write("Welcome to hm!\n");
  process.stdout.write("\n");
  process.stdout.write(
    "To get started, you need an Anthropic API key.\n",
  );
  process.stdout.write(
    "Get one at: https://console.anthropic.com/settings/keys\n",
  );
  if (!keyringOk) {
    process.stdout.write(
      "\nNote: No system keyring found. Key cannot be saved.\n",
    );
    process.stdout.write(
      "Set ANTHROPIC_API_KEY in your environment to persist it.\n",
    );
  }
  process.stdout.write("\n");
  process.stdout.write("Enter your API key: ");

  const key = await readLine();

  if (!key.startsWith("sk-ant-")) {
    throw new Error(
      'Invalid API key. Expected a key starting with "sk-ant-".',
    );
  }

  if (keyringOk) {
    await setApiKey(key);
    process.stdout.write("\u2713 Key saved to system keyring.\n");
  }

  return key;
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
