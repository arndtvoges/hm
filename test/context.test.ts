import { describe, expect, test } from "bun:test";
import { gatherContext } from "../src/context";

describe("context", () => {
  test("returns string with System section", async () => {
    const ctx = await gatherContext();
    expect(ctx).toInclude("## System");
    expect(ctx).toInclude(`OS: ${process.platform}`);
    expect(ctx).toInclude(`Arch: ${process.arch}`);
  });

  test("contains Directory Listing section", async () => {
    const ctx = await gatherContext();
    expect(ctx).toInclude("## Directory Listing");
  });

  test("contains Environment Variables section", async () => {
    const ctx = await gatherContext();
    expect(ctx).toInclude("## Environment Variables");
  });

  test("contains Git section in a git repo", async () => {
    const ctx = await gatherContext();
    expect(ctx).toInclude("## Git");
    expect(ctx).toInclude("Branch:");
  });

  test("prepends Terminal Output when provided", async () => {
    const ctx = await gatherContext({ terminalOutput: "error: something broke" });
    expect(ctx).toInclude("## Terminal Output");
    expect(ctx).toInclude("error: something broke");
    // Terminal Output should appear before System
    const termIdx = ctx.indexOf("## Terminal Output");
    const sysIdx = ctx.indexOf("## System");
    expect(termIdx).toBeLessThan(sysIdx);
  });

  test("prepends Last Command when provided", async () => {
    const ctx = await gatherContext({ lastCommand: "git push origin main" });
    expect(ctx).toInclude("## Last Command");
    expect(ctx).toInclude("git push origin main");
  });

  test("redacts sensitive env vars", async () => {
    const ctx = await gatherContext();
    // API keys should not appear in plain text
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (anthropicKey) {
      expect(ctx).not.toInclude(anthropicKey);
    }
    if (openaiKey) {
      expect(ctx).not.toInclude(openaiKey);
    }
  });

  test("doctor mode works with more history", async () => {
    const ctx = await gatherContext({ doctor: true });
    expect(ctx).toInclude("## System");
    expect(ctx).toInclude("## Recent Shell History");
  });
});
