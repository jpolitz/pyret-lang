/*
 * Environment adapter: the embed API against the BUILT static embed artifact,
 * build/web/editor.embed.html -- no CPO server.
 *
 * --env=embed drives /editor#controlled=true through a running CPO server, so
 * it never loads editor.embed.html: the file an embedding host actually
 * deploys, rendered at build time from .env.embed (BASE_URL=".", relative
 * asset paths, POSTMESSAGE_ORIGIN="*"; see code.pyret.org/make-template.js).
 * This env serves code.pyret.org/build/web from a plain correct-MIME static
 * server (shared/static-server.js) and loads the same test-util embed host
 * page the embed env uses, with /editor aliased to /editor.embed.html so
 * embed1.html works unmodified.
 *
 * What this catches that --env=embed can't: breakage that lives only in the
 * built artifact -- template variables mis-rendered at build time, and asset
 * references that resolve at a server root but 404 under relative/static
 * hosting (e.g. a root-absolute /img/... sneaking back into editor css).
 *
 * Env vars:
 *   EMBED_STATIC_ROOT  override the served build dir
 *                      (default code.pyret.org/build/web)
 */
const path = require("path");
const fs = require("fs");
const { launchChromium } = require("../shared/browser");
const { findEditorFrame } = require("../shared/find-frame");
const { startStaticServer } = require("../shared/static-server");

const CPO_DIR = path.resolve(__dirname, "..", "..", "code.pyret.org");
const BUILD_ROOT = process.env.EMBED_STATIC_ROOT || path.join(CPO_DIR, "build", "web");
const HOST_PAGES_ROOT = path.join(CPO_DIR, "test-util");

async function setup() {
  const artifact = path.join(BUILD_ROOT, "editor.embed.html");
  if (!fs.existsSync(artifact)) {
    throw new Error(
      "embed-static: " + artifact + " not found -- is code.pyret.org built? " +
        "(`npm run build` / `make web` produce it from src/web/editor.html + .env.embed)"
    );
  }

  const server = await startStaticServer({
    roots: [BUILD_ROOT, HOST_PAGES_ROOT],
    // embed1.js points its iframe at `${BASE_URL}/editor#controlled=true`;
    // here "the editor" is the static artifact.
    aliases: { "/editor": "/editor.embed.html" },
  });

  const browser = await launchChromium();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  // Same flow as envs/embed.js, but the host page and the iframe both come
  // from the static server (same origin, so embed-util's same-origin
  // postMessage default works).
  await page.goto(server.origin + "/embed/embed1.html?" + server.origin, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  // Wait for the embedded instance to announce itself (pyret-init).
  await page.waitForFunction(
    () => window.messages &&
      window.messages.filter((m) => m.data.protocol === "pyret" && m.data.data.type === "pyret-init").length === 1,
    undefined,
    { timeout: 60000, polling: 200 }
  );

  // Initialize the controlled editor with a runnable starter context.
  await page.evaluate(() =>
    window.embedAPI.sendReset({
      definitionsAtLastRun: false,
      editorContents: "use context starter2024\n\n",
      replContents: "",
      interactionsSinceLastRun: [],
    })
  );

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

module.exports = {
  setup,
  label: "embed API against the static editor.embed.html artifact (no CPO server)",
};
