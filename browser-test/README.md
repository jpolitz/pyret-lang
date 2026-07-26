# browser-test — code.pyret.org's editor assertions, on embed instances and vscode webviews

NOTE(joe): Originally Claude-generated README here with only minor edits

This directory runs the **same assertions** from `code.pyret.org`'s editor test
suite against the three places the Pyret editor renders. It's a **`node:test`**
suite (no extra test-framework dependency) driven through **one runner**:

```
node run.js --env=cpo|webkit|ios-safari|embed|vscode|vscode-ovsx [--grep=<regex>] [--suites=all|check-blocks,errors,...]
```

| `--env` | What it drives |
|---|---|
| `cpo` | the reference — `code.pyret.org`'s `/editor` page (reproduces upstream's outcomes) |
| `webkit` | the same `/editor` page in Playwright's bundled WebKit — the cheap Safari-ish tier |
| `ios-safari` | the same `/editor` page in **real Safari on a pinned iOS Simulator** — the old-Safari authority (macOS only) |
| `embed` | the embed API's embedded instance (`<iframe>` in `/embed/embed1.html`) |
| `vscode` | the `pyret-parley.cpo` webview, in headless VS Code for the Web |
| `vscode-ovsx` | the same webview, but with its assets served the way **Open VSX** serves them to the **GitLab Web IDE** — reproduces issue #21 |

### `webkit` and `ios-safari` — the old-Safari tiers

Pyret ships a compiler, so most Safari breakage is JS-engine breakage: a feature
JavaScriptCore hadn't implemented yet, or one it got wrong. Two real examples,
both invisible to any static check:

- `charts-lib.js` called `.map()` directly on an iterator, which needs the
  iterator-helpers proposal — **Safari shipped it in 18.4**. On Safari 17 it
  throws `TypeError: ....map is not a function`, which teachers hit on
  `pyret.bootstrapworld.org`.
- [WebKit #223533](https://bugs.webkit.org/show_bug.cgi?id=223533): a `var`
  redeclaring a parameter inside an `async` function reads as `undefined`.
  **Fixed in 17.4.** No exception — just a wrong value, from a pattern code
  generators emit all the time.

The two tiers differ in what they're good for:

`webkit` runs Playwright's bundled WebKit. It's Linux-native, so it's in the
normal matrix and you can run it locally on any OS. But Playwright ships
*upstream* WebKit, whose feature flags can be ahead of the Safari release with
the same version number — so it's a good regression detector and a **bad**
authority on "does Safari have this yet." It would likely have missed both bugs
above.

`ios-safari` runs Apple's actual shipped WebKit + JavaScriptCore from a
simulator runtime, which is the tier that really catches them. Because
Playwright cannot drive iOS Safari, it goes through Appium's XCUITest driver
over WebDriver, with `shared/webdriver-page.js` supplying the same three-method
`page` adapter the Playwright envs use — the specs and assertions don't know
the difference.

**Pin the oldest iOS you still support, not the newest available.** `macos-14`
runners carry 17.0 / 17.2 / 17.4 / 17.5 preinstalled; both bugs above are fixed
by 17.4, so pinning 17.5 would pass and prove nothing. The CI pin lives in
`IOS_VERSION` in `.github/workflows/browser-test.yml`.

### `vscode-ovsx` — the GitLab Web IDE / Open VSX reproduction

`--env=vscode` serves the webview assets from a local static server with correct
MIME types and no size limit (that's how `@vscode/test-web` works), so it can't
see the way the extension breaks in the GitLab Web IDE. There, GitLab resolves
the webview's resources to Open VSX (`open-vsx.org/vscode/unpkg/...`), which
serves **every** file as `Content-Type: text/plain` + `X-Content-Type-Options:
nosniff` (so `<script src>`/`<link>` are refused execution) and **503s** files
over a ~15 MB cap (so the 37 MB `cpo-main.jarr.js` never loads). That's
[issue #21](https://github.com/jpolitz/pyret-parley-vscode/issues/21).

`vscode-ovsx` reproduces exactly that. `shared/ovsx-server.js` serves the built
`dist/web/build/web` with those hostile semantics; the editor HTML is rendered
the same way `getHtmlForWebview` does, with `BASE_URL`/`PYRET` pointed at it. It
does not boot VS Code — it injects a no-op `acquireVsCodeApi` (so beforePyret
takes the real `window.PYRET_IN_VSCODE` branch, the path issue #21 broke)
and passes `initialState` in the URL hash (so `events.js` self-resets the editor
and gains control locally, giving `editorReady` its non-empty CodeMirror).

Hostile mode is the regression test for #21: it fails if the self-contained
template stops booting under nosniff serving. To separate a real regression
from broken harness plumbing, run **faithful** mode (correct MIME, no cap) —
that should boot and pass just like `vscode.dev`:

```bash
node run.js --env=vscode-ovsx                 # hostile (default): the #21 regression test
OVSX_FAITHFUL=1 node run.js --env=vscode-ovsx  # correct MIME/no cap: plumbing check
```

Env vars: `OVSX_FAITHFUL=1` (correct serving), `OVSX_ASSET_ROOT=<dir>` (override
the served build; defaults to `vscode/dist/web/build/web`), `OVSX_CAP_MB=<n>`
(hostile size cap, default 15). A standalone one-shot check that skips the full
spec suite lives in `smoke-ovsx.js`.

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
envs/                   each returns { page, cleanup } -- `page` being the adapter,
                        so tests/suite.test.js stays driver-agnostic
  cpo.js                launch chromium, goto /editor
  webkit.js             same, in Playwright's bundled WebKit
  ios-safari.js         real Safari on an iOS Simulator, via Appium/WebDriver
  embed.js              goto /embed/embed1.html, sendReset, find the iframe
  vscode.js             boot @vscode/test-web, open the custom editor, find the webview
  vscode-ovsx.js        serve the webview via a simulated Open VSX (issue #21 repro)
shared/
  ovsx-server.js        static server that mimics Open VSX serving (text/plain+nosniff, size cap)
  load-cpo-specs.js     extract exact specs from code.pyret.org/test/*.js (no copying)
  page-assertions.js    in-page DOM port of util.js predicates (window.PA)
  cpo-assertions.js     node:assert assertions mirroring util.js, per content check
  dispatch.js           map a loaded spec to its assertion
  errors.js             ProceduralError (procedural failures vs content AssertionError)
  playwright-page.js    `page` adapter over a Playwright frame
  webdriver-page.js     the same adapter over a WebDriver session (ios-safari)
  envs.js               the one list of env names (run.js + suite.test.js share it)
  find-frame.js         locate the editor frame (the one with #runButton)
  browser.js            launch Chromium or WebKit
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

# webkit is the same page in a different engine (needs `npx playwright install webkit`):
BASE_URL=http://localhost:4999 node run.js --env=webkit

# vscode needs no CPO server (assets come from the built extension):
node run.js --env=vscode

# everything (starts the CPO server if needed):
./run-all.sh
```

`ios-safari` is macOS-only and needs more setup than the rest — Xcode with the
target simulator runtime installed, that simulator booted, and an Appium server
with the `xcuitest` driver. `webdriverio` is deliberately **not** in
`package.json` (it would make every Linux job install a macOS-only dependency),
so install it unsaved:

```bash
npm i --no-save webdriverio
npm i -g appium && appium driver install xcuitest
appium --port 4723 &

# boot a simulator on the runtime you want to test, then:
SIM_UDID=$(xcrun simctl list devices booted -j | jq -r '[.devices[][]][0].udid') \
  IOS_PLATFORM_VERSION=17.0 BASE_URL=http://localhost:4999 \
  node run.js --env=ios-safari
```

The simulator shares the host's network stack, so `localhost:4999` reaches the
CPO server with no tunnel. See the `test-ios-safari` job in
`.github/workflows/browser-test.yml` for the full sequence.

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
