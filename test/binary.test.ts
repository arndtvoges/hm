import { beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!ANTHROPIC_KEY || !OPENAI_KEY) {
  throw new Error("Both ANTHROPIC_API_KEY and OPENAI_API_KEY must be set to run tests.");
}

// Absolute path to the local binary — never picks up a brew-installed hm
const HM = resolve(import.meta.dir, "../hm");

const TIMEOUT = 30_000;
const AGENT_TIMEOUT = 60_000;

// Strip ANSI escape codes and spinner characters for clean assertions
function stripAnsi(str: string): string {
  return (
    str
      // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape matching
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
      .replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏○◔◑◕●▖▘▝▗]/g, "")
      .trim()
  );
}

// Build fresh from source before any tests run
beforeAll(async () => {
  const proc = Bun.spawn(["bun", "run", "build"], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: resolve(import.meta.dir, ".."),
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Build failed (exit ${exitCode}): ${stderr}`);
  }
}, TIMEOUT);

/**
 * Run the compiled hm binary. For processes that won't exit on their own
 * (agent/doctor), pass killAfterMs to kill after a timeout.
 */
async function runBinary(
  args: string[],
  options?: {
    env?: Record<string, string>;
    killAfterMs?: number;
    stdin?: string;
  },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([HM, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: options?.stdin !== undefined ? "pipe" : undefined,
    env: { ...process.env, ...options?.env },
  });

  // Write to stdin if provided (e.g., "n\n" to skip doctor re-run prompt)
  if (options?.stdin !== undefined && proc.stdin) {
    proc.stdin.write(options.stdin);
    proc.stdin.end();
  }

  // Kill after timeout for interactive modes
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  if (options?.killAfterMs) {
    killTimer = setTimeout(() => {
      proc.kill();
    }, options.killAfterMs);
  }

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  if (killTimer) clearTimeout(killTimer);

  return { stdout, stderr, exitCode };
}

describe("Binary — flags", () => {
  test(
    "--help exits 0 and shows usage",
    async () => {
      const { stdout, exitCode } = await runBinary(["--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toInclude("Usage: hm");
      expect(stdout).toInclude("--provider");
    },
    TIMEOUT,
  );

  test(
    "--provider with invalid name exits 1",
    async () => {
      const { stderr, exitCode } = await runBinary(["--provider", "invalid", "test"]);
      expect(exitCode).toBe(1);
      expect(stderr).toInclude("Unknown provider");
    },
    TIMEOUT,
  );
});

describe("Binary — simple execute — Anthropic", () => {
  test(
    "generates and executes a command",
    async () => {
      const { stdout, exitCode } = await runBinary(
        ["--provider", "anthropic", "print the word hello"],
        { env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY! } },
      );
      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toInclude("hello");
    },
    TIMEOUT,
  );
});

describe("Binary — simple execute — OpenAI", () => {
  test(
    "generates and executes a command",
    async () => {
      const { stdout, exitCode } = await runBinary(
        ["--provider", "openai", "print the word hello"],
        { env: { OPENAI_API_KEY: OPENAI_KEY! } },
      );
      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toInclude("hello");
    },
    TIMEOUT,
  );
});

describe("Binary — dry-run — Anthropic", () => {
  test(
    "generates command without executing",
    async () => {
      const { stdout, exitCode } = await runBinary(
        ["--provider", "anthropic", ".", "list files in current directory"],
        { env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY! } },
      );
      expect(exitCode).toBe(0);
      expect(stdout).toInclude("$");
    },
    TIMEOUT,
  );
});

describe("Binary — dry-run — OpenAI", () => {
  test(
    "generates command without executing",
    async () => {
      const { stdout, exitCode } = await runBinary(
        ["--provider", "openai", ".", "list files in current directory"],
        { env: { OPENAI_API_KEY: OPENAI_KEY! } },
      );
      expect(exitCode).toBe(0);
      expect(stdout).toInclude("$");
    },
    TIMEOUT,
  );
});

describe("Binary — agent mode — Anthropic", () => {
  test(
    "starts agent and gets model response",
    async () => {
      const { stdout } = await runBinary(
        ["--provider", "anthropic", "..", "why did my last git push fail"],
        {
          env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY! },
          killAfterMs: 25_000,
        },
      );
      const clean = stripAnsi(stdout);
      // Model should have printed some text before the selector blocked
      expect(clean.length).toBeGreaterThan(10);
    },
    AGENT_TIMEOUT,
  );
});

describe("Binary — agent mode — OpenAI", () => {
  test(
    "starts agent and gets model response",
    async () => {
      const { stdout } = await runBinary(
        ["--provider", "openai", "..", "why did my last git push fail"],
        {
          env: { OPENAI_API_KEY: OPENAI_KEY! },
          killAfterMs: 25_000,
        },
      );
      const clean = stripAnsi(stdout);
      expect(clean.length).toBeGreaterThan(10);
    },
    AGENT_TIMEOUT,
  );
});

describe("Binary — doctor mode — Anthropic", () => {
  test(
    "starts doctor and gets model response",
    async () => {
      const { stdout } = await runBinary(["--provider", "anthropic"], {
        env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY! },
        stdin: "n\n", // skip "Re-run last command?" prompt
        killAfterMs: 25_000,
      });
      const clean = stripAnsi(stdout);
      // At minimum should see the re-run prompt text or model output
      expect(clean.length).toBeGreaterThan(5);
    },
    AGENT_TIMEOUT,
  );
});

describe("Binary — doctor mode — OpenAI", () => {
  test(
    "starts doctor and gets model response",
    async () => {
      const { stdout } = await runBinary(["--provider", "openai"], {
        env: { OPENAI_API_KEY: OPENAI_KEY! },
        stdin: "n\n",
        killAfterMs: 25_000,
      });
      const clean = stripAnsi(stdout);
      expect(clean.length).toBeGreaterThan(5);
    },
    AGENT_TIMEOUT,
  );
});
