import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  detectProviderFromEnv,
  ENV_VARS,
  KEY_PREFIXES,
  KEY_URLS,
  KEYRING_ACCOUNTS,
  MODELS,
  PROVIDER_NAMES,
} from "../src/provider";

describe("provider", () => {
  let savedAnthropic: string | undefined;
  let savedOpenAI: string | undefined;

  beforeEach(() => {
    savedAnthropic = process.env.ANTHROPIC_API_KEY;
    savedOpenAI = process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (savedAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    else delete process.env.ANTHROPIC_API_KEY;
    if (savedOpenAI !== undefined) process.env.OPENAI_API_KEY = savedOpenAI;
    else delete process.env.OPENAI_API_KEY;
  });

  describe("detectProviderFromEnv", () => {
    test("returns anthropic when only ANTHROPIC_API_KEY is set", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test";
      delete process.env.OPENAI_API_KEY;
      expect(detectProviderFromEnv()).toBe("anthropic");
    });

    test("returns openai when only OPENAI_API_KEY is set", () => {
      delete process.env.ANTHROPIC_API_KEY;
      process.env.OPENAI_API_KEY = "sk-test";
      expect(detectProviderFromEnv()).toBe("openai");
    });

    test("returns anthropic when both keys are set", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test";
      process.env.OPENAI_API_KEY = "sk-test";
      expect(detectProviderFromEnv()).toBe("anthropic");
    });

    test("returns null when neither key is set", () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      expect(detectProviderFromEnv()).toBeNull();
    });
  });

  describe("constants", () => {
    test("ENV_VARS maps to correct env var names", () => {
      expect(ENV_VARS.anthropic).toBe("ANTHROPIC_API_KEY");
      expect(ENV_VARS.openai).toBe("OPENAI_API_KEY");
    });

    test("KEY_PREFIXES maps to correct prefixes", () => {
      expect(KEY_PREFIXES.anthropic).toBe("sk-ant-");
      expect(KEY_PREFIXES.openai).toBe("sk-");
    });

    test("MODELS has command and agent for each provider", () => {
      expect(MODELS.anthropic.command).toBeString();
      expect(MODELS.anthropic.agent).toBeString();
      expect(MODELS.openai.command).toBeString();
      expect(MODELS.openai.agent).toBeString();
    });

    test("PROVIDER_NAMES maps to human-readable names", () => {
      expect(PROVIDER_NAMES.anthropic).toBe("Anthropic");
      expect(PROVIDER_NAMES.openai).toBe("OpenAI");
    });

    test("KEYRING_ACCOUNTS has entries for both providers", () => {
      expect(KEYRING_ACCOUNTS.anthropic).toBeString();
      expect(KEYRING_ACCOUNTS.openai).toBeString();
      expect(KEYRING_ACCOUNTS.anthropic).not.toBe(KEYRING_ACCOUNTS.openai);
    });

    test("KEY_URLS has entries for both providers", () => {
      expect(KEY_URLS.anthropic).toInclude("anthropic");
      expect(KEY_URLS.openai).toInclude("openai");
    });
  });
});
