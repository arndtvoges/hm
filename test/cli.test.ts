import { describe, expect, test } from "bun:test";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!ANTHROPIC_KEY || !OPENAI_KEY) {
  throw new Error("Both ANTHROPIC_API_KEY and OPENAI_API_KEY must be set to run tests.");
}

const TIMEOUT = 30_000;

async function runCli(
  args: string[],
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

describe("CLI flags", () => {
  test(
    "--help exits 0 and shows usage",
    async () => {
      const { stdout, exitCode } = await runCli(["--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toInclude("Usage: hm");
      expect(stdout).toInclude("--provider");
    },
    TIMEOUT,
  );

  test(
    "-h exits 0 and shows usage",
    async () => {
      const { stdout, exitCode } = await runCli(["-h"]);
      expect(exitCode).toBe(0);
      expect(stdout).toInclude("Usage: hm");
    },
    TIMEOUT,
  );

  test(
    "--provider with invalid name exits 1",
    async () => {
      const { stderr, exitCode } = await runCli(["--provider", "invalid", "list files"]);
      expect(exitCode).toBe(1);
      expect(stderr).toInclude("Unknown provider");
    },
    TIMEOUT,
  );
});

describe("CLI simple execute — Anthropic", () => {
  test(
    "generates and executes a command",
    async () => {
      const { stdout, exitCode } = await runCli(
        ["--provider", "anthropic", "print the word hello"],
        { ANTHROPIC_API_KEY: ANTHROPIC_KEY! },
      );
      expect(exitCode).toBe(0);
      // stdout contains the summary + command line + execution output
      expect(stdout.toLowerCase()).toInclude("hello");
    },
    TIMEOUT,
  );
});

describe("CLI simple execute — OpenAI", () => {
  test(
    "generates and executes a command",
    async () => {
      const { stdout, exitCode } = await runCli(["--provider", "openai", "print the word hello"], {
        OPENAI_API_KEY: OPENAI_KEY!,
      });
      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toInclude("hello");
    },
    TIMEOUT,
  );
});

describe("CLI dry-run — Anthropic", () => {
  test(
    "generates command without executing",
    async () => {
      const { stdout, exitCode } = await runCli(
        ["--provider", "anthropic", ".", "list files in current directory"],
        { ANTHROPIC_API_KEY: ANTHROPIC_KEY! },
      );
      expect(exitCode).toBe(0);
      expect(stdout).toInclude("$");
    },
    TIMEOUT,
  );
});

describe("CLI dry-run — OpenAI", () => {
  test(
    "generates command without executing",
    async () => {
      const { stdout, exitCode } = await runCli(
        ["--provider", "openai", ".", "list files in current directory"],
        { OPENAI_API_KEY: OPENAI_KEY! },
      );
      expect(exitCode).toBe(0);
      expect(stdout).toInclude("$");
    },
    TIMEOUT,
  );
});
