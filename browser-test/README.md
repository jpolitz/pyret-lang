# browser-test — code.pyret.org's editor assertions, on embed instances and vscode webviews

This directory runs the **same assertions** from `code.pyret.org`'s editor test
suite against the three places the Pyret editor renders. It's a **`node:test`**
suite (no extra test-framework dependency) driven through **one runner**:

```
node run.js --env=cpo|embed|vscode [--grep=<regex>] [--suites=all|check-blocks,errors,...]
```

| `--env` | What it drives |
|---|---|
| `cpo` | the reference — `code.pyret.org`'s `/editor` page (reproduces upstream's outcomes) |
| `embed` | the embed API's embedded instance (`<iframe>` in `/embed/embed1.html`) |
| `vscode` | the `pyret-parley.cpo` webview, in headless VS Code for the Web |

It is **strictly additive**: nothing under `code.pyret.org/` or `vscode/` is
modified; the upstream test files are read as-is.

## Why this is "the same tests"

All three environments render the **same** CPO editor (`editor.html`: CodeMirror,
`#runButton`, `#output`, `.check-block`, `.testing-summary`, "Looks shipshape").
Only how you *reach* that DOM differs — the editor is the main page (cpo), a child
iframe (embed), or a webview frame (vscode) — and a single `findEditorFrame`
helper (the frame with a `#runButton`) locates it in every case.

Two mechanisms keep the inputs and assertions identical to upstream:

- **Same inputs, zero copying.** `shared/load-cpo-specs.js` `require`s the
  unmodified `code.pyret.org/test/*.js` with the mocha globals and `util.js`
  replaced by *recording shims*, capturing the exact `(program, expected)` tuples
  upstream feeds its assertions — the same check-block table, the same
  error→substring table, the same `.arr` chart/table programs. No spec is copied.

- **Same assertions.** `shared/page-assertions.js` is a line-for-line, in-page
  port of the `util.js` predicates (`checkAllTestsPassed` / `testErrorRendersString`
  / `testRunsAndHasCheckBlocks` / `testRunAndUseRepl` / `checkTableRendersCorrectly`);
  `shared/cpo-assertions.js` orchestrates them exactly as `util.js` does, using
  **`node:assert`** for the content checks. Each function carries its `util.js`
  source reference. Because the port runs in-page via Playwright, it can reach a
  vscode webview (Selenium can't), so the *same* assertion code runs in all three
  environments.

  Running `--env=cpo` reproduces upstream's pass/fail on the real `/editor` page,
  which is what makes the port a trustworthy stand-in for `util.js`. (The port was
  first validated head-to-head against the real Selenium `util.js` suite; see the
  git history of this directory — the `util.js` path and the port produced
  identical results before the harness was consolidated onto the port.)

- **Two failure kinds, kept distinct.** Content checks use `node:assert`, so a
  wrong rendering fails as an **`AssertionError`** (with a value diff — "expected
  `failed`, got `Passed`"). Anything that prevents the test from being conducted —
  a program that wouldn't install, a value that never rendered, the REPL erroring —
  throws a **`ProceduralError`** (`shared/errors.js`). Both fail the test; the
  error class tells you which kind at a glance.

### Two webview details the port handles

- The `pyret-parley.cpo` custom editor starts with the interactions panel
  collapsed (`hideInteractions`), but the CPO editor removes that class on the
  first run (`beforePyret.js:1594`), so the REPL becomes available — which is why
  the REPL-driven suites (type-check, tables) run in the webview too.
- The run mode is sticky (`cpo-main.js`: `currentAction`): after a type-check
  run, the plain Run button keeps running type-checked. Since one editor frame is
  reused across suites, `PA.run()` selects the explicit "Run" dropdown item, which
  resets the mode. (Upstream never sees this — a fresh browser per suite.)

## Layout

```
run.js                  friendly CLI: --env/--grep -> `node --test ...` + PYRET_ENV
tests/suite.test.js     the node:test entry: boots one env, one test() per spec
envs/
  cpo.js                launch chromium, goto /editor
  embed.js              goto /embed/embed1.html, sendReset, find the iframe
  vscode.js             boot @vscode/test-web, open the custom editor, find the webview
shared/
  load-cpo-specs.js     extract exact specs from code.pyret.org/test/*.js (no copying)
  page-assertions.js    in-page DOM port of util.js predicates (window.PA)
  cpo-assertions.js     node:assert assertions mirroring util.js, per content check
  dispatch.js           map a loaded spec to its assertion
  errors.js             ProceduralError (procedural failures vs content AssertionError)
  playwright-page.js    `page` adapter over a Playwright frame
  find-frame.js         locate the editor frame (the one with #runButton)
  browser.js            launch Chromium (system Chrome or Playwright's bundled one)
vscode/fixture-workspace/test.arr   the .arr the custom editor opens
results/                captured run logs
```

## Running

Prereqs (one-time):

```bash
# code.pyret.org built + deps (build/web/js/cpo-main.jarr, code.pyret.org/node_modules)

# vscode extension built
cd vscode && ln -sf ../code.pyret.org/build build && npm install && npm run compile

# this harness's deps
cd ../browser-test && npm install     # playwright + @vscode/test-web

# Chrome (Playwright drives it via executablePath)
export GOOGLE_CHROME_BINARY=/bin/google-chrome
```

Then:

```bash
# cpo + embed load /editor from the CPO server, so start it first:
#   (cd code.pyret.org && BASE_URL=... PYRET=... PORT=4999 ... node src/run.js &)
BASE_URL=http://localhost:4999 node run.js --env=cpo
BASE_URL=http://localhost:4999 node run.js --env=embed

# vscode needs no CPO server (assets come from the built extension):
node run.js --env=vscode

# everything (starts the CPO server if needed):
./run-all.sh
```

### Filtering (local dev)

`--grep` is a regex matched against both suite names and individual test names —
so you can scope to one feature or one env:

```bash
node run.js --env=embed  --grep tables       # the tables suite, in the embed instance
node run.js --env=cpo    --grep 'is-not'      # every is-not* test, in /editor
node run.js --env=vscode --grep field-not-found

npm run embed -- --grep tables                # same, via package scripts
```

Other flags: `--suites=check-blocks,errors,...` (default `all`),
`--reporter=spec|tap|dot|junit` (default `spec`). Or skip the wrapper entirely:
`PYRET_ENV=embed node --test --test-name-pattern=tables tests/suite.test.js`.

## Results

See `RESULTS.md` and `results/`.
