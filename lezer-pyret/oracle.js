// P1 oracle: wrap the canonical RNGLR parser as an accept/reject + tree source.
// Mirrors lang/tests/parse/parse.js, but exposes a reusable async API.
const path = require("path");
const R = require(path.join(__dirname, "../lang/node_modules/requirejs"));

const LANG = path.join(__dirname, "../lang");
const build = process.env["PHASE"] || "build/phaseA";

R.config({
  waitSeconds: 15000,
  baseUrl: LANG,
  paths: {
    "trove": path.join(LANG, build, "trove"),
    "js": path.join(LANG, build, "js"),
    "compiler": path.join(LANG, build, "arr/compiler"),
    "jglr": path.join(LANG, "lib/jglr"),
    "pyret-base": path.join(LANG, build),
  },
});

let _mods = null;
function load() {
  if (_mods) return _mods;
  _mods = new Promise((resolve, reject) => {
    R(["pyret-base/js/pyret-tokenizer", "pyret-base/js/pyret-parser"],
      (T, G) => resolve({ T, G }),
      (err) => reject(err));
  });
  return _mods;
}

// Returns { accepts: bool, count: number, tree?: object, error?: string }
async function parse(str) {
  const { T, G } = await load();
  const toks = T.Tokenizer;
  try {
    toks.tokenizeFrom(str);
    const parsed = G.PyretGrammar.parse(toks);
    if (!parsed) return { accepts: false, count: 0 };
    const count = G.PyretGrammar.countAllParses(parsed);
    if (count === 1) {
      const tree = G.PyretGrammar.constructUniqueParse(parsed);
      return { accepts: true, count, tree };
    }
    return { accepts: false, count }; // 0 or >1 (ambiguous) both reject like parse.js
  } catch (e) {
    return { accepts: false, count: 0, error: String(e) };
  }
}

module.exports = { parse, load };
