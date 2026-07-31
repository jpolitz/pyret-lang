/*
 * probes.js -- what to type into the interactions window after a starter file
 * has run.
 *
 * A starter file that merely "runs" proves very little. Most of these files are
 * definitions and comments with no top-level expression at all -- Chinese
 * Flag.arr defines `china` and prints nothing -- so "no error appeared" is
 * satisfied by an editor that did nothing. The lesson is what the student types
 * NEXT, so that is what we type.
 *
 * Two kinds of probe, used by two different test groups:
 *
 *  1. LIBRARY probes (LIBRARY_PROBES below), used by the "libraries" group.
 *     Every entry point pulls in a Bootstrap library through
 *     `use context url-file(...)`, and the whole point of the `use context` is
 *     that the library's names are in scope in the student's interactions
 *     window. These probes call functions the curriculum actually teaches,
 *     with answers checked by value, so "the library loaded" means "the
 *     library computes the right thing" rather than "an import resolved".
 *     They run against the import header alone (importPrelude), once per
 *     distinct header rather than once per file -- see that function for why.
 *
 *  2. DEFINITION probes (definitionProbes below), used by the "entry-points"
 *     group for the files that finish. Derived from the file itself: its own
 *     top-level bindings, evaluated by name. That covers files no hand-written
 *     table would ever keep up with, and it is a real check -- `china` renders
 *     as a scene description, `animals-table` renders as a table, a stub
 *     function renders as a function. A file whose definitions did not survive
 *     the run fails here.
 *
 * Values below were read off the libraries at the pinned commit (see pins.js);
 * where a number could drift with an implementation detail we assert on a
 * prefix or a rendered description instead of an exact float.
 */

// Library probes, keyed by the library file a starter file names in its
// `use context` / `include`. A header that names several (core.arr plus a
// topic library, say) gets the union of their probes, deduplicated by
// expression -- see libraryProbes.
//
// Everything here must be SIDE-EFFECT FREE at the REPL: calling `blastoff(...)`
// or `play(...)` would open another animation and wedge the shared editor, so
// those are probed for existence (`is-function`) rather than called.
const LIBRARY_PROBES = {
  // libraries/core.arr -- the base context for ~135 of the entry points. It
  // re-exports the image library and the Bootstrap numeric/table helpers.
  "core.arr": [
    ['string-trim("  hi  ")', "hi"],
    ["round-digits(3.14159, 2)", "3.14"],
    ["num-round-to(2.34567, 2)", "2.35"],
    ['image-width(rectangle(300, 200, "solid", "red"))', "300"],
    ['is-function(bar-chart)', "true"],
  ],

  // libraries/ai-library.arr -- text/image/recommendation helpers on top of core.
  "ai-library.arr": [
    ['string-trim("  hi  ")', "hi"],
    ['num-words("the quick brown fox")', "4"],
    ['is-function(build-tree)', "true"],
    ['is-function(cosine-similarity)', "true"],
  ],

  // libraries/game-library.arr -- the Bootstrap:2 game scaffold.
  "game-library.arr": [
    ["GAME-WIDTH", "640"],
    ["GAME-HEIGHT", "480"],
    ["is-function(make-game)", "true"],
    // `play` opens a window; only check that it is there.
    ["is-function(play)", "true"],
  ],

  // libraries/linearity-library.arr -- the linear/non-linear function set the
  // Algebra lesson has students classify. Only names this library itself
  // provides: its `use context` is core.arr, but `provide *` exports its own
  // bindings, so core's helpers are NOT in a student's scope here.
  "linearity-library.arr": [
    ["funI(3)", "37"],
    ["funB(10)", "20"],
    ["funE(4)", "16"],
    ["funF(99)", "6.5"],
  ],

  // libraries/unit-clock-library.arr -- Algebra 2 trigonometry.
  "unit-clock-library.arr": [
    ["deg-to-rad(0)", "0"],
    ["rad-to-deg(0)", "0"],
    ["deg-to-rad(180)", "3.14"],
  ],

  // libraries/boolean-library.arr -- Core booleans lesson.
  "boolean-library.arr": [
    ["is-even(4)", "true"],
    ["is-odd(4)", "false"],
    ["is-less-than-one(0.5)", "true"],
    ['is-primary-color("red")', "true"],
  ],

  // libraries/rocket-height-library.arr -- Core "Rocket Height".
  "rocket-height-library.arr": [
    ["is-function(blastoff)", "true"],
    ["is-function(graph)", "true"],
    ["ROCKET-HEIGHT", "550"],
  ],

  // libraries/sam-library.arr -- Algebra inequalities ("Sam the Butterfly").
  "sam-library.arr": [
    ["SAM-WIDTH", "640"],
    ["SAM-HEIGHT", "480"],
    ["is-function(sam)", "true"],
  ],

  // libraries/ninja-cat-library.arr -- Algebra "Ninja Cat".
  "ninja-cat-library.arr": [
    ["player-distance(player(0, 0), thing(3, 4, 0))", "5"],
    ["collide(player(0, 0), thing(3, 4, 0))", "true"],
    ["is-function(update-world)", "true"],
  ],

  // libraries/coin-flip-library.arr -- Data Science probability.
  "coin-flip-library.arr": [
    ["coin1()", "90"],
    ["coin2()", "50"],
    ["is-function(flip)", "true"],
  ],

  // libraries/spell-checker-library.arr -- AI spell checker.
  "spell-checker-library.arr": [
    ['levenshtein("kitten", "sitting")', "3"],
    ['levenshtein("abc", "abc")', "0"],
    ["is-function(alt-words)", "true"],
  ],

  // libraries/self-driving-car-library.arr -- AI self-driving car. It
  // re-exports core.arr (hence string-trim) but not ai-library, so the rest
  // are its own.
  "self-driving-car-library.arr": [
    ['string-trim("  hi  ")', "hi"],
    ["ROAD-HALF-WIDTH", null],
    ["is-function(random-track)", "true"],
    ["is-function(drive)", "true"],
  ],

  // libraries/package-delivery-library.arr -- Reactive package delivery.
  "package-delivery-library.arr": [
    ["lands-safely(delivery(400, 50))", "true"],
    ["hits-road(delivery(100, 50))", "true"],
    ["is-function(animation)", "true"],
  ],

  // libraries/trust-but-verify-library.arr -- Data Science "Trust but Verify".
  // Everything in it takes a row from a Google Sheet, so only shape is probed.
  "trust-but-verify-library.arr": [
    ["is-function(is-fixed)", "true"],
    ["is-function(nametag)", "true"],
  ],

  // `use context starter2024` -- CPO's own builtin Bootstrap context, no
  // url-file involved. Worth a probe precisely because it is the one context
  // that ships inside Pyret rather than being fetched.
  "starter2024": [
    ['image-width(circle(10, "solid", "red"))', "20"],
    ["num-sqrt(16)", "4"],
  ],
};

// Which library a starter file's context/includes name. Multi-line `use
// context url-file("...base...", "...path...")` is normal in these files, hence
// the `s` flag. `include`/`import url-file` are picked up too, because a file
// like core/booleans.arr gets its lesson vocabulary from an include rather than
// from its context.
function librariesUsed(code) {
  const found = [];
  const push = (p) => {
    const base = p.split("/").pop();
    if (base && !found.includes(base)) found.push(base);
  };
  for (const m of code.matchAll(/use\s+context\s+url-file\(\s*"([^"]*)"\s*,\s*"([^"]*)"/gs)) push(m[2]);
  for (const m of code.matchAll(/use\s+context\s+url\(\s*"([^"]*)"/gs)) push(m[1]);
  if (/use\s+context\s+starter2024/.test(code)) push("starter2024");
  for (const m of code.matchAll(/(?:include|import)\s+url-file\(\s*"([^"]*)"\s*,\s*"([^"]*)"/gs)) push(m[2]);
  for (const m of code.matchAll(/(?:include|import)\s+url\(\s*"([^"]*)"/gs)) push(m[1]);
  return found;
}

// The probes for a file: every library it names that we have probes for.
// Deduplicated by expression so a file naming both core.arr and a library built
// on core.arr does not run string-trim twice.
function libraryProbes(code) {
  const out = [];
  const seen = new Set();
  for (const lib of librariesUsed(code)) {
    for (const p of LIBRARY_PROBES[lib] || []) {
      if (seen.has(p[0])) continue;
      seen.add(p[0]);
      out.push(p);
    }
  }
  return out;
}

/*
 * The file's own top-level bindings, in source order.
 *
 * Anchored at column 0 on purpose: that is what makes this safe without a Pyret
 * parser. Bindings inside a function body, a `check:`/`examples:` block, or a
 * `data` variant are all indented in these files, so column-0 matching picks up
 * the module's own top level and nothing else. `shadow`, type annotations, and
 * the `data`/`fun` forms are handled; keywords that merely start a line
 * (`include`, `use`, ...) are excluded by the keyword list.
 */
const KEYWORDS = new Set([
  "fun", "data", "var", "rec", "when", "if", "ask", "cases", "for", "check",
  "examples", "include", "import", "provide", "use", "type", "newtype", "shadow",
  "block", "end", "else", "let", "letrec", "lam", "table", "load-table", "row",
  "source", "sanitize", "and", "or", "not", "is", "raises", "satisfies",
]);

function definedNames(code) {
  const names = [];
  const add = (n) => { if (n && !KEYWORDS.has(n) && !names.includes(n)) names.push(n); };
  for (const line of code.split("\n")) {
    let m = line.match(/^fun\s+([a-zA-Z][\w-]*)\s*\(/);
    if (m) { add(m[1]); continue; }
    m = line.match(/^data\s+([a-zA-Z][\w-]*)\s*:/);
    if (m) continue; // a data type is not a value binding; its constructors are
    // `name = value`, `name :: Type = value`, and the `name =` form whose
    // value starts on the next line. `=(?!=)` so a top-level `a == b` reads as
    // the comparison it is rather than a binding of `a`.
    m = line.match(/^(?:var\s+|rec\s+|shadow\s+)?([a-zA-Z][\w-]*)\s*(?:::[^=]+)?=(?!=)\s*\S?/);
    if (m) { add(m[1]); continue; }
  }
  return names;
}

/*
 * Definition probes: evaluate the file's own bindings by name and require the
 * interactions window to render each one without erroring. No expected value --
 * the point is that the binding exists and its value renders, which is exactly
 * what breaks when an import stops resolving or a runtime feature regresses.
 *
 * Capped (default 4) because each REPL round trip costs about a second and the
 * first few bindings are the ones the lesson is about.
 */
function definitionProbes(code, limit = 4) {
  return definedNames(code).slice(0, limit).map((n) => [n, null]);
}

/*
 * Probes for the tables a starter file loads out of a Google Sheet.
 *
 * These are what make "the sheet was read" a real claim rather than "nothing
 * errored". A file like data-science/Animals Starter File.arr says
 *
 *     animals-table =
 *       load-table: name, species, sex, age, fixed, legs, pounds, weeks
 *       source: shelter-sheet.sheet-by-name("pets", true)
 *     end
 *
 * so for each such binding we ask the interactions window for
 *
 *     animals-table   -- must render, and must contain the declared column
 *                        names: proof the schema bound to real data
 *     animals-table.row-n(0)
 *                     -- must render: proof there is at least one ROW, which
 *                        an empty or failed load would not have
 *
 * `.row-n(0)`, the table's own method, rather than Bootstrap's `row-n(t, 0)`
 * helper that the starter files themselves use. The helper refuses a table
 * with blank cells ("This table contains blank cells in column fixed") -- a
 * deliberate guard, and correct, but it means probing through it would test
 * the guard rather than the data, and would fail on the perfectly good sheets
 * that happen to have gaps (data-science/New Animals Starter File.arr is one:
 * its `fixed` column loads as Option, exactly as it should).
 *
 * Only meaningful when the editor can actually reach the sheet (the
 * `?sheets=public` path); on a plain editor the run dies at load-spreadsheet
 * long before any of this.
 *
 * The column list is parsed off the `load-table:` header, whose entries are
 * frequently followed by per-line `#` comments (see
 * data-science/dataset-library/pokemon.arr), hence the comment stripping.
 */
const LOAD_TABLE_RE = /^([a-zA-Z][\w-]*)\s*=\s*(?:\r?\n\s*)?load-table:\s*([\s\S]*?)\n\s*source:/gm;

function sheetTables(code) {
  const out = [];
  for (const m of code.matchAll(LOAD_TABLE_RE)) {
    const columns = m[2]
      .split("\n")
      .map((line) => line.replace(/#.*$/, ""))
      .join(" ")
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c !== "");
    if (columns.length > 0) out.push({ name: m[1], columns });
  }
  return out;
}

// At most `limit` tables, two probes each -- a file with a dozen tables would
// otherwise spend a minute in the REPL for no extra signal.
function sheetTableProbes(code, limit = 2) {
  const probes = [];
  for (const t of sheetTables(code).slice(0, limit)) {
    probes.push([t.name, t.columns[0]]);
    probes.push([t.name + ".row-n(0)", t.columns[0]]);
  }
  return probes;
}

/*
 * The file's import PRELUDE: its `use context` / `include` / `import` header,
 * copied verbatim, up to the first line of student code.
 *
 * This is how the library probes reach the 108 entry points whose interactions
 * window is unusable after a run. CPO only installs a program's namespace when
 * the run COMPLETES, so a file that ends in `r.interact()` (still running when
 * we stop it) or that dies at `load-spreadsheet` (no Google session) leaves the
 * REPL with nothing defined -- every name reads back "is unbound". Running just
 * the header gives a program that does complete, with exactly the bindings the
 * `use context` puts in a student's scope, so the library can be exercised for
 * real.
 *
 * Verbatim matters: this is the file's own header, not a reconstruction, so the
 * URLs, the `../` traversals and the nesting are all the ones being shipped.
 *
 * Parenthesis depth is tracked because these headers wrap across lines:
 *
 *     use context url-file(
 *       "https://raw.githubusercontent.com/.../data-science",
 *       "../libraries/core.arr")
 */
function importPrelude(code) {
  const lines = code.split("\n");
  const out = [];
  let depth = 0;
  for (const line of lines) {
    const code0 = line.replace(/#.*$/, "");
    if (depth === 0) {
      const t = line.trim();
      const isHeader = t === "" || t.startsWith("#") ||
        /^(use\s+context|include|import|provide)\b/.test(t);
      if (!isHeader) break;
    }
    out.push(line);
    for (const ch of code0) {
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") depth--;
    }
    if (depth < 0) depth = 0;
  }
  // Trailing blank/comment lines carry no imports; drop them so files that
  // differ only in their comment banner share one prelude.
  while (out.length && (out[out.length - 1].trim() === "" || out[out.length - 1].trim().startsWith("#"))) {
    out.pop();
  }
  return out.join("\n").trim();
}

module.exports = {
  LIBRARY_PROBES,
  librariesUsed,
  libraryProbes,
  definedNames,
  definitionProbes,
  sheetTables,
  sheetTableProbes,
  importPrelude,
};
