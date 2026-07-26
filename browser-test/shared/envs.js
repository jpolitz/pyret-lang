/*
 * envs.js -- the one list of environment names.
 *
 * run.js (CLI validation) and tests/suite.test.js (PYRET_ENV validation) both
 * need it, and they used to keep private copies that drifted. Each name maps to
 * envs/<name>.js.
 */
const ENVS = ["cpo", "webkit", "ios-safari", "embed", "vscode", "vscode-ovsx"];

module.exports = { ENVS };
