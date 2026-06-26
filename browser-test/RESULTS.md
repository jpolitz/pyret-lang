# Results

Captured runs (logs in `results/`). Every number below is the **same assertion**
from `code.pyret.org`'s mocha suite checking the **same content** on the **same
test program**, just in a different environment.

## Baseline — code.pyret.org `/editor` (upstream, unmodified)

Ran upstream mocha directly as a control (`code.pyret.org` + Selenium):

```
Basic page loads            ✔ load the editor
Rendering check blocks      29 passing      (test/check-blocks.js)
Embedding API               4 passing, 1 pending  (test/embed.js)
```

## Target 1 — Embed API embedded instances  →  240 passing, 0 failing

`results/embed-all.txt`. The embed specs reuse `code.pyret.org/test-util/util.js`
**unchanged**; only the `before` hook differs (it focuses the Selenium driver
inside the `<iframe id="embed1">` of `/embed/embed1.html`). Inputs come straight
out of the upstream test files via `shared/load-cpo-specs.js`.

| Suite (upstream file) | assertion reused from util.js | count |
|---|---|---:|
| probe | testRunsAndHasCheckBlocks / testErrorRendersString / testRunAndAllTestsPass | 4 |
| check-blocks (`test/check-blocks.js`) | `testRunsAndHasCheckBlocks` | 29 |
| errors (`test/errors.js`) | `testErrorRendersString` + `testRunsAndHasCheckBlocks` | 193 |
| type-check (`test/type-check.js`) | `testRunAndUseRepl` (typeCheck) | 3 |
| tables (`test/tables.js`) | `checkTableRendersCorrectly` | 1 |
| charts (`test/chart.js`) | `runAndCheckAllTestsPassed` → `checkAllTestsPassed` ("Looks shipshape") | 10 |
| **total** | | **240** |

## Fidelity — in-page port vs `/editor`  →  224 passing, 0 failing

`results/cpo-fidelity-full.txt`. The vscode path can't use Selenium, so it uses
the in-page port (`shared/page-assertions.js` + `shared/cpo-assertions.js`).
This run drives that port, via Playwright, against the **same** `/editor` page
and the **same** specs `util.js` checks — proving the port is a faithful stand-in.

| Suite | count |
|---|---:|
| check-blocks | 29 |
| errors | 193 |
| charts | 2 |
| **total** | **224** |

## Target 2 — vscode extension webviews  →  232 passing, 0 failing

`results/vscode-full.txt`. Real VS Code for the Web (headless, via
`@vscode/test-web`) loads the `vscode/` extension; Playwright opens `test.arr`,
which the `pyret-parley.cpo` custom editor renders as a webview of the same
`editor.html`. The same specs run through the same (ported) assertions inside
that webview frame.

| Suite (upstream file) | count |
|---|---:|
| check-blocks (`test/check-blocks.js`) | 29 |
| errors (`test/errors.js`) | 193 |
| charts (`test/chart.js`) | 10 |
| **total** | **232** |

All 10 chart programs that pass upstream also pass in the vscode webview
(e.g. `bar-chart-test.arr`, `box-plot-test.arr`, `image-pie-chart-test.arr`, …),
and the full error-rendering table (`field-not-found → "did not have a field"`,
the entire `is`/`is==`/`raises-satisfies`/… matrix) checks the same substrings.

## What this shows

- The **same `checkAllTestsPassed` / "Looks shipshape"** assertion that gates
  chart programs upstream passes on the same chart `.arr` files in both an embed
  instance and a vscode webview.
- The **same error-rendering checks** (`testErrorRendersString`) verify the same
  text content (193 cases) in all three environments.
- The **same check-block content checks** (`testRunsAndHasCheckBlocks`, 29 cases)
  match the same expected substrings everywhere.

Reproduce with `./run-all.sh` (see `README.md`).
