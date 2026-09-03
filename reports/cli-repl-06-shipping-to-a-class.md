# Getting the REPL to Shriram's students, and the `.jarr` portability annoyance

*Written by Claude (agent). Not written by Joe. Measured on the usual 2 vCPU /
7 GB / Node v24.20.0 box.*

Given the stated priorities — (1) Shriram wants the CLI REPL for his class,
(2) don't get locked into the bad server — this is what I checked and changed.

## The publish path would have shipped the bad REPL

`pyret --repl` now runs the ts compiler in this process. A package built
without `build/ts-compiler` silently falls back to the compile-server REPL:
the one that costs 33 ms per interaction instead of 11, leaks ~27 MB per
Ctrl-C restart, and wedges the session on Ctrl-C during a long computation
(reports 02 and 04). That is what a student would have got, and they would
never know there was another mode.

Two things caused that, both now visible:

* `build.sh` gated the ts build behind `PYRET_NPM_TS=1`. **Inverted** — it now
  builds unless `PYRET_NPM_TS=0`. It stopped being "strictly additive" the
  moment the default REPL depended on it.
* **Nothing in a release path sets it anyway.** `npm/.github/workflows/npm-publish.yml`
  runs `npm ci && npm run build && npm test && npm publish` with no
  `PYRET_NPM_TS`. It is also in `npm/.github/workflows/`, which GitHub does not
  read — only `.github/workflows/` at the repository root is, and that
  directory has `browser-test.yml`, `code.pyret.org-test.yml`, `lang-test.yml`
  and `npm-test.yml`, with **no publish workflow**. So either publishing is
  manual, or that file is a leftover from when `npm/` was its own repo. Either
  way, worth a look before the next release — I have not touched it, because I
  do not know which of the two it is.

Cost of the flip, measured: `build/ts-compiler` is **43 MB** staged against
phaseA's 100 MB; `make ts-compiler ts-libA` adds **23 s** on top of the phaseA
bootstrap; the packed tarball with both is **23 MB**.

## It does work from a real install

I packed the tarball, `npm install`ed it into a clean directory, and ran the
REPL from `node_modules/pyret-npm/pyret.js --repl`. Values, definitions,
`print`, check results, compile errors, and `include image` +
`image-width(circle(...))` returning 100 — so canvas resolves correctly through
the ts build's browserified bundle out of the installed tree. **No compile
server process was started.**

This is a genuinely different path through the package from the batch compile,
so `test/packaged-cli.test.sh` now drives `--repl` from the tarball too, and
asserts the in-process path was actually taken (a `Starting Parley server` in
the output when a ts build is present is now a test failure). Without that, a
regression in the build flag degrades silently for every student.

## On "is <200 ms interactive enough"

You are already well past your own bar on the REPL path, and the bar is the
wrong one for it. Measured, trivial program, warm server, median of 8:

| | pyret backend | ts backend |
| --- | --- | --- |
| `pyret --norun sub.arr` (compile only, via the server) | 384 ms | **163 ms** |

So the ts compile at the CLI is already inside 200 ms including node startup
and a socket round trip. But the REPL does not pay that per line, because it
never re-loads the libraries: an interaction in a warm realm is **6–18 ms**,
and `include image` — pulling in the whole image library — is **46 ms**
(report 02). The 163 ms number is the right one for a *batch mode* you might
layer on later; the REPL is an order of magnitude below it.

## The `.jarr` portability annoyance, diagnosed

Your note that "the .jarr needs to be in place where it can find all the right
node_modules" is exactly right, and it turns out to be smaller than it looks.

Measured: copy a generated `p.jarr` into a directory with no `node_modules`
anywhere above it, and:

```
$ node p.jarr
Error: Cannot find module 'resolve'
$ echo $?
1
```

Grepping the generated standalone, the **only** modules it asks the host for at
runtime are:

```
nodeRequire("fs")        # node builtin
nodeRequire("http")      # node builtin
nodeRequire("path")      # node builtin
nodeRequire("readline")  # node builtin
nodeRequire("resolve")   # <-- not a builtin
```

Everything else — canvas, seedrandom, js-sha256, js-md5, q, s-expression,
fast-csv, cross-fetch, buffer, source-map — is browserified *into* the bundle
by `src/js/trove/require-node-dependencies.js`. So a `.jarr` is one npm package
away from being self-contained, plus `vega`, which that file finds by path
(`nodeRequire.resolve('vega')`) and which is genuinely too big to inline and
only needed for charts.

Looking at `require-node-dependencies.js`, everything above uses
`require(...)` (so browserify bundles it) and everything below uses
`nodeRequire(...)` (so it stays external). `resolve` sits in the second group,
in among `fs`, `readline`, `path` and `http` — which are all node builtins.
`resolve` is not. That grouping looks like an oversight rather than a decision:
moving that one line up would make every non-charting `.jarr` runnable from
anywhere, which is the annoyance you named.

I have not changed it. It is in `lang/`, it grows every generated standalone by
however big `resolve` is, and the charting case still needs `vega` on the path —
so it is a decision about what "standalone" is supposed to mean, not a bug fix
I should make unasked. But it is a one-line experiment if you want the number.

## Small thing, done

`repl-local.js` no longer symlinks `node_modules` into `.pyret/`. I had added it
for parity with the server path; verified unnecessary — with the symlink absent,
`include image` still resolves canvas, because the in-process REPL never loads a
generated `.jarr` and gets its natives from the ts build's own bundle. The
server-backed path still creates it, because there it is what lets
`node .pyret/foo.jarr` find its runtime deps. One less stray symlink into the
package's guts in a student's project directory.

## What I would do next, against your two priorities

**For (1), the class:**

* Confirm how releases actually happen, and that whatever does it now builds
  the ts compiler. This is the only remaining thing between the good REPL and
  the students.
* Ask Shriram what "the local storage file" meant (report 03). If it is REPL
  history, that is a small, high-value thing for a class — Node's `readline`
  takes a `history` array, so it is read-a-file/write-a-file, and it is the
  single most-missed REPL affordance.
* Fix the CLI's swallowed argument errors (report 03). One line, and it is the
  reason he thought a flag existed that never has.

**For (2), not getting locked in:**

* The REPL is already off the server. The remaining users are the batch path
  and `--repl --backend pyret`.
* The client-side guard from report 05 — exit non-zero when the connection
  closes without a verdict — is worth doing whatever else happens, because it
  turns an entire class of silent wrong answer into a loud one, including the
  autograder false-pass and a server dying mid-compile.
* Do not build anything new on the current protocol. If a batch/grade mode
  happens, it wants the in-process host from report 02, not another command on
  the websocket.
