import { run, getHistoryPath, parseHistoryLine } from "./shell";

const SAFE_ENV_VARS = new Set([
  "PATH",
  "SHELL",
  "HOME",
  "USER",
  "LANG",
  "EDITOR",
  "TERM",
  "NODE_ENV",
  "BUN_ENV",
  "GOPATH",
  "JAVA_HOME",
  "PYTHON",
  "VIRTUAL_ENV",
]);

const INTERESTING_PROCESSES = new Set([
  "node",
  "bun",
  "deno",
  "python",
  "python3",
  "docker",
  "dockerd",
  "postgres",
  "postgresql",
  "mysql",
  "mysqld",
  "redis",
  "redis-server",
  "nginx",
  "apache",
  "httpd",
  "java",
  "go",
  "ruby",
  "cargo",
  "rustc",
  "php",
  "mongod",
  "mongos",
  "pm2",
  "uvicorn",
  "gunicorn",
  "next",
  "vite",
  "webpack",
  "esbuild",
  "tsx",
  "ts-node",
  "npx",
  "pnpm",
  "yarn",
  "npm",
]);

function section(label: string, content: string): string {
  return `## ${label}\n${content}\n`;
}

async function getSystemInfo(): Promise<string> {
  const os = process.platform;
  const arch = process.arch;
  const shell = process.env.SHELL || "unknown";
  const cwd = process.cwd();
  return section(
    "System",
    `OS: ${os}\nArch: ${arch}\nShell: ${shell}\nCWD: ${cwd}`,
  );
}

async function getGitInfo(): Promise<string | null> {
  const branch = await run(["git", "branch", "--show-current"]);
  if (branch === null) return null;

  const status = await run(["git", "status", "--short"]);
  let content = `Branch: ${branch}`;
  if (status) {
    content += `\n${status}`;
  } else {
    content += "\nWorking tree clean";
  }
  return section("Git", content);
}

async function getProcesses(): Promise<string | null> {
  const raw = await run(["ps", "x", "-o", "pid,comm"]);
  if (!raw) return null;

  const lines = raw.split("\n");
  const header = lines[0];
  const matches = lines.slice(1).filter((line) => {
    const lower = line.toLowerCase();
    for (const name of INTERESTING_PROCESSES) {
      if (lower.includes(name)) return true;
    }
    return false;
  });

  if (matches.length === 0) return null;
  return section("Running Processes (filtered)", `${header}\n${matches.join("\n")}`);
}

async function getListeningPorts(): Promise<string | null> {
  const raw = await run(["lsof", "-iTCP", "-sTCP:LISTEN", "-P", "-n"]);
  if (!raw) return null;
  return section("Listening Ports", raw);
}

async function getDockerContainers(): Promise<string | null> {
  const raw = await run([
    "docker",
    "ps",
    "--format",
    "{{.Names}}\t{{.Status}}\t{{.Ports}}",
  ]);
  if (!raw) return null;
  return section("Docker Containers", raw);
}

async function getDirectoryListing(): Promise<string | null> {
  const raw = await run(["ls", "-la"]);
  if (!raw) return null;
  return section("Directory Listing (cwd)", raw);
}

async function getShellHistory(count: number = 20): Promise<string | null> {
  try {
    const historyPath = getHistoryPath();
    if (!historyPath) return null;

    const raw = await run(["tail", "-n", String(count), historyPath]);
    if (!raw) return null;

    const lines = raw.split("\n").filter((l) => l.length > 0);
    const cleaned = lines.map(parseHistoryLine);

    if (cleaned.length === 0) return null;
    return section(`Recent Shell History (~${count} entries)`, cleaned.join("\n"));
  } catch {
    return null;
  }
}

function getEnvironmentVariables(): string {
  const env = process.env;
  const lines: string[] = [];

  // Safe vars first, with full values
  for (const name of SAFE_ENV_VARS) {
    const value = env[name];
    if (value !== undefined) {
      lines.push(`${name}=${value}`);
    }
  }

  // All other env var names, redacted
  const otherNames = Object.keys(env)
    .filter((name) => !SAFE_ENV_VARS.has(name))
    .sort();

  for (const name of otherNames) {
    lines.push(`${name}=[redacted — run echo $${name} if needed]`);
  }

  return section("Environment Variables", lines.join("\n"));
}

export interface GatherContextOptions {
  terminalOutput?: string | null;
  lastCommand?: string | null;
  doctor?: boolean;
}

export async function gatherContext(options?: GatherContextOptions): Promise<string> {
  const historyCount = options?.doctor ? 50 : 20;

  const [system, git, processes, ports, docker, dirListing, history] =
    await Promise.all([
      getSystemInfo(),
      getGitInfo(),
      getProcesses(),
      getListeningPorts(),
      getDockerContainers(),
      getDirectoryListing(),
      getShellHistory(historyCount),
    ]);

  const env = getEnvironmentVariables();

  const sections = [system, git, processes, ports, docker, dirListing, history, env].filter(
    (s): s is string => s !== null,
  );

  // Doctor mode: prepend terminal output and last command
  if (options?.terminalOutput) {
    sections.unshift(section("Terminal Output (recent scrollback)", options.terminalOutput));
  }
  if (options?.lastCommand) {
    sections.unshift(section("Last Command", options.lastCommand));
  }

  return sections.join("\n");
}
