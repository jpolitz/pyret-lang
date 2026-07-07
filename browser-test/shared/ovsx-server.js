/*
 * ovsx-server.js -- a tiny static server that serves the built vscode extension
 * assets the way Open VSX serves them to the GitLab Web IDE, so we can reproduce
 * (and, once fixed, regression-test) issue #21 without deploying.
 *
 * GitLab Web IDE resolves an extension's webview resources to
 * `open-vsx.org/vscode/unpkg/<pub>/<name>/<ver>/extension/<path>`, and Open VSX
 * serves every file with two hostile properties (both confirmed by curl):
 *   1. `Content-Type: text/plain` + `X-Content-Type-Options: nosniff`, so the
 *      browser refuses to execute any `<script src>` / apply any `<link>` -->
 *      `$ is not defined`, `localSettings is not defined`, etc.
 *   2. a hard size cap (~15MB; 14.2MB serves, 20.1MB 503s) --> the 37MB
 *      `cpo-main.jarr.js` 503s and never loads.
 * `@vscode/test-web` (the normal --env=vscode) serves assets from a local static
 * server with correct MIME and no cap, which is why it never caught this.
 *
 * This server reproduces both. In `hostile` mode (default) it serves every asset
 * as text/plain+nosniff and 503s anything over the cap. In faithful mode
 * (OVSX_FAITHFUL=1) it serves correct content-types with no cap -- that mode
 * should behave like vscode.dev and boot the editor, which validates that the
 * harness plumbing itself is sound and that hostile serving is the only variable.
 *
 * The editor HTML itself is served (at `/__editor__`) as real text/html,
 * regardless of mode: in a real webview that HTML is INJECTED by the extension
 * host (via `pane.webview.html`), not fetched from Open VSX, so only its
 * sub-resources are subject to Open VSX. We mirror `getHtmlForWebview`
 * (pyretCPOWebEditor.ts) by mustache-rendering the same built `editor.html`
 * template with BASE_URL/PYRET pointed at this server.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { makeSelfContained } = require("../../vscode/src/self-contained-webview");

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
};

function contentType(p) {
  return TYPES[path.extname(p).toLowerCase()] || "application/octet-stream";
}

/*
 * Mirror the extension's getHtmlForWebview: mustache-render editor.html with the
 * five vars the extension supplies; every other {{...}} tag renders to "" (what
 * mustache does with an unknown key -- which is exactly why the real webview has
 * `apiKey = ""`, `POSTMESSAGE_ORIGIN = ""`, etc). We support {{VAR}}, {{ VAR }},
 * {{&VAR}} and {{{VAR}}}.
 */
function renderEditorHtml(template, vars) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp("\\{\\{\\{?\\s*&?\\s*" + k + "\\s*\\}?\\}\\}", "g");
    out = out.replace(re, v);
  }
  // Blank any remaining mustache tags (unknown key -> empty string).
  out = out.replace(/\{\{\{?[^{}]*\}?\}\}/g, "");
  return out;
}

const EDITOR_PATH = "/__editor__";

/*
 * opts:
 *   assetRoot  - dir to serve (the extension's dist/web/build/web)
 *   hostile    - true (default): text/plain+nosniff + size cap; false: correct types
 *   capBytes   - hostile size cap (default 15MB)
 * returns { origin, editorPath, close }
 */
async function startOvsxServer(opts) {
  const assetRoot = path.resolve(opts.assetRoot);
  const hostile = opts.hostile !== false;
  const capBytes = opts.capBytes || 15 * 1024 * 1024;

  const templatePath = path.join(assetRoot, "views", "editor.html");
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      "ovsx-server: editor.html template not found at " + templatePath +
        " -- is the extension built? (see browser-test/README.md prereqs)"
    );
  }
  const template = fs.readFileSync(templatePath, "utf8");

  let editorHtml = ""; // filled after listen (needs the origin)

  const server = http.createServer((req, res) => {
    let u;
    try {
      u = new URL(req.url, "http://localhost");
    } catch (e) {
      res.writeHead(400).end("bad request");
      return;
    }

    if (u.pathname === EDITOR_PATH) {
      // The injected webview HTML: always real text/html (not an Open VSX asset).
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(editorHtml);
      return;
    }

    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, "");
    const filePath = path.resolve(assetRoot, rel);
    if (filePath !== assetRoot && !filePath.startsWith(assetRoot + path.sep)) {
      res.writeHead(403, { "Content-Type": "text/plain" }).end("forbidden");
      return;
    }
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
        return;
      }
      if (hostile && st.size > capBytes) {
        // Mimic Open VSX's 503 on oversized files (e.g. the 37MB bundle).
        res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<!doctype html><html><body>Open VSX: resource too large</body></html>");
        return;
      }
      const headers = hostile
        ? { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" }
        : { "Content-Type": contentType(filePath) };
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = "http://127.0.0.1:" + port;

  const rendered = renderEditorHtml(template, {
    BASE_URL: origin, // getHtmlForWebview: asWebviewUri(dist/web/build/web)
    PYRET: origin + "/js/cpo-main.jarr.js",
    HASH_OPTIONS: "", // let editor.html fall back to document.location.hash (set by the env)
    URL_FILE_MODE: "",
    IMAGE_PROXY_BYPASS: "true",
  });
  // Apply the same self-contained transform the fixed extension applies, so this
  // env tests the actual fix. readAsset reads the real bytes off disk (like the
  // extension host does at generation time) -- only the WEBVIEW's later fetches
  // go through the hostile server.
  editorHtml = makeSelfContained(rendered, {
    baseUrl: origin,
    readAsset: (rel) => fs.readFileSync(path.join(assetRoot, rel), "utf8"),
  });

  return {
    origin,
    editorPath: EDITOR_PATH,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { startOvsxServer, renderEditorHtml };
