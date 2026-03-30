import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Provider = "anthropic" | "openai";

const CONFIG_DIR = join(homedir(), ".config", "hm");
const PROVIDER_FILE = join(CONFIG_DIR, "provider");

export const ENV_VARS: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

export const KEY_PREFIXES: Record<Provider, string> = {
  anthropic: "sk-ant-",
  openai: "sk-",
};

export const KEY_URLS: Record<Provider, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
};

export const KEYRING_ACCOUNTS: Record<Provider, string> = {
  anthropic: "anthropic-api-key",
  openai: "openai-api-key",
};

export const MODELS: Record<Provider, { command: string; agent: string }> = {
  anthropic: { command: "claude-sonnet-4-6", agent: "claude-opus-4-6" },
  openai: { command: "gpt-5.4-mini", agent: "gpt-5.4" },
};

export const PROVIDER_NAMES: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

/**
 * Auto-detect provider from environment variables.
 * Returns null if neither key is set (will fall back to config / keyring / interactive prompt).
 */
export function detectProviderFromEnv(): Provider | null {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  if (hasAnthropic && !hasOpenAI) return "anthropic";
  if (hasOpenAI && !hasAnthropic) return "openai";
  if (hasAnthropic && hasOpenAI) return "anthropic";
  return null;
}

/**
 * Read the saved default provider from ~/.config/hm/provider.
 */
export function getDefaultProvider(): Provider | null {
  try {
    if (!existsSync(PROVIDER_FILE)) return null;
    const value = readFileSync(PROVIDER_FILE, "utf8").trim();
    if (value === "anthropic" || value === "openai") return value;
    return null;
  } catch {
    return null;
  }
}

/**
 * Save the default provider to ~/.config/hm/provider.
 */
export function setDefaultProvider(provider: Provider): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(PROVIDER_FILE, provider);
}
