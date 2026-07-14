/*
 * static-server.js -- a minimal correct-MIME static file server, for envs that
 * exercise BUILT artifacts directly instead of going through the CPO server.
 *
 * Serves one or more root directories (first root containing the file wins)
 * plus explicit path aliases (e.g. "/editor" -> "/editor.embed.html"), on an
 * ephemeral localhost port.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const TYPES = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
  ".arr": "text/plain",
};

function contentType(p) {
  return TYPES[path.extname(p).toLowerCase()] || "application/octet-stream";
}

/*
 * opts:
 *   roots    - array of directories to serve, searched in order
 *   aliases  - {urlPath: urlPath} rewrites applied before the root lookup
 * returns { origin, close }
 */
async function startStaticServer(opts) {
  const roots = opts.roots.map((r) => path.resolve(r));
  const aliases = opts.aliases || {};

  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch (e) {
      res.writeHead(400).end("bad request");
      return;
    }
    if (pathname in aliases) pathname = aliases[pathname];
    const rel = pathname.replace(/^\/+/, "");

    for (const root of roots) {
      const filePath = path.resolve(root, rel);
      if (filePath !== root && !filePath.startsWith(root + path.sep)) continue;
      let st;
      try {
        st = fs.statSync(filePath);
      } catch (e) {
        continue;
      }
      if (!st.isFile()) continue;
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found: " + pathname);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { startStaticServer };
