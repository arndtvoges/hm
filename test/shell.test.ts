import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  detectPlatform,
  detectShell,
  getHistoryPath,
  getScrollbackHint,
  parseHistoryLine,
  run,
} from "../src/shell";

describe("shell", () => {
  describe("run", () => {
    test("returns trimmed stdout for successful command", async () => {
      const result = await run(["echo", "hello"]);
      expect(result).toBe("hello");
    });

    test("returns null for non-zero exit code", async () => {
      const result = await run(["false"]);
      expect(result).toBeNull();
    });

    test("returns null for non-existent command", async () => {
      const result = await run(["__nonexistent_command_xyz__"]);
      expect(result).toBeNull();
    });
  });

  describe("detectPlatform", () => {
    test("returns a known platform value", () => {
      const platform = detectPlatform();
      expect(["darwin", "linux", "unknown"]).toContain(platform);
    });
  });

  describe("detectShell", () => {
    let savedShell: string | undefined;

    beforeEach(() => {
      savedShell = process.env.SHELL;
    });

    afterEach(() => {
      if (savedShell !== undefined) process.env.SHELL = savedShell;
      else delete process.env.SHELL;
    });

    test("detects zsh", () => {
      process.env.SHELL = "/bin/zsh";
      expect(detectShell()).toBe("zsh");
    });

    test("detects bash", () => {
      process.env.SHELL = "/bin/bash";
      expect(detectShell()).toBe("bash");
    });

    test("detects fish", () => {
      process.env.SHELL = "/usr/bin/fish";
      expect(detectShell()).toBe("fish");
    });

    test("returns unknown for unrecognized shell", () => {
      process.env.SHELL = "/usr/bin/csh";
      expect(detectShell()).toBe("unknown");
    });

    test("returns unknown when SHELL is unset", () => {
      delete process.env.SHELL;
      expect(detectShell()).toBe("unknown");
    });
  });

  describe("getHistoryPath", () => {
    let savedShell: string | undefined;
    let savedHome: string | undefined;

    beforeEach(() => {
      savedShell = process.env.SHELL;
      savedHome = process.env.HOME;
    });

    afterEach(() => {
      if (savedShell !== undefined) process.env.SHELL = savedShell;
      else delete process.env.SHELL;
      if (savedHome !== undefined) process.env.HOME = savedHome;
      else delete process.env.HOME;
    });

    test("returns zsh history path", () => {
      process.env.SHELL = "/bin/zsh";
      process.env.HOME = "/home/test";
      expect(getHistoryPath()).toBe("/home/test/.zsh_history");
    });

    test("returns bash history path", () => {
      process.env.SHELL = "/bin/bash";
      process.env.HOME = "/home/test";
      expect(getHistoryPath()).toBe("/home/test/.bash_history");
    });

    test("returns fish history path", () => {
      process.env.SHELL = "/usr/bin/fish";
      process.env.HOME = "/home/test";
      expect(getHistoryPath()).toBe("/home/test/.local/share/fish/fish_history");
    });

    test("returns null when HOME is unset", () => {
      process.env.SHELL = "/bin/zsh";
      delete process.env.HOME;
      expect(getHistoryPath()).toBeNull();
    });
  });

  describe("parseHistoryLine", () => {
    let savedShell: string | undefined;

    beforeEach(() => {
      savedShell = process.env.SHELL;
    });

    afterEach(() => {
      if (savedShell !== undefined) process.env.SHELL = savedShell;
      else delete process.env.SHELL;
    });

    test("strips zsh timestamps", () => {
      process.env.SHELL = "/bin/zsh";
      expect(parseHistoryLine(": 1700000000:0;git status")).toBe("git status");
    });

    test("passes through plain zsh lines", () => {
      process.env.SHELL = "/bin/zsh";
      expect(parseHistoryLine("git status")).toBe("git status");
    });

    test("strips fish cmd prefix", () => {
      process.env.SHELL = "/usr/bin/fish";
      expect(parseHistoryLine("- cmd: git status")).toBe("git status");
    });

    test("passes through bash lines unchanged", () => {
      process.env.SHELL = "/bin/bash";
      expect(parseHistoryLine("git status")).toBe("git status");
    });
  });

  describe("getScrollbackHint", () => {
    test("returns a non-empty string", () => {
      expect(getScrollbackHint()).toBeString();
      expect(getScrollbackHint().length).toBeGreaterThan(0);
    });
  });
});
