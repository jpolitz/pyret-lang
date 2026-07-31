# curriculum — "do the Bootstrap starter files still work?"

This directory answers one question when Pyret changes: **would a Bootstrap
student's starter file still open, load its library, and do what the lesson
expects?**

It is a sibling suite to `browser-test/` proper, and reuses that harness whole —
the same env adapters (`envs/cpo.js`, `envs/embed.js`, `envs/vscode.js`, …), the
same `window.PA` port of `util.js`, the same `node:assert` / `ProceduralError`
split. What it adds is the *inputs*: instead of the programs in
`code.pyret.org/test/*.js`, it runs the ~158 `.arr` files that Bootstrap's
lessons actually hand to students.

```bash
# needs the CPO server running (see ../README.md "Running"), or just:
make -C browser-test curriculum
```

A whole run is **207 tests in ~19 minutes** on two cores (5 links, 14 shareurl,
27 libraries, 158 entry points, +3 group wrappers): one editor, 158 programs,
most importing several thousand lines of Bootstrap library over the network and
76 of them also loading a Google Sheet. Currently **207 passing, 0 failing**
against the pin. `--parts=` and `--grep` (below) cut that down while you work.
It is deliberately not part of `make all-envs` — see the note in the Makefile.

## Where the files come from

Nothing is vendored. Two Bootstrap repositories are read over the network and
cached under `.cache/` (gitignored):

| repo | pinned to | what it decides |
|---|---|---|
| [`bootstrapworld/curriculum`](https://github.com/bootstrapworld/curriculum) | a commit sha | **which** `.arr` files are student entry points |
| [`bootstrapworld/starter-files`](https://github.com/bootstrapworld/starter-files) | the `fall2026` tag | the files themselves |

"Student entry point" is not something you can see from the starter-files repo:
it also holds ~19 libraries (imported, never opened) and a few files literally
named `... - not used.arr`. The curriculum is the authority. A file is an entry
point exactly when a lesson links to it — as a `pyret.url` in
`shared/langs/en-us/starterFiles/*.json`, or as an `#shareurl=` link in the Data
Science dataset table — and `manifest.js` derives the list from those sources at
the pinned curriculum commit. That derivation is itself checked: the `links`
group asserts every `.arr` in the repo is either an entry point or on a short
reviewed list of non-entry points, so "all the student entry points" is a claim
the suite verifies rather than one it assumes.

### On pinning

The curriculum links reference starter-files by the **`fall2026` tag**, and — the
part that decides the design — so do the starter files' *own* headers:

```pyret
use context url-file("https://raw.githubusercontent.com/bootstrapworld/starter-files/fall2026/core",
                     "../libraries/core.arr")
```

So a file's ~10k lines of imported library resolve at the tag no matter how the
file itself was fetched. Sha-pinning the entry point would pin the thin outer
layer and leave everything underneath floating, which is worse than not
pretending: this suite fetches at the tag (exactly what a student gets) and
*checks the pin* instead. `pins.js` records the commit `fall2026` pointed at when
the expectations were recorded, and a `links` test fails when the tag has moved
off it — see "Re-pinning" below.

`--ref=<sha>` overrides the ref for a one-off run.

## What each test actually checks

Four groups, `--parts=` to select them.

### `links` — the curriculum's own links (5 tests)

Pins the state of the link graph, so a change shows up instead of quietly
widening or narrowing everything else: every linked file exists, every link and
every import header is pinned to the term tag, every `.arr` in the repo is
accounted for, and the tag still points at the pinned commit. The expected sets
live in `expectations.js`; today they encode, among others, three lesson buttons
that 404 (`ai/premiums.arr`, `libraries/text-stats-library.arr`,
`reactive/emoji-refactor.arr`).

### `shareurl` — the link a student clicks

Every "Starter File" button in the curriculum is

```
https://pyret.bootstrapworld.org/editor#shareurl=https://raw.githubusercontent.com/…/Rocket%20Height.arr
```

and `beforePyret.js` turns that hash into a fetch that becomes the editor's
initial contents. Every *other* group in this suite installs the same text
straight into CodeMirror (one editor, 158 files, no reboots), so this group is
what says the **delivery path** works: a broken `#shareurl` would leave every one
of those buttons opening an empty editor while the rest of the suite stayed
green.

It costs a full editor boot per file, so it runs one entry point per curriculum
area **plus every file whose name holds a character rarer than a space** — an
apostrophe, an ampersand, a comma, parentheses. Spaces are in nearly every one
of these names and are covered by the per-area picks anyway; the rare ones
(`Sally's Lemonade.arr`, `Dogs, Rabbits, Cats, & Tarantulas Starter File.arr`,
`Simple Game (no collision).arr`, …) are where an encoding bug would hide, and
there are only nine, so none is left to chance.

cpo only: `#shareurl` is a code.pyret.org editor feature; embedded hosts install
contents over their own reset protocol.

### `libraries` — "the library loads and basic functionality works"

One test per **distinct import header** (28 of them across the 158 files). It
runs the file's header *verbatim* — the real URLs, the real `../` traversals, the
libraries that have `use context` headers of their own — and then exercises the
library from the interactions window, the way a student would:

```
string-trim("  hi  ")            →  "hi"
round-digits(3.14159, 2)         →  3.14
funI(3)                          →  37          (linearity-library)
levenshtein("kitten", "sitting") →  3           (spell-checker-library)
player-distance(player(0,0), thing(3,4,0)) → 5  (ninja-cat-library)
```

The probes are in `probes.js`, keyed by library. **This group exists because the
whole-file run cannot do this job**: CPO installs a program's namespace only when
the run *completes*, and 37 of the 158 entry points never complete — they end in
`interact()` or an Interactive Chart (still running when we stop them), or do
not compile, or are waiting for the student to paste a spreadsheet URL. In those
the interactions window reports every name as "unbound". Running just the header
gives a program that does complete, with exactly the bindings a student's
`use context` puts in scope.

Two Bootstrap libraries end with a call that opens an animation
(`ninja-cat-library.arr`'s `game.interact()`,
`package-delivery-library.arr`'s `animation(next-position)`), so importing them
*is* the program. Those are recorded in `expectations.preludes` and checked as
"loaded, ran and painted" instead.

### `entry-points` — one test per starter file

Installs the file verbatim, presses Run, and requires the outcome
`expectations.js` declares for it. Five outcomes, and a file that changes
category fails rather than passing under a laxer rule. As recorded against the
pin, with sheets readable: 121 `runs`, 29 `interactive`, 5 `broken-upstream`,
2 `placeholder`, 1 `teaching-error`. (With `--sheets=none` the 76 sheet-backed
files become `needs-google-login` instead.)

| outcome | means | how it is checked |
|---|---|---|
| `runs` | finishes with an empty error area | its check/examples block counts — total *and failing* — must match what is recorded (seven of these files ship a deliberately-red `examples:` block: it is the exercise), plus **definition probes**: the file's own top-level bindings are evaluated by name in the interactions window and must render |
| `interactive` | opens a window and waits for the student | two shapes, and which one is recorded: a reactor **animation** (`interact()`/`blastoff()`, painting a `<canvas>`) or one of Bootstrap's **Interactive Chart** windows (`scatter-plot` and friends, drawing an `<svg>`). It must have drawn; then Stop is pressed, like a student. `drawsFrame: false` for the reactors whose `to-draw:` is deliberately left blank for the student to write |
| `needs-google-login` | compiles and runs, and dies at `load-spreadsheet` | the error area must hold the Google-auth message **and nothing else**. Only reachable with `--sheets=none`; see "Google Sheets" |
| `placeholder` | ships with a blank the student fills in — `load-spreadsheet("PASTE THE URL … HERE")` | must fail at `load-spreadsheet` naming the placeholder text, which proves it compiled and got that far. Deliberate, like `teaching-error`, but for the opposite reason: nothing is wrong with the code, it is waiting for the student's own data |
| `teaching-error` | is deliberately broken — that is the lesson | must be a *compile* error (no stacktrace) containing the expected text: the mistake has to be the one the student is looking at |
| `broken-upstream` | is broken by accident — a student hits an error the lesson never intended | must still produce the recorded error text; the separate name is so the finding stays visible instead of hiding as "expected" |

## Findings

What the first run turned up. All of it is Bootstrap-side, not Pyret-side, so it
is recorded as expectations (the suite is green) and listed here so it stays
visible. **Five starter files a lesson links to do not run at all** — a student
clicking those buttons gets a compile error, not a starting point:

| file | what is wrong |
|---|---|
| `data-science/Piecewise Visualizations with Images.arr` | `animal-img` returns `spider-img` (line 45); the file defines `tarantula-img` |
| `reactive/Cow Jump.arr` | line 25 has doubled quotes: `image-url(""https://…/cow.png"")` |
| `reactive/Package Delivery.arr` | line 28 calls `Start.animation`, but `package-delivery-library.arr` provides only what it re-exports from Core and Starter |
| `reactive/Reactive NinjaCat.arr` | line 16 loads `libraries/images/bg.png`, which does not exist (the library uses `bg.jpg`) |
| `reactive/Watermelon Smash.arr` | line 40 calls `interact(smash-react)`; a reactor is run as `smash-react.interact()` |

And in the link graph:

* **Three lesson buttons 404** at `fall2026`: `ai/premiums.arr`,
  `libraries/text-stats-library.arr`, `reactive/emoji-refactor.arr`.
* **Two links bypass the tag** and follow `refs/heads/main`
  (`ai/ai-music.arr`, `data-science/Expanded Animals Starter File.arr`), as do
  the import headers of six `ai/` files — so those students get whatever `main`
  holds today rather than the term's pinned code.

## Compiler flavors

`--compiler=pyret` (default) is **green: 207/207**.

`--compiler=ts` is **not green, and the failures look like a real TS-compiler
bug rather than a harness or curriculum one.** The flavor boots correctly
(`CPO_COMPILER=ts`, `PyretTSCompiler` bundle loaded) and the Google Sheets path
works on it, and 24 of the 27 `libraries` tests pass. The other three fail with
the library's names **unbound in the interactions window** --

    The name string-trim is unbound

-- after an import header that provides them, and which loaded with no error.
Two things say this is not the probes: the same expressions answer correctly
when that header is run on its own on ts (`SAM-WIDTH` -> 640), and **the failing
three are a different three each run** out of the same 27. So on ts, a
`use context url-file(...)` sometimes does not populate the namespace the
interactions window gets, non-deterministically.

That is Pyret's side, not Bootstrap's, and it is exactly the kind of thing this
suite exists to surface -- but it wants its own investigation, so ts is recorded
here as known-red rather than papered over. Reproduce with:

```bash
node curriculum/run.js --env=cpo --compiler=ts --parts=libraries
```

(Needs `make web-ts` in code.pyret.org first, for `cpo-main-ts.jarr` and
`ts-compiler.js`.)

Only the `cpo` env has the sheets knob (`envs/cpo.js`); embed and vscode boot
their editors differently and would each need their own transport -- see the
note at the end of "Google Sheets".

## What this does and does not prove

**Does.** That every linked starter file is reachable; that its import graph
resolves over the network; that the whole file compiles (Pyret compiles a
program completely before running any of it, so *reaching* a runtime call proves
well-formedness, name resolution and every `url-file` import for the entire
file); that the Bootstrap libraries compute the right answers; that reactors
draw; that images render; and that the files which are supposed to fail still
fail in the specific way they are recorded as failing.

**Does not.** The gapi transport and OAuth itself (see "Google Sheets" below);
any pixels beyond "a canvas exists"; interactive behaviour after the first
frame.

## Google Sheets

76 of the 158 entry points call `load-spreadsheet(...)`. That normally goes
`gdrive-sheets` → `storageAPI` → an authenticated Google session, so an
unauthenticated headless browser cannot open even a world-readable sheet — the
obstacle is auth and CORS, not permission. Those files could only be checked as
far as "it compiled and reached the Google call", which is half the curriculum
left untested.

So the **development** server proxies Google's own public export endpoints, and
`/editor?sheets=public` points the client at it. No API key, no client id, no
credentials of any kind — a public sheet needs none; it only needs a fetch from
somewhere CORS does not block.

```
/test-only/gsheet/sheets?id=       -> [{name, gid, index}]   (scraped from /htmlview)
/test-only/gsheet/data?id=&gid=    -> the gviz table JSON
```

The seam on the client is a single method. `sheets.js`'s `createAPI` needs only
`spreadsheets.get()` to read, so `sheets-public.js` supplies a stand-in that
answers it with the same JSON the Sheets v4 API returns, and
`createSheetsAPI(immediate, override)` hands it in. **Everything downstream is
the shipping code**: `Spreadsheet`/`Worksheet`, `unifyRows` and its whole
type-inference and error scheme, `getAllCells`, `worksheetToTable`, the
sanitizers, the Pyret table construction. Only the transport differs from a
signed-in run.

`tqx=out:json` rather than `out:csv` on purpose: CSV is only text, so the client
would have to re-guess which columns are numbers, and the inference this suite
is meant to exercise would be reinvented against a lossier format. gviz reports
Google's own per-column type plus each cell's raw and formatted value, which is
the same information the real API provides, so the mapping is a mapping and not
a guess. Two known differences from the real API, both harmless here: gviz consumes the
first row as column labels, so it is put back from `cols[].label` to rebuild the
grid (fine, because every Bootstrap starter file opens its sheet with
`sheet-by-name(name, true)`); and error cells arrive as blanks rather than as
`errorValue`, so a sheet full of `#N/A` is reported less specifically than
Sheets would report it.

Two locks keep this out of production: the routes live inside
`if(config.development)`, and the client flag `PUBLIC_SHEETS_PROXY` is rendered
`"true"` only by a development server, so `?sheets=public` does nothing on a
deployed instance. Writes are not supported — a public sheet is read-only here,
and the write methods say so rather than pretending.

**What it buys.** Those 76 files now run to completion on real data, so the
`entry-points` group checks each loaded table by name — its declared columns
must render, and `row-n(t, 0)` must produce a first row, which an empty or
failed load would not. Column names, sanitizers, and the rows themselves are
covered; a dataset that gets unpublished or has a column renamed now fails here.

Both modes stay honest, and both are verified: **207/207 with the proxy**, and
`--sheets=none --parts=entry-points` is **158/158** against a plain editor,
where the same files are expected to stop at the Google call. `expectations.js`
records one row per file (`readsSheet: true`) and `forEntry` picks the right
outcome from how the editor actually booted — read off `window.PUBLIC_SHEETS`,
not from what we asked for, so the two cannot drift. That second run is also
what checks the `readsSheet` set itself: a file wrongly marked, or wrongly not,
fails there.

## Filtering

`--grep` is a regex over test names, and test names are the repo paths:

```bash
node curriculum/run.js --env=cpo --grep 'Rocket Height'
node curriculum/run.js --env=cpo --grep '^data-science/'
node curriculum/run.js --env=cpo --parts=links,libraries
node curriculum/run.js --env=cpo --compiler=ts          # same files, TS-compiler flavor
node curriculum/run.js --env=cpo --sheets=none          # no sheet reads
```

Other flags: `--reporter=spec|tap|dot|junit`, `--ref=<starter-files ref>`,
`--sheets=public|none` (see "Google Sheets"; default `public`).
`CURRICULUM_RUN_TIMEOUT_MS` raises the per-file budget on a slow machine.

## Re-pinning to a new term

When Bootstrap cuts a new tag (`fall2027`, …), or when `fall2026` moves and the
pin test fails:

1. Update `STARTER_FILES_COMMIT` (and `STARTER_FILES_REF` if the tag name
   changed) and `CURRICULUM_COMMIT` in `pins.js`.
2. `rm -rf curriculum/.cache`
3. Re-derive the link lists — the four `known*` arrays in `expectations.js` —
   from the failures the `links` group reports.
4. Re-baseline the entry points:
   ```bash
   BASE_URL=http://localhost:4999 node curriculum/baseline.js --env=cpo > /tmp/draft.js
   ```
   It drives the same harness and prints the `entries` table's shape, marking
   with `// REVIEW` everything a human must confirm. **Read those.** Two
   categories are never safe to accept blind:
   * `teaching-error` — "does not compile" is only correct when the lesson is
     about fixing it (today: only `core/Bug Hunting.arr`). Anywhere else the
     starter file is genuinely broken: re-label it `broken-upstream`, give it a
     `note`, and report it — the fix belongs in Bootstrap's repo, not here.
   * `needs-google-login` — correct only when the file is genuinely
     spreadsheet-backed.

   The draft also carries `checkBlocks` / `failedCheckBlocks` for the files
   that finish. Those are worth a glance too: a starter file's `examples:`
   block is sometimes meant to pass as shipped and sometimes meant to fail
   until the student writes the function, and the recorded numbers are what
   pin that distinction.
5. Add any new library to `LIBRARY_PROBES` in `probes.js`; the `libraries` group
   fails loudly rather than silently checking nothing.

## Layout

```
run.js                  CLI: resolves the manifest, then `node --test`
pins.js                 the pinned commits/refs and the curriculum files to read
manifest.js             derive the entry point list; fetch + cache the .arr files
expectations.js         REVIEWED: outcome per entry point, plus the link-graph state
probes.js               library probes, definition probes, import-header extraction
page-curriculum.js      in-page predicates (window.CUR): animating, error kind, ...
assertions.js           run one file; judge it against its expected outcome
baseline.js             draft an expectations table by running everything
tests/starter-files.test.js   the node:test entry point
.cache/                 fetched sources, keyed by ref (gitignored)
```
