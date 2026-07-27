/*
 * static-server.js -- a minimal correct-MIME static file server, for envs that
 * exercise BUILT artifacts directly instead of going through the CPO server.
 *
 * Serves one or more root directories (first root containing the file wins)
 * on an ephemeral localhost port.
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
 *   roots  - array of directories to serve, searched in order
 *   host   - address to advertise in `origin` (default 127.0.0.1). Anything
 *            other than 127.0.0.1 also widens the bind to 0.0.0.0, because the
 *            point of overriding it is to be reachable from another machine.
 * returns { origin, close }
 *
 * PYRET_STATIC_HOST is the env-var form of `host`. It exists for running the
 * browser somewhere other than this machine -- notably Safari in a VM
 * (PYRET_BROWSER=safari): a loopback-bound fixture server is unreachable from
 * the guest, whose 127.0.0.1 is its own, so url-file fixtures fetched from here
 * hang rather than fail, and the specs time out. Same-machine runs (Chromium,
 * and Safari on a macOS CI runner) need none of this and keep the default.
 */
async function startStaticServer(opts) {
  const roots = opts.roots.map((r) => path.resolve(r));
  const host = opts.host || process.env.PYRET_STATIC_HOST || "127.0.0.1";
  const bind = host === "127.0.0.1" ? "127.0.0.1" : "0.0.0.0";

  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch (e) {
      res.writeHead(400).end("bad request");
      return;
    }
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
      // Allow-origin because the editor is rarely same-origin with this server:
      // each env serves the editor from its own origin, so anything fetched here
      // (notably url-file fixtures) is a cross-origin request. raw.github-
      // usercontent.com, the host the url-import tests are otherwise written
      // against, answers with the same header -- without it those imports fail
      // with an opaque "TypeError: Failed to fetch".
      res.writeHead(200, {
        "Content-Type": contentType(filePath),
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    res.writeHead(404, {
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "*",
    }).end("not found: " + pathname);
  });

  await new Promise((resolve) => server.listen(0, bind, resolve));
  return {
    origin: "http://" + host + ":" + server.address().port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { startStaticServer };
