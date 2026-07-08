/*
 * substitute-vars.js -- dictionary-driven, literal template substitution for
 * the {{VAR}} spellings our templates actually use. Replaces mustache
 * everywhere we render our own templates (the server's views, the
 * self-contained webview build, make-template.js), with two deliberate
 * differences from mustache:
 *
 *  - CLOSED WORLD. Every variable the template references must be a key of
 *    the dictionary; a missing key is an error naming the variable, and
 *    anything variable-shaped left after substitution is an error too.
 *    Mustache silently rendered unknown tags as "", which made a typo
 *    indistinguishable from a deliberately-blank variable. Blank-on-purpose
 *    is expressed by an explicit key with value "" (or undefined/null, which
 *    render "" for mustache compatibility) -- the dictionary documents every
 *    variable's fate. This also removes the reason template rendering had to
 *    be ordered before JS/CSS inlining: mustache's scanner would eat `{{` in
 *    minified JS, whereas these patterns can only match SCREAMING_SNAKE
 *    variables in our own spellings.
 *
 *  - NO CONTROL FLOW. Sections/partials are unsupported. The one conditional
 *    our templates ever had ({{^PYRET_GZIPPED}}, the runtime preload line in
 *    editor.html) became the PYRET_PRELOAD variable, whose value (the whole
 *    <link> tag, or "") each renderer computes in JS where the condition
 *    actually lives.
 *
 * Spellings supported -- the complete set in use across src/web (the tests
 * pin these):
 *   {{VAR}}   {{ VAR }}     HTML-escaped (mustache's exact entity set)
 *   {{&VAR}}  {{ &VAR }}    raw
 *   {{{VAR}}} {{{ VAR }}}   raw
 * Variable names are SCREAMING_SNAKE ([A-Z][A-Z0-9_]*) with at most one
 * space of padding -- deliberately narrow so nothing in JS, CSS, or prose is
 * mistaken for a variable.
 */
"use strict";
const fs = require("fs");

// Triple-brace alternative first so {{{ X }}} can't half-match as {{ X }.
const TAG_RE = /\{\{\{ ?([A-Z][A-Z0-9_]*) ?\}\}\}|\{\{ ?(&)? ?([A-Z][A-Z0-9_]*) ?\}\}/g;

// mustache.js's exact entity map, for byte-compatible escaped output.
const ENTITIES = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  "'": "&#39;", "/": "&#x2F;", "`": "&#x60;", "=": "&#x3D;",
};
function escapeHtml(s) {
  return s.replace(/[&<>"'`=\/]/g, (c) => ENTITIES[c]);
}

/* Every distinct variable name the template references, sorted. */
function findVars(template) {
  const names = new Set();
  for (const m of template.matchAll(TAG_RE)) names.add(m[1] || m[3]);
  return [...names].sort();
}

function substituteVars(template, vars) {
  const missing = new Set();
  const out = template.replace(TAG_RE, (tag, tripleName, amp, doubleName) => {
    const name = tripleName || doubleName;
    if (!(name in vars)) { missing.add(name); return tag; }
    const value = vars[name] == null ? "" : String(vars[name]);
    return (tripleName || amp) ? value : escapeHtml(value);
  });
  if (missing.size > 0) {
    throw new Error(
      "substitute-vars: template references variable(s) missing from the " +
      "dictionary: " + [...missing].sort().join(", ") + " (a deliberately " +
      "blank variable must appear as an explicit key)"
    );
  }
  // Belt and braces: a spelling this pass doesn't cover (or a variable-shaped
  // string in a substituted value) must not survive silently.
  const leftover = out.match(TAG_RE);
  if (leftover) {
    throw new Error(
      "substitute-vars: variable-shaped text survived substitution: " +
      [...new Set(leftover)].join(", ")
    );
  }
  return out;
}

/*
 * Express view engine (app.engine('html', expressEngine)). The variable
 * dictionary is the SCREAMING_SNAKE subset of the render options -- exactly
 * the keys defaultOpts/routes supply; express's own additions (settings,
 * cache, _locals) are lowercase and never template variables.
 */
const templateCache = new Map();
function expressEngine(filePath, options, callback) {
  try {
    let template = options.cache ? templateCache.get(filePath) : undefined;
    if (template === undefined) {
      template = fs.readFileSync(filePath, "utf8");
      if (options.cache) templateCache.set(filePath, template);
    }
    const vars = {};
    for (const k of Object.keys(options)) {
      if (/^[A-Z][A-Z0-9_]*$/.test(k)) vars[k] = options[k];
    }
    callback(null, substituteVars(template, vars));
  } catch (e) {
    callback(e);
  }
}

/*
 * The runtime-bundle preload line for editor.html's PYRET_PRELOAD variable:
 * the literal translation of the old {{^PYRET_GZIPPED}} inverted section.
 * `gzipped` truthy (any non-empty string, matching mustache's truthiness on
 * env values) means beforePyret fetches+inflates the .gz bundle itself, so
 * preloading the plain bundle would be a wasted 37MB fetch.
 */
function pyretPreloadTag(pyretUrl, gzipped) {
  if (gzipped) return "";
  return '<link crossorigin="anonymous" rel="preload" href="' +
    (pyretUrl == null ? "" : String(pyretUrl)) + '" as="script">';
}

module.exports = { substituteVars, findVars, expressEngine, pyretPreloadTag, escapeHtml };
