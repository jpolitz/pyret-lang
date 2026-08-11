/*
 * Environment adapter: the vscode extension's webview.
 *
 * Boots real VS Code for the Web (headless, via @vscode/test-web in
 * "server only" mode) with the vscode/ extension loaded as a dev extension over
 * the fixture workspace, drives it with Playwright to open algebra-2/test.arr in
 * the pyret-parley.cpo custom editor, and returns the webview's editor frame.
 *
 * Does NOT need the CPO server -- @vscode/test-web serves the editor assets out
 * of the built extension (vscode/dist/web/build/web).
 */
const path = require("path");
const { open } = require("@vscode/test-web");
const { launchChromium, wireBrowserLogs } = require("../shared/browser");
const { findEditorFrame } = require("../shared/find-frame");
const { resourceScope } = require("../shared/resource-scope");

const VSCODE_DIR = path.resolve(__dirname, "..", "..", "vscode");
// PYRET_COMPILER=ts opens the workspace whose .vscode/settings.json sets
// "pyret-parley.compiler": "ts", so the webview boots the TS-compiler flavor
// of the editor; the default workspace leaves the setting at its default.
const COMPILER = process.env.PYRET_COMPILER || "pyret";
const WORKSPACE = path.resolve(__dirname, "..", "vscode",
  COMPILER === "ts" ? "fixture-workspace-ts" : "fixture-workspace");
const PORT = parseInt(process.env.VSCODE_TEST_PORT || "3198", 10);

// test-web serves `folderPath` as this virtual FS (see its mounts.js).
const MOUNT = "vscode-test-web://mount";
// The tab sits in algebra-2/ rather than at the workspace root so the suite's
// "../libraries/..." imports traverse to a real sibling directory INSIDE the
// workspace -- that traversal is the shape load-path tracking has to get right.
const FILE = "/algebra-2/test.arr";

/*
 * Read the extension's lifecycle markers out of the workbench status bar (see
 * vscode/src/diagnostics.ts; the fixture workspaces turn them on).
 *
 * Which markers are present separates the two ways this env fails. No
 * `activate` at all means the extension never woke up, so nothing ever
 * registered a provider for pyret-parley.cpo -- the open raced activation.
 * `activate` + `provider-registered` but no `resolve-enter` means VS Code had
 * a provider and never asked it to resolve. `resolve-enter` without
 * `resolve-done` means the resolve itself hung inside makePyretPane.
 */
async function readLifecycleMarkers(page) {
  try {
    return await page.evaluate(() => {
      const PREFIX = "PYRET-DIAG";
      const hits = Array.from(document.querySelectorAll(".statusbar-item"))
        .map((s) => (s.textContent || "").trim())
        .filter((t) => t.indexOf(PREFIX) === 0);
      if (hits.length > 0) { return hits; }
      // The status bar's markup is VS Code's, not ours, so don't let a class
      // rename turn "the extension never activated" into "no markers found".
      // Fall back to any leaf element carrying the prefix, and say which path
      // produced the answer so an empty result is unambiguous.
      const anywhere = [];
      document.querySelectorAll("*").forEach((el) => {
        if (el.children.length !== 0) { return; }
        const t = (el.textContent || "").trim();
        if (t.indexOf(PREFIX) === 0) { anywhere.push(t); }
      });
      return anywhere.length > 0
        ? anywhere.map((t) => t + " (via full-document scan)")
        : ["<none: no " + PREFIX + " markers anywhere in the workbench DOM>"];
    });
  } catch (e) {
    return ["<unreadable: " + e.message + ">"];
  }
}

async function setup() {
  const scope = resourceScope();
  try {
    const server = await open({
      browserType: "none",
      extensionDevelopmentPath: VSCODE_DIR,
      folderPath: WORKSPACE,
      port: PORT,
      quality: "stable",
      // Pinned build, not "latest stable": VS Code 1.130.0 (shipped 2026-07-22)
      // intermittently never resolves the custom editor in dev-extension mode
      // (see the commit message that added this line for the upstream trail).
      // This commit is 1.129.1, the last build this suite was green on.
      commit: "8a7abeba6e03ea3af87bfbce9a1b7e48fed567b8",
      esm: true,
      printServerLog: false,
    });
    scope.add(() => server.dispose());
    const endpoint = "http://localhost:" + PORT;

    const browser = await launchChromium();
    scope.add(() => browser.close());
    const page = await browser.newPage();
    wireBrowserLogs(page);
    page.setDefaultTimeout(60000);

    // Open the file directly via the workbench's `payload` query param, the same
    // mechanism vscode.dev uses for deep links -- no Explorer/Quick Open driving.
    // folderPath is served as the virtual FS 'vscode-test-web://mount', so a file
    // inside it addresses as mount/<relative path>. Opening it triggers the
    // pyret-parley.cpo custom editor.
    const payload = JSON.stringify([["openFile", MOUNT + FILE]]);
    const tNav = Date.now();
    await page.goto(endpoint + "?payload=" + encodeURIComponent(payload),
      { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector(".monaco-workbench", { timeout: 120000 });
    const tWorkbench = Date.now();

    // Bounded, and loud about WHY. A missing editor frame here used to be a
    // silent 120s poll ending in "not found within timeout", which says nothing
    // about whether the file opened at all, opened in the wrong editor, or
    // opened in the custom editor whose webview then failed to load.
    // PYRET_BOOT_TIMEOUT dials it down while debugging.
    //
    // The bound matches the goto/workbench waits above rather than being tighter
    // than them: a 2-core GitHub runner routinely needs more than 30s to boot
    // this webview (30s was green on a dev box and red on every CI run), and the
    // point of the bound is to fail with the diagnostics below instead of
    // hanging, not to police how slow a cold runner is allowed to be.
    const bootTimeout = parseInt(process.env.PYRET_BOOT_TIMEOUT || "120000", 10);
    let frame;
    try {
      frame = await findEditorFrame(page, bootTimeout);
    } catch (e) {
      const diag = await page.evaluate(() => ({
        openTabs: Array.from(document.querySelectorAll(".tabs-container .tab"))
          .map((t) => (t.getAttribute("aria-label") || t.textContent || "").trim()),
        placeholder: (document.querySelector(".editor-placeholder") || {}).textContent || null,
        notifications: Array.from(document.querySelectorAll(".notification-list-item-message"))
          .map((n) => (n.textContent || "").trim()),
        explorerRows: Array.from(document.querySelectorAll(".monaco-list-row"))
          .map((r) => (r.getAttribute("aria-label") || "").trim()).filter(Boolean),
      }));
      diag.frameUrls = page.frames().map((f) => f.url());
      diag.lifecycle = await readLifecycleMarkers(page);
      diag.timings = { navToWorkbenchMs: tWorkbench - tNav, gaveUpAfterMs: Date.now() - tWorkbench };
      throw new Error(
        "vscode env: no editor frame after " + bootTimeout + "ms opening " + FILE + "\n" +
        JSON.stringify(diag, null, 2)
      );
    }
    // Print the same markers on the way out of a SUCCESSFUL boot: what the
    // healthy ordering and timing look like is exactly the baseline a failing
    // run has to be read against.
    console.log("vscode env lifecycle (ok): " + JSON.stringify({
      markers: await readLifecycleMarkers(page),
      navToWorkbenchMs: tWorkbench - tNav,
      workbenchToFrameMs: Date.now() - tWorkbench,
    }));
    return { page, frame, cleanup: scope.closeAll };
  } catch (e) {
    await scope.closeAll();
    throw e;
  }
}

module.exports = { setup, label: `vscode pyret-parley.cpo webview (${COMPILER} compiler)` };
