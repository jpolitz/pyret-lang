/*
 * make-template.js <template> [dotenv-file]
 *
 * Build-time render of a template with values from the environment (after
 * loading .env), or -- when a dotenv file is given, as the editor.embed.html
 * rule does with .env.embed -- from exactly that file.
 *
 * The dictionary is exactly the variables the template references (see
 * substitute-vars.js): each one takes its value from the config, or "" when
 * absent. Absent-means-blank is the intended semantics for static builds --
 * e.g. CSRF_TOKEN or HASH_OPTIONS only ever exist on the server -- but it is
 * now scoped to the template's own variables instead of letting the whole
 * process environment participate in rendering, and any variable-shaped text
 * that fails to substitute is an error instead of silently surviving.
 */
var file = require('fs');
// Silent suppresses "missing .env file" warning,
// which we want since deploys don't have that file
var dotenv = require('dotenv');
var substVars = require('./src/substitute-vars.js');

dotenv.config({ silent: true });

const replacementConfig = process.argv[3];
let config;
if(replacementConfig !== undefined) {
    const buf = Buffer.from(file.readFileSync(process.argv[3]));
    config = dotenv.parse(buf)
}
else {
    config = process.env;
}

var fileIn = process.argv[2];
var fileContents = String(file.readFileSync(fileIn));

const vars = {};
for (const name of substVars.findVars(fileContents)) {
    vars[name] = config[name] !== undefined ? config[name] : "";
}
// The runtime preload line (was the {{^PYRET_GZIPPED}} section): emitted
// unless the config says the runtime is gzipped-in-JS (mustache truthiness:
// any non-empty string suppressed the section).
if ('PYRET_PRELOAD' in vars) {
    vars.PYRET_PRELOAD = substVars.pyretPreloadTag(config.PYRET, config.PYRET_GZIPPED);
}

process.stdout.write(substVars.substituteVars(fileContents, vars));
