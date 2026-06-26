# browser-test — running code.pyret.org's assertions on embed instances and vscode webviews

This directory runs the **same assertions** from `code.pyret.org`'s mocha suite
against two other places the Pyret editor shows up:

1. **The embed API's embedded instances** — the editor running inside an
   `<iframe>` host page (`/embed/embed1.html`), driven exactly like
   `code.pyret.org/test/embed.js`.
2. **The vscode extension's webviews** — the `pyret-parley.cpo` custom editor,
   running headless VS Code-for-the-Web via `@vscode/test-web` + Playwright (no
   desktop VS Code).

It is **strictly additive**: nothing under `code.pyret.org/` or `vscode/` is
modified. The upstream test files are read as-is.

## Why this is "the same tests"

All three environments render the **same CPO editor** (`editor.html`: CodeMirror,
`#runButton`, `#output`, `.check-block`, `.testing-summary`, "Looks shipshape").
Only the way you *reach* that DOM differs:

| Environment | How the editor is reached |
|---|---|
| `code.pyret.org` (baseline) | top-level page at `/editor` |
| embed instance | `<iframe id="embed1" src="/editor#controlled=true">` inside `/embed/embed1.html` |
| vscode webview | webview iframe of the `pyret-parley.cpo` custom editor, loading the same `editor.html` |

Two mechanisms keep the assertions and inputs identical to upstream:

- **Same inputs, zero copying** — `shared/load-cpo-specs.js` `require`s the
  unmodified upstream test files (`code.pyret.org/test/errors.js`,
  `check-blocks.js`, `chart.js`, `tables.js`, `type-check.js`) with the mocha
  globals and `util.js` replaced by *recording shims*. It captures the exact
  `(program, expected-content)` tuples upstream feeds to its assertions — so the
  same `check: 1 is 2 end → ["failed"]`, the same error→substring table, and the
  same `.arr` chart programs are used here. No spec is hand-copied.

- **Same assertions**
  - **embed** reuses `code.pyret.org/test-util/util.js` **unchanged**. The embed
    specs call the real `tester.testRunsAndHasCheckBlocks` /
    `testErrorRendersString` / `runAndCheckAllTestsPassed` /
    `checkTableRendersCorrectly` / `testRunAndUseRepl`; the only difference from
    upstream is a `before` hook that points the Selenium driver inside the embed
    iframe (`embed/embed-setup.js`).
  - **vscode** can't use Selenium (it can't reach a VS Code webview), so it uses
    `shared/page-assertions.js` + `shared/cpo-assertions.js`, a line-for-line
    **in-page port** of the same `util.js` predicates. That port is proven
    faithful by `fidelity/run-cpo-fidelity.js`, which runs it (via Playwright)
    against the very same `/editor` page and the very same specs and shows it
    passes exactly what `util.js` passes.

## Layout

```
shared/
  load-cpo-specs.js     extract exact specs from code.pyret.org/test/*.js (no copying)
  page-assertions.js    in-page DOM port of util.js predicates (window.PA)
  cpo-assertions.js     node-side orchestration mirroring util.js assertions
  playwright-page.js    `page` adapter over a Playwright frame
  run-specs.js          run loaded specs through the shared assertions
embed/
  embed-setup.js        Selenium setup that focuses the embed1 iframe
  *.spec.js             embed versions of errors/check-blocks/charts/tables/type-check
  probe.spec.js         small end-to-end sanity check
fidelity/
  run-cpo-fidelity.js   prove the in-page port == util.js, against /editor
vscode/
  run-vscode-tests.js   boot VS Code Web + Pyret extension, run specs in the webview
  fixture-workspace/    one test.arr opened by the custom editor
results/                captured run logs
```

## Running

Prereqs (one-time):

```bash
# code.pyret.org built + deps (already present in this checkout)
#   build/web/js/cpo-main.jarr, code.pyret.org/node_modules

# vscode extension built
cd vscode && ln -sf ../code.pyret.org/build build && npm install && npm run compile

# this harness's deps
cd ../browser-test && npm install

# a Chrome + a *matching* chromedriver for the Selenium (embed) path
#   export CHROMEDRIVER_BINARY=/path/to/chromedriver   (matching `google-chrome --version`)
```

Then, with the CPO server running (`BASE_URL=http://localhost:4999`):

```bash
./run-all.sh
# or individually:
#   (embed)    cd ../code.pyret.org && mocha ../browser-test/embed/*.spec.js
#   (fidelity) node fidelity/run-cpo-fidelity.js
#   (vscode)   node vscode/run-vscode-tests.js
```

The embed path needs the CPO server (the iframe loads `/editor`). The vscode
path does **not** need the CPO server — `@vscode/test-web` serves the editor
assets out of the built extension (`vscode/dist/web/build/web`).

## Results

See `RESULTS.md` for the captured run output and counts.
