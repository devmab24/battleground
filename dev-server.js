// Local dev server (no extra dependencies).
// Serves public/ and runs api/*.js handlers the same way Vercel does
// (Web Request -> Response, one export per HTTP method). Loads .env if present.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "public");
const API_DIR = path.join(HERE, "api");

if (fs.existsSync(path.join(HERE, ".env"))) {
  process.loadEnvFile(path.join(HERE, ".env"));
}

const PORT = process.env.PORT || 3000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

async function handleApi(req, res, urlPath) {
  const name = urlPath.slice("/api/".length);
  const file = path.join(API_DIR, `${name}.js`);
  if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }

  const mod = await import(pathToFileURL(file).href);
  const handler = mod[req.method];
  if (typeof handler !== "function") {
    res.writeHead(405, { "Content-Type": "text/plain" }).end("Method not allowed");
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
  }
  // Like Vercel: the server decides the client IP, not the client.
  headers.set("x-forwarded-for", req.socket.remoteAddress ?? "unknown");

  const request = new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });

  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function serveStatic(res, urlPath) {
  const filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);

  // Block path traversal outside public/.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    const type = TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type }).end(data);
  });
}

http
  .createServer(async (req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath.startsWith("/api/")) {
      try {
        await handleApi(req, res, urlPath);
      } catch (err) {
        console.error(err);
        if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal server error");
      }
      return;
    }
    serveStatic(res, urlPath);
  })
  .listen(PORT, () => console.log(`Battleground running at http://localhost:${PORT}`));
