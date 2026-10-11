import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");
const repo = path.resolve(app, "../..");
const site = path.resolve(process.env.SIDEVOICE_STATIC_SITE || path.join(repo, ".playwright-static-web"));
const entry = path.join(site, "voice", "index.html");

if (!existsSync(entry)) {
  const assembled = spawnSync(process.execPath, [path.join(repo, "scripts/assemble-static-web.mjs"), site], { cwd: repo, stdio: "inherit" });
  if (assembled.status !== 0 || !existsSync(entry)) process.exit(assembled.status || 1);
}

const mime = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"], [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".png", "image/png"], [".svg", "image/svg+xml"], [".wasm", "application/wasm"], [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1:4173").pathname); }
  catch { response.writeHead(400).end(); return; }
  if (pathname === "/voice") { response.writeHead(308, { location: "/voice/" }).end(); return; }
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.resolve(site, `.${pathname}`);
  if (file !== site && !file.startsWith(site + path.sep)) { response.writeHead(403).end(); return; }
  try {
    if (!statSync(file).isFile()) { response.writeHead(404).end(); return; }
  } catch { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": mime.get(path.extname(file)) || "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(response);
}).listen(4173, "127.0.0.1");
