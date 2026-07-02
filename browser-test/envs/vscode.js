/*
 * Environment adapter: the vscode extension's webview.
 *
 * Boots real VS Code for the Web (headless, via @vscode/test-web in
 * "server only" mode) with the vscode/ extension loaded as a dev extension over
 * a one-file workspace, drives it with Playwright to open test.arr in the
 * pyret-parley.cpo custom editor, and returns the webview's editor frame.
 *
 * Does NOT need the CPO server -- @vscode/test-web serves the editor assets out
 * of the built extension (vscode/dist/web/build/web).
 */
const path = require("path");
const { open } = require("@vscode/test-web");
const { launchChromium } = require("../shared/browser");
const { findEditorFrame } = require("../shared/find-frame");

const VSCODE_DIR = path.resolve(__dirname, "..", "..", "vscode");
// PYRET_COMPILER=ts opens the workspace whose .vscode/settings.json sets
// "pyret-parley.compiler": "ts", so the webview boots the TS-compiler flavor
// of the editor; the default workspace leaves the setting at its default.
const COMPILER = process.env.PYRET_COMPILER || "pyret";
const WORKSPACE = path.resolve(__dirname, "..", "vscode",
  COMPILER === "ts" ? "fixture-workspace-ts" : "fixture-workspace");
const PORT = parseInt(process.env.VSCODE_TEST_PORT || "3198", 10);

async function setup() {
  const server = await open({
    browserType: "none",
    extensionDevelopmentPath: VSCODE_DIR,
    folderPath: WORKSPACE,
    port: PORT,
    quality: "stable",
    esm: true,
    printServerLog: false,
  });
  const endpoint = "http://localhost:" + PORT;

  const browser = await launchChromium();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  await page.goto(endpoint, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(".monaco-workbench", { timeout: 120000 });
  await page.waitForTimeout(4000);

  // Open the .arr file from the Explorer (Quick Open doesn't index the in-memory
  // test FS, but the Explorer tree does). This triggers the custom editor.
  await page.keyboard.press("Control+Shift+E");
  await page.waitForTimeout(2000);
  const clicked = await page.evaluate(() => {
    const r = Array.from(document.querySelectorAll(".monaco-list-row"))
      .find((x) => /test\.arr/.test(x.getAttribute("aria-label") || x.textContent || ""));
    if (r) { r.scrollIntoView(); r.click(); r.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); return true; }
    return false;
  });
  if (!clicked) throw new Error("could not find test.arr in the VS Code Explorer");

  const frame = await findEditorFrame(page);
  return {
    page,
    frame,
    cleanup: async () => { await browser.close(); server.dispose(); },
  };
}

module.exports = { setup, label: `vscode pyret-parley.cpo webview (${COMPILER} compiler)` };
