import * as readline from "node:readline/promises";
import { DIM, RESET, CLEAR_LINE } from "./color";

export interface SelectorOption {
  label: string;
  description: string;
}

export async function selector(options: SelectorOption[]): Promise<string> {
  if (options.length === 0) {
    return "";
  }

  let selected = 0;
  const count = options.length;

  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();

  // Render all options, positioning cursor at the start
  function render() {
    // Move cursor up to overwrite previous render (except on first draw)
    process.stdout.write(`\x1b[${count}A`);
    for (let i = 0; i < count; i++) {
      const indicator = i === selected ? `${RESET}  \u25B8 ` : `${DIM}    `;
      const label = options[i].label;
      process.stdout.write(`${CLEAR_LINE}${indicator}${label}${RESET}\n`);
    }
  }

  // Draw the initial list
  for (let i = 0; i < count; i++) {
    const indicator = i === selected ? `${RESET}  \u25B8 ` : `${DIM}    `;
    const label = options[i].label;
    process.stdout.write(`${indicator}${label}${RESET}\n`);
  }

  const label = await new Promise<string>((resolve) => {
    function onData(data: Buffer) {
      const key = data.toString();

      // Arrow up: \x1b[A
      if (key === "\x1b[A") {
        selected = (selected - 1 + count) % count;
        render();
        return;
      }

      // Arrow down: \x1b[B
      if (key === "\x1b[B") {
        selected = (selected + 1) % count;
        render();
        return;
      }

      // Enter
      if (key === "\r" || key === "\n") {
        cleanup();
        resolve(options[selected].label);
        return;
      }

      // Ctrl+C
      if (key === "\x03") {
        cleanup();
        process.exit(0);
      }
    }

    function cleanup() {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(wasRaw ?? false);
      process.stdin.pause();
    }

    process.stdin.on("data", onData);
  });

  if (label === "Something different") {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`${RESET}What should I do instead? `);
    rl.close();
    return answer.trim();
  }

  return label;
}
