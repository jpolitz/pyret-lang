/*
 * Environment adapter: the vscode webview served the way the GitLab Web IDE gets
 * it from Open VSX -- the reproduction for issue #21.
 *
 * Unlike --env=vscode (which boots real VS Code via @vscode/test-web and serves
 * assets from a local static server with correct MIME), this env serves the
 * built extension assets through shared/ovsx-server.js, which mimics Open VSX:
 * text/plain + nosniff on every asset and a ~15MB size cap (see that file). The
 * editor HTML is rendered exactly as getHtmlForWebview does, with BASE_URL/PYRET
 * pointed at that hostile server.
 *
 * It does NOT boot VS Code. Instead it:
 *   - injects a no-op `acquireVsCodeApi`, so beforePyret takes the real vscode
 *     branch (`window.PYRET_IN_VSCODE = true`) -- the exact code path the fix
 *     will change -- rather than the embed/standalone branch; and
 *   - passes `initialState` in the URL hash, so events.js `makeEvents` self-
 *     resets the editor and calls gainControl locally (onLoad), giving non-empty
 *     CodeMirror content + an editable editor without a live host round-trip.
 *     (editorReady requires cmValue() !== "", so this is what gets us there.)
 *
 * Modes (env vars):
 *   default          hostile serving -> reproduces #21 (RED until the fix lands)
 *   OVSX_FAITHFUL=1  correct MIME, no cap -> should behave like vscode.dev (GREEN);
 *                    validates the harness plumbing itself
 *   OVSX_ASSET_ROOT  override the served dir (default vscode/dist/web/build/web)
 *   OVSX_CAP_MB      hostile size cap in MB (default 15)
 */
const path = require("path");
const { launchChromium } = require("../shared/browser");
const { findEditorFrame } = require("../shared/find-frame");
const { startOvsxServer } = require("../shared/ovsx-server");
const { ProceduralError } = require("../shared/errors");

const VSCODE_DIR = path.resolve(__dirname, "..", "..", "vscode");
const ASSET_ROOT =
  process.env.OVSX_ASSET_ROOT || path.join(VSCODE_DIR, "dist", "web", "build", "web");
const HOSTILE = !process.env.OVSX_FAITHFUL;
const CAP_MB = parseInt(process.env.OVSX_CAP_MB || "15", 10);

// A runnable starter state, matching the embed env's sendReset. definitionsAtLastRun
// is false so reset() runs the empty program once at load (a warm start).
const INITIAL_STATE = JSON.stringify({
  editorContents: "use context starter2024\n\n",
  definitionsAtLastRun: false,
  interactionsSinceLastRun: [],
  replContents: "",
});

async function setup() {
  const server = await startOvsxServer({
    assetRoot: ASSET_ROOT,
    hostile: HOSTILE,
    capBytes: CAP_MB * 1024 * 1024,
  });

  const browser = await launchChromium();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  // Take the real vscode branch. The host is a no-op; content + control come from
  // the initialState URL param (see file header).
  await page.addInitScript(() => {
    let vscodeState;
    window.acquireVsCodeApi = function () {
      return {
        postMessage() {},
        getState() { return vscodeState; },
        setState(s) { vscodeState = s; return s; },
      };
    };
  });

  const hash =
    "#footerStyle=hide&hideInteractions=true&theme=default&initialState=" +
    encodeURIComponent(INITIAL_STATE);
  await page.goto(server.origin + server.editorPath + hash, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  // #runButton is a static element in editor.html, so findEditorFrame succeeds
  // even when scripts are blocked. Do a bounded check for the runtime actually
  // coming up so hostile mode fails fast with a clear message (rather than the
  // before() hook's editorReady wait timing out at 120s two minutes later).
  // jQuery loads near-instantly when not MIME-blocked, so this never trips in
  // faithful mode.
  try {
    await page.waitForFunction(() => typeof window.$ !== "undefined", null, {
      timeout: 30000,
      polling: 250,
    });
  } catch (e) {
    if (HOSTILE) {
      throw new ProceduralError(
        "editor scripts never executed (window.$ undefined) -- reproduces issue #21: " +
          "Open VSX serves assets as text/plain+nosniff so the webview refuses to run them. " +
          "This env is RED until the gzip+inline fix lands."
      );
    }
    throw e; // faithful mode: an unexpected boot failure, surface it
  }

  const frame = await findEditorFrame(page);
  return {
    page,
    frame,
    cleanup: async () => {
      await browser.close();
      await server.close();
    },
  };
}

const label =
  "vscode webview over simulated Open VSX (" +
  (HOSTILE ? "hostile: text/plain+nosniff, " + CAP_MB + "MB cap" : "faithful: correct MIME") +
  ")";

module.exports = { setup, label };
