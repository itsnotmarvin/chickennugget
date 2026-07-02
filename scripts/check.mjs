import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const includeRoots = ["js", "shared", "server/src", "scripts"];
const filePaths = [];
const testFiles = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "vendor" || entry.name === "output") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (/\.(js|mjs)$/.test(entry.name)) filePaths.push(fullPath);
  }
}

for (const relative of includeRoots) {
  await walk(path.join(root, relative));
}

await walk(path.join(root, "server/test"));
for (const filePath of filePaths.splice(0)) {
  if (filePath.includes(`${path.sep}server${path.sep}test${path.sep}`)) {
    testFiles.push(filePath);
  } else {
    filePaths.push(filePath);
  }
}

for (const filePath of filePaths.sort()) {
  const result = spawnSync(process.execPath, ["--check", filePath], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const testResult = spawnSync(process.execPath, ["--test", ...testFiles.sort()], {
  cwd: root,
  stdio: "inherit",
});

process.exit(testResult.status ?? 0);
