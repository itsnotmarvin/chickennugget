import { spawn } from "node:child_process";

const children = [
  spawn("npm", ["run", "dev:web"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev:api"], { stdio: "inherit" }),
];

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) shutdown(code);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
