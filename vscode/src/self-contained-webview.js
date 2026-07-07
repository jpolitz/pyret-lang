/*
 * self-contained-webview.js
 *
 * Transforms the rendered CPO `editor.html` into a webview page that boots
 * WITHOUT depending on any origin serving its resources with an executable MIME
 * type -- which is what breaks the extension in the GitLab Web IDE, where the
 * webview's resources resolve to Open VSX and come back as `text/plain` +
 * `nosniff` (so `<script src>`/`<link>` are refused execution) with a ~15MB size
 * cap (so the 37MB `cpo-main.jarr.js` 503s). See browser-test/shared/ovsx-server.js
 * and pyret-parley issue #21.
 *
 * The two facts this exploits:
 *   - The webview HTML string is INJECTED by the extension host, never fetched,
 *     so anything inlined into it always runs.
 *   - `fetch()` ignores script MIME, and Open VSX sends CORS + only caps at
 *     ~15MB, so the 5.6MB gzipped bundle can be fetched and inflated in-page
 *     with the native `DecompressionStream`.
 *
 * So we:
 *   1. Inline every MIME-blocked `<script src>` / `<link rel=stylesheet>` that
 *      runs BEFORE the runtime load, in place (preserving order, since inline
 *      blocks in editor.html depend on their shell deps being loaded).
 *   2. Replace the runtime-load tail (from `beforePyret.js` to `</main>`) with a
 *      bootstrap that fetches `cpo-main.jarr.gz.js`, inflates it via
 *      `DecompressionStream`, publishes it as a Blob URL on `window.PYRET`, then
 *      injects the deferred tail scripts in order -- so when beforePyret reads
 *      `window.PYRET` (beforePyret.js:1480) it's a ready, correctly-typed URL.
 *
 * This is a pure string transform over the rendered HTML; it never edits CPO
 * source, so it doesn't break when beforePyret/editor.html change. It is shared
 * verbatim by the extension (getHtmlForWebview) and the vscode-ovsx test harness.
 */

// Shell scripts that must run (in order) before the runtime bootstrap; inlined
// in place. Anything a synchronous inline block in editor.html depends on must
// be here (localSettings for the theme block, editor-misc for handleClientLoad,
// jquery for the deferred ajaxPrefilter, ...).
const SHELL_JS = [
  "js/vega.min.js",
  "js/vega-tooltip.min.js",
  "js/localSettings.js",
  "js/es6-shim.js",
  "js/jquery.min.js",
  "js/jquery-ui.min.js",
  "js/editor-misc.min.js",
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Inlined JS/CSS is EXECUTED, so the standard `</script`->`<\/script` (and the
// `</style` analogue) escape is safe: in real code the sequence only appears
// inside strings/regex/comments, where the backslash is a no-op or equivalent.
function escapeForScript(s) {
  return s.replace(/<\/(script)/gi, "<\\/$1");
}
function escapeForStyle(s) {
  return s.replace(/<\/(style)/gi, "<\\/$1");
}

// When a stylesheet is inlined into a <style> in the top-level document, its
// relative url(...) references (fonts, images) would resolve against the page
// instead of against .../css/. Rewrite them to absolute BASE/css/... so fonts
// and images still load (fonts/images aren't MIME-blocked, so text/plain is fine
// as long as the path is right).
function absolutizeCssUrls(css, cssDirUrl) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, ref) => {
    const r = ref.trim();
    if (/^(data:|https?:|\/|#)/i.test(r)) return m; // already absolute / data / anchor
    return "url(" + q + cssDirUrl + "/" + r + q + ")";
  });
}

/*
 * html      - the rendered editor.html (mustache already applied)
 * opts.baseUrl  - the URL the webview's resources are served from (BASE_URL)
 * opts.readAsset(relPath) -> string  - read an asset's text at GENERATION time
 *              (e.g. "js/jquery.min.js"); the extension backs this with the
 *              bundled sources, the harness with the served dir.
 */
function makeSelfContained(html, opts) {
  const base = String(opts.baseUrl).replace(/\/+$/, "");
  const readAsset = opts.readAsset;
  const gzUrl = base + "/js/cpo-main.jarr.gz.js";
  let out = html;

  // 1. Drop the runtime <link rel=preload> (it would preload the raw .js from a
  //    MIME-blocked origin; the bootstrap owns runtime loading now).
  out = out.replace(/<link\b[^>]*\brel="preload"[^>]*>\s*/i, "");

  // 2. Inline the pre-runtime shell scripts in place.
  for (const rel of SHELL_JS) {
    const url = base + "/" + rel;
    const re = new RegExp(
      '<script\\b[^>]*\\bsrc="' + escapeRegex(url) + '"[^>]*>\\s*</script>',
      "i"
    );
    if (re.test(out)) {
      let src;
      try {
        src = readAsset(rel);
      } catch (e) {
        continue; // can't read it; leave the tag (it'll just be MIME-blocked)
      }
      // NB: use a function replacer -- the inlined library code is full of `$`
      // (jQuery, vega, ...), and a string replacement would interpret `$&`/`$1`/`$'`.
      const code = "<script>\n" + escapeForScript(src) + "\n</script>";
      out = out.replace(re, () => code);
    }
  }

  // 3. Inline the stylesheet <link>s in place (absolutizing their url()s).
  out = out.replace(
    new RegExp('<link\\b[^>]*\\bhref="' + escapeRegex(base) + '/css/([^"]+)"[^>]*>', "gi"),
    (m, cssRel) => {
      let css;
      try {
        css = readAsset("css/" + cssRel);
      } catch (e) {
        return m; // couldn't read it; leave the link (will just be MIME-blocked)
      }
      const dir = ("css/" + cssRel).replace(/\/[^/]*$/, ""); // e.g. css or css/themes
      return "<style>\n" + escapeForStyle(absolutizeCssUrls(css, base + "/" + dir)) + "\n</style>";
    }
  );

  // 4. Defer the runtime tail (beforePyret.js ... </main>) into a bootstrap.
  const startRe = new RegExp(
    '<script\\b[^>]*\\bsrc="' + escapeRegex(base + "/js/beforePyret.js") + '"[^>]*>\\s*</script>',
    "i"
  );
  const startMatch = out.match(startRe);
  if (!startMatch) return out; // structure changed; nothing to defer
  const startIdx = out.indexOf(startMatch[0]);
  const endIdx = out.indexOf("</main>", startIdx);
  const tail = out.slice(startIdx, endIdx === -1 ? undefined : endIdx);

  // Parse the tail's <script>s in order: src ones (beforePyret, events) become
  // runtime fetches (MIME-immune); inline ones (ajaxPrefilter, URL_FILE_MODE)
  // are embedded as literal code.
  const pieces = [];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(tail))) {
    const srcM = m[1].match(/\bsrc="([^"]+)"/i);
    if (srcM) pieces.push({ f: srcM[1] });
    else pieces.push({ c: m[2] });
  }

  // Ordering fix: on the normal page load these tail scripts run before
  // DOMContentLoaded, so beforePyret's `$(document).ready` callback -- which
  // calls makeEvents() from events.js -- runs only after events.js has loaded.
  // Here they're injected AFTER load, so a ready callback fires synchronously on
  // injection. So events.js (a plain function definition, needing only the
  // already-run POSTMESSAGE_ORIGIN inline) must be injected before beforePyret.
  const eventsIdx = pieces.findIndex((p) => p.f && /\/events\.js(\?|$)/.test(p.f));
  if (eventsIdx > 0) pieces.unshift(pieces.splice(eventsIdx, 1)[0]);

  const bootstrap =
    "<script>\n" +
    escapeForScript(
      "(function(){\n" +
      "  var GZ = " + JSON.stringify(gzUrl) + ";\n" +
      "  var PIECES = " + JSON.stringify(pieces) + ";\n" +
      "  function inject(code){ var s = document.createElement('script'); s.text = code; document.body.appendChild(s); }\n" +
      "  (async function(){\n" +
      "    try {\n" +
      "      var texts = await Promise.all(PIECES.map(function(p){ return ('f' in p) ? fetch(p.f).then(function(r){ return r.text(); }) : Promise.resolve(p.c); }));\n" +
      "      var resp = await fetch(GZ);\n" +
      "      if (!resp.ok) throw new Error('failed to fetch runtime bundle: ' + resp.status);\n" +
      "      var runtime = await new Response(resp.body.pipeThrough(new DecompressionStream('gzip'))).text();\n" +
      "      window.PYRET = URL.createObjectURL(new Blob([runtime], { type: 'application/javascript' }));\n" +
      "      for (var i = 0; i < texts.length; i++) { inject(texts[i]); }\n" +
      "    } catch (e) { console.error('Pyret self-contained bootstrap failed:', e); }\n" +
      "  })();\n" +
      "})();\n"
    ) +
    "</script>\n";

  return out.slice(0, startIdx) + bootstrap + out.slice(endIdx === -1 ? out.length : endIdx);
}

module.exports = { makeSelfContained, SHELL_JS };
