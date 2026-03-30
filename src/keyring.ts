import { run } from "./shell";

type Platform = "darwin" | "linux";

export async function getSecret(service: string, account: string): Promise<string | null> {
  const platform = process.platform as Platform;

  if (platform === "darwin") {
    return run(["security", "find-generic-password", "-s", service, "-a", account, "-w"]);
  }

  if (platform === "linux") {
    return run(["secret-tool", "lookup", "service", service, "account", account]);
  }

  return null;
}

export async function setSecret(service: string, account: string, value: string): Promise<void> {
  const platform = process.platform as Platform;

  if (platform === "darwin") {
    const result = await run([
      "security",
      "add-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w",
      value,
      "-U",
    ]);
    if (result === null) {
      throw new Error("Failed to save secret to macOS Keychain");
    }
    return;
  }

  if (platform === "linux") {
    // secret-tool store reads the secret from stdin
    const proc = Bun.spawn(
      ["secret-tool", "store", `--label=${service}`, "service", service, "account", account],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
    );
    proc.stdin.write(value);
    proc.stdin.end();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error("Failed to save secret to system keyring");
    }
    return;
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

export async function deleteSecret(service: string, account: string): Promise<void> {
  const platform = process.platform as Platform;

  if (platform === "darwin") {
    const result = await run(["security", "delete-generic-password", "-s", service, "-a", account]);
    if (result === null) {
      throw new Error("Failed to delete secret from macOS Keychain");
    }
    return;
  }

  if (platform === "linux") {
    const result = await run(["secret-tool", "clear", "service", service, "account", account]);
    if (result === null) {
      throw new Error("Failed to delete secret from system keyring");
    }
    return;
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

export async function isKeyringAvailable(): Promise<boolean> {
  const platform = process.platform as Platform;

  if (platform === "darwin") {
    return (await run(["which", "security"])) !== null;
  }

  if (platform === "linux") {
    return (await run(["which", "secret-tool"])) !== null;
  }

  return false;
}
