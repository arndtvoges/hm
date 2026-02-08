import * as readline from "node:readline/promises";
import { isShellSetupDone, markShellSetupDone } from "./keychain";
import { DIM, RESET } from "./color";

const ALIAS_LINE = "alias hm='noglob hm'";

export async function maybeSetupShell(): Promise<void> {
  if (await isShellSetupDone()) return;

  const shell = process.env.SHELL || "";
  if (!shell.endsWith("zsh")) {
    await markShellSetupDone();
    return;
  }

  const rcFile = `${process.env.HOME}/.zshrc`;

  // Check if already configured
  try {
    const content = await Bun.file(rcFile).text();
    if (content.includes("noglob hm")) {
      await markShellSetupDone();
      return;
    }
  } catch {
    // .zshrc doesn't exist yet, that's fine
  }

  process.stdout.write(`\n${DIM}zsh treats ? and * as special characters.${RESET}\n`);
  process.stdout.write(`${DIM}Add \`${ALIAS_LINE}\` to ~/.zshrc so you can type naturally?${RESET}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${DIM}Configure shell? (Y/n):${RESET} `);
  rl.close();

  if (answer.trim().toLowerCase() === "n") {
    await markShellSetupDone();
    return;
  }

  // Append to .zshrc
  const file = Bun.file(rcFile);
  let content = "";
  try {
    content = await file.text();
  } catch {
    // file doesn't exist
  }

  const newline = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  await Bun.write(rcFile, content + newline + `\n# hm - natural language shell commands\n${ALIAS_LINE}\n`);

  await markShellSetupDone();
  process.stdout.write(`${DIM}\u2713 Added to ~/.zshrc. Restart your shell or run: source ~/.zshrc${RESET}\n`);
}
