import * as readline from "node:readline/promises";
import { RED, RESET } from "./color";

async function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(prompt);
  rl.close();
  return answer.trim().toLowerCase();
}

export async function confirmDangerous(_command: string, _summary: string): Promise<boolean> {
  process.stdout.write(`${RED}\u26A0 Executing this is potentially dangerous.${RESET}\n`);

  const first = await ask(`${RED}Run this command? (y/N):${RESET} `);
  if (first !== "y") return false;

  const second = await ask(`${RED}Are you sure? (y/N):${RESET} `);
  return second === "y";
}

export function warnDangerous(): void {
  process.stdout.write(
    `${RED}\u26A0 This is potentially dangerous. Copy-paste manually.${RESET}\n`,
  );
}
