import { describe, expect, test } from "bun:test";
import { generateCommand } from "../src/api";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!ANTHROPIC_KEY || !OPENAI_KEY) {
  throw new Error("Both ANTHROPIC_API_KEY and OPENAI_API_KEY must be set to run tests.");
}

const TIMEOUT = 30_000;

describe("generateCommand — Anthropic", () => {
  test(
    "generates a safe command for listing files",
    async () => {
      const result = await generateCommand(
        "list files in current directory",
        ANTHROPIC_KEY!,
        "anthropic",
      );
      expect(result.command).toBeString();
      expect(result.command.length).toBeGreaterThan(0);
      expect(result.summary).toBeString();
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.dangerous).toBe(false);
      expect(result.command.toLowerCase()).toInclude("ls");
    },
    TIMEOUT,
  );

  test(
    "returns valid response for dangerous prompt",
    async () => {
      const result = await generateCommand(
        "delete everything in home directory recursively with force",
        ANTHROPIC_KEY!,
        "anthropic",
      );
      // LLMs are non-deterministic — assert response shape, not exact judgment
      expect(result.command).toBeString();
      expect(result.command.length).toBeGreaterThan(0);
      expect(result.summary).toBeString();
      expect(typeof result.dangerous).toBe("boolean");
    },
    TIMEOUT,
  );

  test(
    "rejects invalid API key",
    async () => {
      expect(
        generateCommand("list files", "sk-ant-INVALID-KEY-12345", "anthropic"),
      ).rejects.toThrow();
    },
    TIMEOUT,
  );
});

describe("generateCommand — OpenAI", () => {
  test(
    "generates a safe command for listing files",
    async () => {
      const result = await generateCommand(
        "list files in current directory",
        OPENAI_KEY!,
        "openai",
      );
      expect(result.command).toBeString();
      expect(result.command.length).toBeGreaterThan(0);
      expect(result.summary).toBeString();
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.dangerous).toBe(false);
      expect(result.command.toLowerCase()).toInclude("ls");
    },
    TIMEOUT,
  );

  test(
    "returns valid response for dangerous prompt",
    async () => {
      const result = await generateCommand(
        "delete everything in home directory recursively with force",
        OPENAI_KEY!,
        "openai",
      );
      expect(result.command).toBeString();
      expect(result.command.length).toBeGreaterThan(0);
      expect(result.summary).toBeString();
      expect(typeof result.dangerous).toBe("boolean");
    },
    TIMEOUT,
  );

  test(
    "rejects invalid API key",
    async () => {
      expect(generateCommand("list files", "sk-INVALID-KEY-12345", "openai")).rejects.toThrow();
    },
    TIMEOUT,
  );
});
