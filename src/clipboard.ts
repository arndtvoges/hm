export async function copyToClipboard(text: string): Promise<boolean> {
  const platform = process.platform;

  if (platform === "darwin") {
    return await pipeToCommand(["pbcopy"], text);
  }

  if (platform === "linux") {
    if (await pipeToCommand(["xclip", "-selection", "clipboard"], text)) {
      return true;
    }
    return await pipeToCommand(["xsel", "--clipboard", "--input"], text);
  }

  return false;
}

async function pipeToCommand(cmd: string[], text: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(cmd, { stdin: "pipe" });
    proc.stdin.write(text);
    proc.stdin.end();
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}
