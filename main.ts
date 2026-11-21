import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 8082;
const ROOT = fileURLToPath(new URL(".", import.meta.url));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const cleaned = decoded === "/" ? "/index.html" : decoded;
  const resolved = normalize(join(ROOT, cleaned));
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}
const server = http.createServer(async (req, res) => {
  try {
    const file = safePath(req.url || "/");
    if (!file) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    const body = await readFile(file);
    const type = MIME[extname(file)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    res.end(body);
  } catch (err) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found: " + (req.url || ""));
  }
});

server.listen(PORT, () => {
  console.log("MARAVELA: NEON TIDE running at http://localhost:" + PORT + "/");
  console.log("Open the URL in a browser. WASD move/drive, E enter or carjack, F radio, Q crew ability, P pause, M mute.");
});
