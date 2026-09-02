# cli-repl: rebase onto drydock, and the test-timing bug it exposed

*Written by Claude (agent). Not written by Joe. Everything below marked "measured"
was produced by a command I ran on this machine (2 vCPU AMD EPYC 9554P, 7 GB RAM,
Node v24.20.0); everything else is read off the source.*

## What I did

`cli-repl` had three commits on top of merge base `c8a9b787e`: two real ones and
one merge (`e2149a3ef "Merge branch 'drydock' into cli-repl"`, which merged
`c8a9b787e` — i.e. the merge base itself — so it carried no content).

I ran a plain `git rebase drydock cli-repl`. Default rebase drops merge commits
and replays only the non-merge commits not already in the upstream, which is
exactly the two real ones; there was nothing in the merge worth preserving. A
`--rebase-merges` rebase or a fresh branch would both have produced the same
tree with more ceremony. The pre-rebase tip is kept locally as
`cli-repl-prerebase-backup` (`d7dc96ea5`).

New base: `a451b1c16`. Result: `b48a5a959` (`Add command-line REPL`), then
`b4165a6e2` (`Fix an issue where running the CLI twice...`).

### The one conflict

`npm/build.sh`. The REPL commit had changed it to build the compiler from this
monorepo's `lang/` instead of `git clone`-ing `brownplt/pyret-lang`. drydock has
since done the same thing and gone further (`cd "$(dirname $0)"`, `npm ci`, and
the `PYRET_NPM_TS=1` opt-in that also builds and stages `build/ts-compiler`). I
resolved in favour of drydock's version outright — the branch's hunk is entirely
superseded, including its `touch pyret-lang/.npmignore`, which drydock replaced
with a checked-in `npm/.npmignore`.

`lang/src/js/trove/load-lib.js` and `npm/pyret.js` auto-merged. The load-lib
overlap is benign: drydock reworked `runProgram`'s checker setup (hoisting
`make-check-context` under `safeCall`), the branch added `get-result-repr` and
`result-has-checks` alongside it. Different functions, no interaction.

Net diff against the new drydock tip is 9 files, +911/-54 (`build.sh` no longer
appears).

## Test status

Measured, `cd npm && npx jest test/`:

* `test/repl-multiline.test.js` — 19/19 pass.
* `test/repl.test.js` — 9/9 pass.

They passed on the first post-rebase run too, so nothing in 76 commits of
drydock broke the REPL's behaviour. But the first run took **181 seconds**, and
almost all of that was one bug, described next.

## The 3-minute `beforeAll`: the forked server inherits stdout

`repl-client.js` (and, identically, `client-lib.js`) starts the background
compile server with

```js
childProcess.fork(serverModule, ['-serve', '--port', portFile],
                  { stdio: [0, 1, 2, 'ipc'], ... });
```

`[0, 1, 2]` hands the child *the parent's own file descriptors*. The server then
outlives the client while still holding the write end of the client's stdout and
stderr. Anything waiting for EOF on those descriptors waits for the server to
die — not for the CLI to finish.

Measured consequences, all on the pre-fix code:

* `node pyret.js prog.arr | cat` printed its full output and then sat there; the
  pipeline only completed when I killed the server.
* A `child_process.spawnSync('node', ['pyret.js', 'prog.arr'], {stdio: 'pipe'})`
  probe never returned while the server lived. Its `timeout` is what eventually
  frees it.
* `test/repl.test.js` therefore burned its full `TIMEOUT` (180 000 ms) inside
  `beforeAll` before `spawnSync` gave up and returned the (complete, correct)
  output. Suite time: **180.9 s**, with every individual assertion at 1–4 ms.
* The same thing happens on drydock, in `test/cli.test.js`: measured
  `PASS test/cli.test.js (61.742 s)`, of which the first test —
  `test-unbound-error.arr` — reports **60 020 ms** against a `COMPILER_TIMEOUT`
  of 60 000. It passes only because that test expects a non-zero exit, and a
  `SIGTERM`-killed process has one. Every CI run of `npm test` is paying a
  silent minute for this.

### What I changed

Only in `repl-client.js` (the branch's own file):

```js
{ stdio: ['ignore', 'ignore', 'ignore', 'ipc'], ... }
```

The server writes nothing to those descriptors in normal operation —
`server.js` sets `LOG_LEVEL = ERROR` and everything the user sees travels back
over the websocket as `echo-log`/`echo-err`. Inheriting fd 0 was independently
hazardous: the server could consume the REPL's own stdin.

Measured after the change, same command, clean state (no server running, socket
removed):

```
PASS test/repl.test.js
PASS test/repl-multiline.test.js
Tests: 28 passed, 28 total
Time:  3.272 s
```

181 s → 3.3 s.

## Two things I did not change, and think you should

1. **`client-lib.js` has the identical `stdio: [0, 1, 2, 'ipc']`.** It is
   pre-existing on drydock, outside this branch's scope, and it is what costs
   `cli.test.js` its 60 seconds and wedges `pyret prog.arr` in any shell
   pipeline on a cold machine. The fix is the same one-line change. I left it
   alone because it is not this PR's code, but it is a real user-facing bug
   (first run of the CLI in a script or a Makefile appears to hang), not just a
   test-timing annoyance.

2. **`npm/package.json`'s `files` list.** I did change this one, because the
   branch is broken without it: it listed only `pyret.js` and `client-lib.js`,
   so `repl-client.js` would not have shipped in the published tarball and
   `pyret --repl` would have died with `Cannot find module './repl-client'` for
   anyone installing from npm. `repl-ui.js`, `repl-client.js` and
   `repl-local.js` are now listed.
