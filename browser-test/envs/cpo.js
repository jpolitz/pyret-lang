/*
 * Environment adapter: code.pyret.org /editor (the reference environment).
 *
 * Running the assertions here reproduces the upstream mocha suite's outcomes on
 * the real /editor page -- the role the old fidelity check played. Needs the CPO
 * server running at BASE_URL.
 *
 * This is the one env that supports a non-Chromium browser (PYRET_BROWSER=safari),
 * because it is also the simplest: same-origin, no init scripts, and the editor
 * is the main frame. Note that BASE_URL must be an address the browser can reach
 * -- for Safari in a VM that is the host's address on the VM's subnet, not
 * localhost, and the CPO server has to have been STARTED with that BASE_URL
 * since it is baked into the served page.
 */
const { launchEditorSession } = require("../shared/browser");

const BASE_URL = process.env.BASE_URL || "http://localhost:4999";

async function setup() {
  return launchEditorSession(BASE_URL + "/editor");
}

module.exports = { setup, label: "code.pyret.org /editor (reference)" };
