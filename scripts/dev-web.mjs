import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 5173;

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function send404(res) {
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end("Not found");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const candidate = path.resolve(root, `.${pathname}`);
  if (!candidate.startsWith(root)) {
    send404(res);
    return;
  }

  try {
    const info = await stat(candidate);
    if (!info.isFile()) {
      send404(res);
      return;
    }
    const ext = path.extname(candidate);
    res.writeHead(200, {
      "content-type": MIME.get(ext) ?? "application/octet-stream",
      "cache-control": "no-store, no-cache, must-revalidate",
    });
    createReadStream(candidate).pipe(res);
  } catch {
    send404(res);
  }
});

server.listen(port, () => {
  console.log(`Angle Protocol web dev server listening on http://127.0.0.1:${port}`);
});
