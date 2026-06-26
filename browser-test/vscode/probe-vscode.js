/*
 * probe-vscode.js -- diagnostic probe for booting VS Code Web + opening the
 * Pyret custom editor + locating the webview content frame.
 */
const path = require("path");
const { open } = require("@vscode/test-web");
const { chromium } = require("playwright");

const VSCODE_DIR = path.resolve(__dirname, "..", "..", "vscode");
const WORKSPACE = path.resolve(__dirname, "fixture-workspace");
const CHROME = process.env.GOOGLE_CHROME_BINARY || "/bin/google-chrome";
const PORT = parseInt(process.env.VSCODE_TEST_PORT || "3199", 10);
const SHOT = path.resolve(__dirname, "..", "results", "vscode-probe.png");

async function dumpState(page, label) {
  console.log("---- state:", label, "----");
  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".tabs-container .tab")).map((t) => t.getAttribute("aria-label") || t.textContent)
  );
  console.log("editor tabs:", JSON.stringify(tabs));
  const iframes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("iframe")).map((f) => ({ cls: f.className, src: (f.getAttribute("src") || "").slice(0, 60) }))
  );
  console.log("iframes:", JSON.stringify(iframes));
  console.log("frames:", page.frames().length);
  for (const f of page.frames()) console.log("   *", f.url().slice(0, 90));
}

(async () => {
  const server = await open({
    browserType: "none", extensionDevelopmentPath: VSCODE_DIR, folderPath: WORKSPACE,
    port: PORT, quality: "stable", esm: true, printServerLog: false,
  });
  const endpoint = "http://localhost:" + PORT;
  console.log("Server up at", endpoint);

  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  page.on("console", (m) => { if (/error/i.test(m.type())) console.log("[page error]", m.text().slice(0, 160)); });

  try {
    await page.goto(endpoint, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".monaco-workbench", { timeout: 90000 });
    console.log("Workbench loaded.");
    await page.waitForTimeout(4000);
    const title = await page.title();
    console.log("window title:", title);
    await dumpState(page, "after-load");

    // Open the Explorer and dump the file tree.
    await page.keyboard.press("Control+Shift+E");
    await page.waitForTimeout(2500);
    const explorerRows = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".explorer-folders-view .monaco-list-row, .monaco-list-row"))
        .map((r) => (r.getAttribute("aria-label") || r.textContent || "").slice(0, 50))
        .filter((s) => s.trim().length)
        .slice(0, 30)
    );
    console.log("explorer rows:", JSON.stringify(explorerRows));

    // Try clicking a row that looks like test.arr.
    const clicked = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".monaco-list-row"));
      const r = rows.find((x) => /test\.arr/.test(x.getAttribute("aria-label") || x.textContent || ""));
      if (r) { r.scrollIntoView(); r.click(); return true; }
      return false;
    });
    console.log("clicked test.arr row:", clicked);
    if (clicked) {
      // double-click to open in some cases
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll(".monaco-list-row"));
        const r = rows.find((x) => /test\.arr/.test(x.getAttribute("aria-label") || x.textContent || ""));
        if (r) { const ev = new MouseEvent("dblclick", { bubbles: true }); r.dispatchEvent(ev); }
      });
    }
    await page.waitForTimeout(6000);
    await dumpState(page, "after-open");

    // Find the webview content frame that holds the CPO editor.
    console.log("Searching for editor frame with #runButton...");
    let editorFrame = null;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && !editorFrame) {
      for (const f of page.frames()) {
        try {
          if (await f.evaluate(() => !!document.getElementById("runButton"))) { editorFrame = f; break; }
        } catch (e) {}
      }
      if (!editorFrame) await page.waitForTimeout(500);
    }
    if (!editorFrame) throw new Error("no editor frame with #runButton");
    console.log("Editor frame:", editorFrame.url().slice(0, 80));

    // Wait for Pyret to finish loading inside the webview.
    await editorFrame.waitForFunction(() => {
      const l = document.getElementById("loader");
      const cm = document.querySelector(".CodeMirror");
      return (!l || getComputedStyle(l).display === "none") && cm && cm.CodeMirror;
    }, undefined, { timeout: 90000, polling: 200 });

    const info = await editorFrame.evaluate(() => ({
      hasRun: !!document.getElementById("runButton"),
      hasOutput: !!document.getElementById("output"),
      hasBreak: !!document.getElementById("breakButton"),
      cmValue: (document.querySelector(".CodeMirror").CodeMirror.getValue() || "").slice(0, 40),
    }));
    console.log("EDITOR FRAME READY:", JSON.stringify(info));
    console.log("PROBE OK");

    await page.screenshot({ path: SHOT, fullPage: false });
    console.log("screenshot ->", SHOT);
  } catch (e) {
    console.error("PROBE ERROR:", e.message);
    try { await page.screenshot({ path: SHOT }); } catch (_) {}
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.dispose();
  }
})();
