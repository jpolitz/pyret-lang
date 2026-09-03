# A CLI REPL with no compile server: what it costs, what it buys

*Written by Claude (agent). Not written by Joe. Every number below was produced
by a command I ran on this box — 2 vCPU AMD EPYC 9554P, 7 GB RAM, Node v24.20.0,
nothing else running during the timed runs. The harness scripts are in the
session scratchpad, not committed; the ones that matter are described inline so
you can re-run them.*

## Short version

`pyret --repl --no-server` now works. It runs the TypeScript compiler and a
Pyret runtime in the CLI process — no compile server, no socket, no subprocess,
no `--shutdown`.

Measured, medians:

|                                   | startup to first prompt | per-expression |
| --------------------------------- | ----------------------- | -------------- |
| `--repl --no-server` (in-process) | **703 ms**              | **11 ms**      |
| `--repl` with a server already up | 394 ms                  | 33 ms          |
| `--repl` with no server running   | 1592 ms                 | 58 ms          |

The server buys the REPL **one thing: about 300 ms of startup, and only if a
server happens to already be running.** That is the whole of X. Against it: 3×
the per-expression latency, 900 ms of extra cold start when it isn't already up,
330 MB of extra resident memory in a second process, the entire socket
lifecycle, and — measured, twice — a Ctrl-C that shows "Interrupted" and then
never answers again.

For an interactive REPL I do not think that trade is worth it. Recommendation at
the end.

## What I built

Three files in `npm/`:

* **`repl-ui.js`** — the terminal front end, lifted out of `repl-client.js`
  unchanged: `needsContinuation`, the readline loop, the interaction queue, the
  response renderer. It takes a *back end* object with `interact(code)`,
  `close()`, `interrupt()`. `interact` resolves to an array of the same message
  shapes the compile server already sends (`repl-value`, `repl-check`,
  `repl-error`, `repl-stdout`, …), so both back ends render through identical
  code and the comparison is not confounded by the UI.
* **`repl-client.js`** — now just the server back end: `repl-start` /
  `repl-interact` / `repl-close` over the websocket, as before. It still
  re-exports `needsContinuation` so `repl-multiline.test.js` is untouched.
* **`repl-local.js`** — the new in-process back end.

`pyret.js` gains `--no-server` (client group). `--no-server` selects the `ts`
backend automatically *when no backend was named on the command line* —
`--repl --no-server --backend pyret` reports the conflict rather than quietly
switching. (`commandLineArgs`' `defaultValue` makes an explicit
`--backend pyret` indistinguishable from the default, so that check reads
`process.argv` directly.) Conversely `--repl --backend ts` now routes to the
in-process path, because `server.ts` has no `repl-*` commands at all and that
combination would otherwise hang.

`npm/test/repl-local.test.js` runs the same session and the same assertions as
`repl.test.js` against the new path, skipped unless the package was built with
`PYRET_NPM_TS=1`.

## Why the TypeScript compiler, and why that was already 90% done

drydock already contains everything needed except the CLI wiring:

* `lang/src/ts-compiler/src/repl.ts` is a full port of `src/arr/compiler/repl.arr`
  — the same `makeDefinitionsLocator` / `restartInteractions` /
  `makeInteractionLocator` / `runInteraction` shape that `test-repl.arr` drives,
  with the runtime touchpoints factored behind a `ReplExecutor` interface.
* `lang/src/ts-compiler/tests/in-process-host.js` supplies that executor by
  booting a real Pyret runtime and load-lib in-process and calling
  `run-program` against a persistent realm — the same thing CPO does in the
  browser. `make ts-repl-test` already exercises it.

So the honest description of this work is "productise the test harness". The
compile side is `repl.ts`; execution is load-lib's `run-program`; the rendering
uses the *same* `load-lib` entry points `server.arr` uses (`get-result-repr`,
`result-has-checks`, `render-check-results`, `render-error-message`), so output
matches the server path line for line.

The one thing I did differently from `in-process-host.js`: it gets its AMD
environment from the `requirejs` npm package and resolves native deps
(`seedrandom`, `js-sha256`, `canvas`, …) out of `lang/node_modules`. Neither is
available in the published package. `repl-local.js` instead assembles the AMD
environment the way `make-standalone.ts` assembles the top of every `.jarr` —
`js/amd_loader.js` + `bundled-node-deps.js` + the raw-JS files named in
`config.json` — and evaluates it. That needs nothing the package doesn't already
ship, and adds no new npm dependency.

**There is no in-process host for the Pyret-hosted compiler from node.** A
`.jarr` is a closed standalone with no exported API, and the only way into
`repl.arr` from outside is to compile a driver `.arr` and run it. That is why
`--no-server` is TS-only, and it is also the main caveat on the numbers below:
the comparison moves two variables at once. I isolate the compiler contribution
in the batch table.

## Measurements

Method: `bench-repl.js` spawns `node pyret.js --repl [...]` with piped stdio,
watches for the `>>> ` prompt (readline writes it even when stdin isn't a TTY),
and times spawn → first prompt, then write-a-line → next prompt. Fresh working
directory per run. Warm-up run of each path discarded.

### Startup and per-expression

n=5 for the in-process and warm-server rows, n=3 for the cold-server row (each
preceded by killing the server and removing the socket).

|                    | startup median | min–max     | per-expression median |
| ------------------ | -------------- | ----------- | --------------------- |
| in-process         | 703 ms         | 661 – 758   | 11 ms                 |
| server, already up | 394 ms         | 351 – 483   | 33 ms                 |
| server, cold       | 1592 ms        | 1592 – 1634 | 58 ms                 |

Per expression, medians across runs:

| expression                              | in-process | server warm | server cold |
| --------------------------------------- | ---------- | ----------- | ----------- |
| `1 + 1`                                  | 12         | 33          | 60          |
| `x = 10`                                 | 10         | 30          | 57          |
| `x + 5`                                  | 7          | 27          | 41          |
| `[list: 1, 2, 3]`                        | 11         | 33          | 55          |
| `fun sq(n): n * n end`                   | 12         | 34          | 65          |
| `sq(12)`                                 | 6          | 30          | 56          |
| `check: 2 + 2 is 4 end`                  | 18         | 62          | 87          |
| `[list: 1,2,3].map(lam(n): n + 1 end)`   | 7          | 39          | 41          |
| `include image`                          | 46         | 99          | 112         |
| `image-width(circle(50, "solid", "red"))`| 15         | 17          | 21          |

Whole 10-expression session, spawn to exit: in-process 871 ms, server-warm
759 ms, server-cold 2211 ms.

The floor matters more than the median here. 6–12 ms is below the threshold
where a REPL feels like it is thinking; 30–60 ms is where it starts to feel like
a network service, which is what it is.

### Importing a file from the project

Three consecutive sessions in the same directory, each running
`import file("helper.arr") as H` (a ~30-line module with a `data` definition and
three functions) and then two calls into it. The server stayed up across all
three server-path sessions.

|                        | session 1  | session 2 | session 3 |
| ---------------------- | ---------- | --------- | --------- |
| in-process, startup    | 707        | 726       | 775       |
| in-process, the import | 59         | 59        | 72        |
| server, startup        | 1563 (cold)| 509       | 404       |
| server, the import     | 318        | 234       | 177       |

The server does get faster across sessions — 318 → 234 → 177 ms — which is its
in-memory module cache doing its job. It never catches the in-process path's
flat ~60 ms.

**Neither path writes anything to `.pyret/compiled`.** After all six sessions
above, the directory was empty in both project trees. The REPL's interaction
locators declare `needsCompile: true` with a no-op `setCompiled`, so nothing is
persisted; the only cache that matters is the read-only precompiled stdlib that
ships in the package (`build/*/lib-compiled`). Which is also why "cold" here is
so cheap: there is nothing to compile at startup in either path.

### Isolating the compiler from the architecture

`pyret main.arr` on a two-module project, both backends server-backed, so the
only variable is the compiler:

|                   | cold (forks a server) | warm server, cache hit | warm server, cache cleared |
| ----------------- | --------------------- | ---------------------- | -------------------------- |
| `--backend pyret` | 2151 ms               | 663 ms                 | 977 ms                     |
| `--backend ts`    | 878 ms                | 443 ms                 | 547 ms                     |

The TS compiler is roughly 1.5–2× faster at the same job. So of the 3× gap in
per-expression REPL latency, call it 2× compiler and the rest protocol: a fresh
websocket connect, a JSON round trip, and a connection close *per interaction*
(the server closes after every message). At equal compilers, in-process would
still win — just by less. I can't measure that directly without an in-process
host for the `.arr` compiler.

For completeness: `make ts-compiler ts-libA` from a clean `build/ts-compiler`
took **23.3 s real / 27.2 s user** — that is npm-installing tsc, generating the
parser, `tsc -p`, precompiling all 72 stdlib modules and linking `libs.jarr`.
The phaseA bootstrap it replaces takes minutes.

### Memory

Idle at the prompt after two interactions:

| in-process | server-backed |
| ---------- | ------------- |
| **193.5 MB**, one process | 57.0 MB client + 466.3 MB server = **523.3 MB**, two processes |

(Both sampled by the same script at the same point in a session — two
interactions in, then idle for 12 s. A spot `ps` taken during a busier moment
of an earlier in-process run read 300.7 MB, so treat 193.5 MB as the settled
figure rather than a peak.)

The server is a 29 MB standalone `.jarr` started with
`-max-old-space-size=8192`, and it stays resident after you close the REPL until
someone runs `--shutdown`.

### Ctrl-C

Test: define a tail-recursive non-terminating `spin`, call it, wait 3 s, send
SIGINT, then send `7 * 6` and see whether the REPL answers `42`.

| | "Interrupted" banner | answers afterwards |
| --- | --- | --- |
| in-process   | yes | **yes** (2/2 runs) |
| server-backed| yes | **no** (2/2 runs) |

I expected the opposite — a separate server process ought to be the easy place
to interrupt a runaway loop — but the in-process path is the one that recovers.
The Pyret runtime trampolines through the event loop often enough that
`runtime.breakAll()` from the SIGINT handler lands, and the prompt comes back
clean. On the server path the client sends `{command: "stop"}` on a *new*
connection, optimistically sets `interacting = false`, and prints the banner;
the original `repl-interact` connection never closes, its promise never
resolves, and the session is wedged. I believe that is a fixable bug in the stop
handling rather than anything inherent — but it is the state of the code today,
and it is the failure mode a student will hit first.

## So what is the server actually buying?

**Exactly one measured thing: ~300 ms of REPL startup (394 vs 703), and only
when a server is already running.** If it isn't, it costs 900 ms instead.

That is the whole of X. It is not nothing — it is the difference between a
prompt appearing in a third of a second and in three quarters of a second — but
it is a one-time cost paid once per session, set against a per-interaction cost
paid hundreds of times.

Three things the server *does* still buy that this work doesn't touch:

1. **The batch path.** `pyret file.arr`, run over and over from a shell or a
   Makefile or a grading script, genuinely benefits from a warm compiler shared
   across invocations — that is what it was built for, and the batch table above
   shows it (2151 ms cold → 663 ms warm). Nothing here changes that.
2. **`--backend pyret`.** There is no in-process host for the Pyret-hosted
   compiler, so the server is the only way to get a REPL on it.
3. **Isolation.** A runaway `while true` that exhausts memory takes down the
   server, not your terminal. In-process it takes down the REPL. In practice
   both mean "start over", so I don't weight this heavily.

And what it costs, beyond the latency: `--shutdown`, `--port`, the "compiler is
newer than the socket, restart the server" branch, a second process holding
half a gigabyte, servers shared across unrelated project directories, and two
bugs that exist only because there is a daemon at all — the
`stdio: [0,1,2,'ipc']` fd inheritance documented in report 01, and a stale
socket file (any `kill -9`, OOM or reboot) making the CLI exit **0** without
compiling anything, also in report 01. The `--help` text is already candid about this — *"This server is
experimental, and likely can get stuck running, or lose track of its
connection"* — and every one of those failure modes simply does not exist on the
in-process path.

## Recommendation, and what shipped

I originally left the default alone as a product decision. Joe's call was to
flip it, so as of `e6211fd6a`:

* `pyret --repl` runs in-process whenever the package ships the ts compiler.
* `--server` opts back in. It is also selected implicitly by `--port` and
  `--shutdown` (which mean nothing in-process), by an explicit
  `--backend pyret` or `PYRET_COMPILER`, and as a silent fallback when the
  package was built without `PYRET_NPM_TS=1`.
* `--repl --server --backend ts` is refused with a message rather than left to
  hang, since `server.ts` has no `repl-*` commands.
* The batch path is untouched. `pyret prog.arr` still uses the server, which is
  the case where a warm compiler shared across invocations is the whole point —
  see the batch table above.

Still outstanding: **fix the server's `stop` handling**. A REPL where Ctrl-C
wedges the session is worse than one with no Ctrl-C at all, and the server-backed
REPL is still the only REPL on the pyret backend.

## Known gaps in what I built

* **The in-process path is TS-only.** `--backend pyret` therefore always means
  the server; that is now a routing rule rather than an error.
* **No `--type-check` verification.** `repl-local.js` threads
  `typeCheck: options['pyret-options']['type-check']` into the compile options,
  and `repl.ts` honours it, but I did not test a `--repl --no-server -y`
  session.
* **`interrupt()` is `breakAll()`**, which stops *everything* on the runtime,
  not just the current interaction. There is only one interaction in flight at a
  time, so this is correct today, but it is blunter than the server's `stop`.
* **Compile-error rendering re-implements `toRepr`.** `cli-module-loader.ts` has
  a private one for the same purpose and does not export it;
  `repl-local.js` has a small copy. Exporting the original would be better.
* **Nothing is cached to disk between sessions**, same as the server path. If
  someone wants REPL startup below ~700 ms, persisting compiled interactions or
  a warm realm snapshot is the lever — not a daemon.
