export async function run(command: string[]): Promise<string | null> {
  try {
    const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    return (await new Response(proc.stdout).text()).trim();
  } catch {
    return null;
  }
}

export type Platform = "darwin" | "linux" | "unknown";

export function detectPlatform(): Platform {
  if (process.platform === "darwin") return "darwin";
  if (process.platform === "linux") return "linux";
  return "unknown";
}

export type Shell = "zsh" | "bash" | "fish" | "unknown";

export function detectShell(): Shell {
  const shell = process.env.SHELL;
  if (!shell) return "unknown";
  const base = shell.split("/").pop() || "";
  if (base === "zsh") return "zsh";
  if (base === "bash") return "bash";
  if (base === "fish") return "fish";
  return "unknown";
}

export function getHistoryPath(): string | null {
  const home = process.env.HOME;
  if (!home) return null;
  const shell = detectShell();
  switch (shell) {
    case "zsh":
      return `${home}/.zsh_history`;
    case "bash":
      return `${home}/.bash_history`;
    case "fish":
      return `${home}/.local/share/fish/fish_history`;
    default:
      return null;
  }
}

export function parseHistoryLine(line: string): string {
  const shell = detectShell();
  switch (shell) {
    case "zsh": {
      const match = line.match(/^:\s*\d+:\d+;(.*)$/);
      return match ? match[1] : line;
    }
    case "fish": {
      const prefix = "- cmd: ";
      return line.startsWith(prefix) ? line.slice(prefix.length) : line;
    }
    default:
      return line;
  }
}

export function stripZshTimestamp(line: string): string {
  return parseHistoryLine(line);
}

export function getScrollbackHint(): string {
  const term = process.env.TERM_PROGRAM;
  if (term === "ghostty") {
    return "Update to Ghostty 1.3+ and enable macos-applescript, or use tmux for automatic capture.";
  }
  if (detectPlatform() === "darwin") {
    return "Use tmux, iTerm2, or Terminal.app for automatic capture.";
  }
  return "Use tmux for automatic capture.";
}
