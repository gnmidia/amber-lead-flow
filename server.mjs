import { createServer } from "node:http";
import { createReadStream, statSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import handler from "./dist/server/server.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_DIR = join(__dirname, "dist", "client");
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

function tryServeStatic(pathname) {
  if (pathname === "/" || pathname.endsWith("/")) return null;
  const safe = normalize(pathname).replace(/^([/\\])+/, "");
  const filePath = join(CLIENT_DIR, safe);
  if (!filePath.startsWith(CLIENT_DIR)) return null;
  if (!existsSync(filePath)) return null;
  const stat = statSync(filePath);
  if (!stat.isFile()) return null;
  return { filePath, stat };
}

function nodeRequestToWebRequest(req) {
  const proto = (req.headers["x-forwarded-proto"] || "http").toString().split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((vv) => headers.append(k, vv));
    else if (v != null) headers.set(k, String(v));
  }
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) return res.end();
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

const server = createServer(async (req, res) => {
  try {
    const pathname = (req.url || "/").split("?")[0];
    const asset = tryServeStatic(pathname);
    if (asset) {
      const ext = extname(asset.filePath).toLowerCase();
      res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
      res.setHeader("Content-Length", asset.stat.size);
      if (pathname.startsWith("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
      createReadStream(asset.filePath).pipe(res);
      return;
    }
    const webReq = nodeRequestToWebRequest(req);
    const webRes = await handler.fetch(webReq);
    await sendWebResponse(res, webRes);
  } catch (err) {
    console.error("[server] error:", err);
    if (!res.headersSent) res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
});
