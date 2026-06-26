# Results

One runner (`run.js`), one in-page port of `util.js`, three environments. Each
environment runs the **same five suites** loaded from the unmodified
`code.pyret.org/test/*.js`, so all three land on the **same 236 assertions**.

Captured logs in `results/`. Reproduce with `./run-all.sh` (or `node run.js
--env=<env>`).

| `--env` | What it drives | Result |
|---|---|---|
| `cpo` | `code.pyret.org` `/editor` (reference) | **236 passing, 0 failing** |
| `embed` | embed API embedded instance (`#embed1` iframe) | **236 passing, 0 failing** |
| `vscode` | `pyret-parley.cpo` webview (headless VS Code Web) | **236 passing, 0 failing** |

Per-suite breakdown (identical in every environment):

| Suite (upstream file) | assertion (util.js → port) | count |
|---|---|---:|
| check-blocks (`test/check-blocks.js`) | `testRunsAndHasCheckBlocks` | 29 |
| errors (`test/errors.js`) | `testErrorRendersString` + `testRunsAndHasCheckBlocks` | 193 |
| charts (`test/chart.js`) | `runAndCheckAllTestsPassed` → "Looks shipshape" | 10 |
| type-check (`test/type-check.js`) | `testRunAndUseRepl` (typeCheck) | 3 |
| tables (`test/tables.js`) | `checkTableRendersCorrectly` | 1 |
| **total** | | **236** |

## What this shows

- The **same `checkAllTestsPassed` / "Looks shipshape"** gate that passes chart
  programs upstream passes the same 10 chart `.arr` files in the `/editor`
  reference, an embed instance, and a vscode webview.
- The **same error-rendering checks** verify the same text content (193 cases),
  the **same check-block content checks** match the same substrings (29 cases),
  the **same type-checked REPL evaluations** return the same values (3 cases),
  and the **same table cells** render identically to their value expressions —
  everywhere.

## On equivalence to `util.js`

`--env=cpo` runs the port against the real `/editor` page and reproduces
upstream's pass/fail, which is what makes the port a trustworthy stand-in for
`util.js`. The port was additionally validated head-to-head against the actual
Selenium `util.js` suite while the harness was being built: that earlier
dual-path stage (committed history of this directory) showed the `util.js` path
and the port producing identical results (embed 240 via `util.js`; fidelity
224+4 and vscode 236 via the port) before the harness was consolidated onto the
single port-based runner.

## Notes

- `cpo` and `embed` need the CPO server (they load `/editor`); `vscode` does not.
- Charts are slow (~38s each), so a full run is several minutes per environment.
- A couple of webview-specific details the port handles: the custom editor
  reveals its REPL on the first run (`beforePyret.js:1594`); the run mode is
  sticky, so `PA.run()` selects the explicit "Run" item (`cpo-main.js`); and the
  editor's initial contents are awaited (CM non-empty) before each program is
  installed, so `setDefinitions` can't race the custom editor's content push.
