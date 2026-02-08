export async function execute(command: string): Promise<number> {
  const shell = process.env.SHELL || "/bin/bash";
  const proc = Bun.spawn([shell, "-c", command], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return proc.exited;
}
