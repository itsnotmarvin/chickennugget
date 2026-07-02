import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import os from "node:os";
import { constants as fsConstants } from "node:fs";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findCachedWrangler() {
  const cacheRoot = path.join(os.homedir(), ".npm", "_npx");
  let dirs = [];
  try {
    dirs = await readdir(cacheRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of dirs) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(cacheRoot, entry.name, "node_modules", ".bin", "wrangler");
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function resolveWrangler() {
  const local = path.resolve("node_modules", ".bin", "wrangler");
  if (await exists(local)) return { cmd: local, args: [] };

  const cached = await findCachedWrangler();
  if (cached) return { cmd: cached, args: [] };

  return {
    cmd: "npx",
    args: ["--yes", "wrangler@latest"],
  };
}

async function pathWritable(targetPath) {
  try {
    await access(targetPath, fsConstants.W_OK);
    return true;
  } catch {
    let probe = path.dirname(targetPath);
    while (probe && probe !== path.dirname(probe)) {
      try {
        await access(probe, fsConstants.W_OK);
        return true;
      } catch {
        probe = path.dirname(probe);
      }
    }
    return false;
  }
}

async function defaultWranglerHomeWritable() {
  if (process.env.WRANGLER_HOME) {
    return true;
  }
  const home = os.homedir();
  const candidates = [
    path.join(home, ".wrangler"),
    path.join(home, ".config", ".wrangler"),
  ];
  for (const candidate of candidates) {
    if (await pathWritable(candidate)) {
      return true;
    }
  }
  return false;
}

const { cmd, args } = await resolveWrangler();
const [, , ...forwardArgs] = process.argv;
const childArgs = [...args, ...forwardArgs];
if (forwardArgs[0] === "dev" && !forwardArgs.includes("--inspector-port")) {
  childArgs.push("--inspector-port", "0");
}
const childEnv = {
  ...process.env,
};
if (!(await defaultWranglerHomeWritable())) {
  childEnv.WRANGLER_HOME = path.resolve(".wrangler-home");
}
const child = spawn(cmd, childArgs, {
  stdio: "inherit",
  env: childEnv,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
