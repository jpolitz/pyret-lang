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
`image-width(circle(...))` returning 100. **No compile server process was
started.**

*(An earlier revision of this report said that showed canvas resolving through
the browserified bundle. Both halves of that were wrong — see the correction
below. `image-width` of a circle is arithmetic and never rasterizes, so that
test did not touch canvas at all. A test that does rasterize —
`image-to-color-list(circle(2, "solid", "red"))` — returns real antialiased
pixel data in the packaged REPL, so canvas does work; just not for the reason
I gave.)*

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

## Correction: canvas is not, and cannot be, bundled

Joe's correction, and he is right: `canvas` is a compiled module, so
browserify cannot inline it — making that work needs per-platform prebuilt
binaries, which is a lot of work. What I had not checked is what browserify
*did* do instead, and it is worse than "left it out".

`canvas`'s package.json has `"browser": "browser.js"`, and browserify honours
the browser field by default. So `require("canvas")` in
`src/js/trove/require-node-dependencies.js` bundled **the browser DOM shim**:

```js
83:[function(require,module,exports){
/* globals document, ImageData */
exports.createCanvas = function (width, height) {
  return Object.assign(document.createElement('canvas'), { width, height })
}
```

That is what `define("canvas", ...)` registers. In node, `document` is
undefined, so it is not a fallback — it is a landmine.

The reason images work anyway is `src/js/base/amd_loader.js`. Its
`evaluateModuleFn` checks `isAvailableNodeModule(name)` **first** and, if node
can resolve the name, does a real `require(name)` and never runs the bundled
`define` callback at all:

```js
if(isAvailableNodeModule(moduleObj.name)) {
  moduleObj.val = require(moduleObj.name);
  moduleObj.resolved = true;
  return;
}
```

So the loader prefers a real installed module over the bundled copy, for every
name. `canvas` is a dependency of `pyret-npm`, so it is installed, so images
work. The bundle's canvas entry is never reached — until it is.

Measured, to be sure of the failure mode: a `.jarr` that calls
`image-to-color-list`, run in a directory whose `node_modules` has **every**
dependency except `canvas`:

```
exit=5
The run ended in error:
Abstraction breaking: Uncaught JavaScript error:
ReferenceError: document is not defined
    at exports.createCanvas (img.jarr:14445:24)
    at makeCanvas (img.jarr:171838:29)
    at Object.imageToColorList (img.jarr:173212:16)
```

Not "Cannot find module 'canvas'". `document is not defined`, five frames deep
in the image library.

**Two consequences.**

*It is a bad error for a student.* `canvas` installs through
`prebuild-install`, which falls back to a `node-gyp` build when there is no
prebuilt binary for the platform, which fails without build tools. A student
whose canvas install fell over gets `document is not defined` on their first
image program, with nothing pointing at the real cause. Changing
`canvas = require("canvas")` to `canvas = nodeRequire("canvas")` in
`require-node-dependencies.js` would leave it out of the bundle entirely and
turn that into an honest `Cannot find module 'canvas'`. One word, and it is
the mirror image of the `resolve` grouping below — `resolve` is in the
`nodeRequire` group and should probably be bundled; `canvas` is in the
`require` group and definitely should not be.

*The same substitution has happened to `cross-fetch`.* Its package.json has
`"browser": "dist/browser-ponyfill.js"`, and the bundle contains two
`XMLHttpRequest` references and no `http.request` — so it is the browser
ponyfill, not the node build. Unlike canvas, `cross-fetch` is **not** a
dependency of `pyret-npm`, so the packaged CLI always takes the bundled copy.
I have not tested whether Pyret's `fetch` actually breaks there — modern node
has a global `fetch` the ponyfill may defer to — so this is "same shape, worth
checking", not a demonstrated bug. Checked all ten bundled deps; `canvas` and
`cross-fetch` are the only two with a substituting browser field (`js-md5`'s
only stubs out `crypto`/`buffer`, which is harmless).

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
`resolve` is not. That grouping looks like an oversight rather than a decision.

**But moving it does not buy relocatability**, and I overclaimed when I first
wrote this. Per the correction above, `resolve` is only the *first* thing that
breaks in an isolated directory; any program that rasterizes still needs a real
installed `canvas`, and that genuinely cannot be bundled. Charting still needs
`vega` on the path. So the honest scope of the `resolve` fix is: non-image,
non-charting `.jarr` files become runnable from anywhere. That may still be
most student programs, and it may not be worth it. Your call — I have not
changed it, it is in `lang/`, and it grows every generated standalone.

## Small thing, done

`repl-local.js` no longer symlinks `node_modules` into `.pyret/`. I had added it
for parity with the server path; verified unnecessary — with the symlink absent,
`include image` and `image-to-color-list` both still work, because the
in-process REPL never loads a generated `.jarr`, and its natives resolve from
the *package's own* `node_modules` through `repl-local.js`'s `require` (not,
as I first wrote, from the bundle — see the correction above). The
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
