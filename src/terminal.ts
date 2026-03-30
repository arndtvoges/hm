import { getHistoryPath, parseHistoryLine, run } from "./shell";

const MAX_LINES = 200;
const MAX_LINE_LENGTH = 500;

function truncate(raw: string): string {
  const lines = raw.split("\n").slice(-MAX_LINES);
  return lines
    .map((l) => (l.length > MAX_LINE_LENGTH ? `${l.slice(0, MAX_LINE_LENGTH)}…` : l))
    .join("\n");
}

async function runAppleScript(script: string): Promise<string | null> {
  return run(["osascript", "-e", script]);
}

/**
 * Capture recent terminal scrollback from the user's terminal emulator.
 * Detection order: tmux → Ghostty → iTerm2 → Terminal.app → null.
 */
export async function captureTerminalOutput(): Promise<string | null> {
  // 1. tmux (works inside any terminal)
  if (process.env.TMUX) {
    const output = await run(["tmux", "capture-pane", "-p", "-S", `-${MAX_LINES}`]);
    if (output) return truncate(output);
  }

  const termProgram = process.env.TERM_PROGRAM;

  // 2. Ghostty (1.3+ AppleScript API)
  if (termProgram === "ghostty") {
    const output = await runAppleScript(
      'tell application "Ghostty" to get contents of focused terminal of selected tab of front window',
    );
    if (output) return truncate(output);
  }

  // 3. iTerm2
  if (termProgram === "iTerm.app") {
    const output = await runAppleScript(
      'tell application "iTerm2" to tell current session of current window to get contents',
    );
    if (output) return truncate(output);
  }

  // 4. Terminal.app
  if (termProgram === "Apple_Terminal") {
    const output = await runAppleScript(
      'tell application "Terminal" to get history of selected tab of front window',
    );
    if (output) return truncate(output);
  }

  // 5. Unsupported
  return null;
}

/**
 * Read the last command from the shell history file,
 * skipping any `hm` entries (since we're currently running as `hm`).
 */
export async function getLastCommand(): Promise<string | null> {
  try {
    const historyPath = getHistoryPath();
    if (!historyPath) return null;

    const raw = await run(["tail", "-n", "10", historyPath]);
    if (!raw) return null;

    const lines = raw
      .split("\n")
      .map(parseHistoryLine)
      .filter((cmd) => cmd.length > 0 && cmd !== "hm");

    return lines.length > 0 ? lines[lines.length - 1] : null;
  } catch {
    return null;
  }
}

/**
 * Re-run a command and capture its combined stdout+stderr output.
 * Used as a fallback when terminal scrollback isn't available.
 */
export async function replayCommand(command: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["sh", "-c", command], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;

    const combined = (stdout + stderr).trim();
    if (!combined) return null;
    return truncate(combined);
  } catch {
    return null;
  }
}
