# The autograder case: a correctness bug, and where the time actually goes

*Written by Claude (agent). Not written by Joe. Measured on a 2 vCPU AMD EPYC
9554P / 7 GB / Node v24.20.0 box. Harness in `cli-repl-bench/`
(`test-concurrent.js`, `bench-autograder.sh`).*

Joe's correction: the tight loop does matter, precisely for autograders. That
is the strongest case for keeping the compile server, and I had been too quick
to write it off. It also puts weight back on the concurrency bugs I demoted in
report 04, because an autograder is the one thing likely to run `pyret` with
`-j`. So I tested it instead of asserting it.

## 1. Parallel grading against a shared server gives wrong answers

`test-concurrent.js` builds N "submissions", each in its own directory. Even
ones are correct and print a marker unique to that submission; odd ones have a
compile error naming an identifier unique to that submission. They are run
against **one warm compile server** at a given parallelism, and each
invocation's output is checked against its own submission.

| backend | parallelism | result |
| --- | --- | --- |
| pyret | 1 | 8/8 correct |
| pyret | 2 | **fails** — 1 broken submission exited 0 |
| pyret | 4 | **fails** — reproduced 4×, ~6 problems of 8 each time |
| pyret | 8 | **fails** — 3 broken submissions exited 0 |
| ts | 1 | 8/8 correct |
| ts | 4 | 8/8 correct |

A representative `-j4` run:

```
sub3 (broken) never reported its own unbound name; exit=0
sub3 (broken) exited 0
sub4 (ok)     never printed its own marker; exit=0
sub6 (ok)     never printed its own marker; exit=0
sub7 (broken) never reported its own unbound name; exit=0
sub7 (broken) exited 0
```

**A submission that does not compile exits 0 with no diagnostic.** Any grader
keyed on exit status marks it correct. A submission that does compile can exit 0
without ever running, so its output is empty. Both are silent wrong answers, and
both are reproducible.

### Why

Three things compose:

* `tryQueue` has **no in-flight guard**. Every incoming message does
  `runQueue.push(...)` and then calls `tryQueue()`, which immediately pops and
  runs. There is nothing that says "a job is already running", so the queue
  never actually queues — a second client's compile is launched straight into
  the same `runtime.runThunk` while the first is still in flight. On the Pyret
  runtime, which is one trampoline, that is not survivable.
* `tryQueue`, `respond` and `connection.close()` are defined **inside the
  `'connection'` handler** while `runQueue` is per-server, so a job's verdict
  can be written to a different client's socket.
* `client-lib.js` has **no handling for "the connection closed without a
  verdict"**. It waits for `compile-success` or `compile-failure`; if neither
  arrives, the socket closes, the event loop drains, and node exits **0**.

The TS server survives the same test, I think because its compiles are ordinary
async JS calls rather than re-entrant trampoline runs — but it has the same
per-connection `respond` and the same missing guard, so I would not call it safe,
only lucky here. It also still has the global `setBuiltinJsDirs` state that this
test does not exercise.

### Fixes, both small

1. **Server**: give `tryQueue` an in-flight flag, `shift()` instead of `pop()`
   (report 04, bug 1 — the docs already promise FIFO), and queue
   `{message, connection}` so a job answers its own client. ~15 lines in
   `server.js`, mirrored in `server.ts`.
2. **Client**: on `close` without a verdict, exit non-zero with a message.
   This is worth doing *regardless* — it also catches a server that dies
   mid-compile, which today is likewise a silent exit 0.

Until then the safe configurations are: parallelism 1, or one server per worker
(`--port` per slot), or the ts backend.

## 2. Where the per-submission time actually goes

A trivial submission (`print` plus one `check`), warm server, median of 8:

| | pyret backend | ts backend |
| --- | --- | --- |
| `pyret sub.arr` (compile + run) | 685 ms | 495 ms |
| `pyret --norun sub.arr` (compile only) | 384 ms | 163 ms |
| `node .pyret/sub.jarr` (run only) | 304 ms | 303 ms |
| bare `node -e ''` | 18 ms | 20 ms |
| generated standalone | 8.8 MB | 8.8 MB |

**About 300 ms of every submission is loading and running an 8.8 MB generated
standalone**, identical on both backends and entirely unrelated to the compile
server. On the ts backend that is 60% of the per-submission cost. Bare node
startup is 20 ms, so it is the 8.8 MB, not the process.

The compile server is still worth keeping for the other half — from report 02's
batch table, a two-module program costs 2151 ms with a cold server and 663 ms
with a warm one on the pyret backend (878 → 443 on ts). Over 200 submissions
that is minutes. I am not arguing against the daemon here.

But it does mean the daemon is optimising the smaller half of the bill, and the
larger half is structural: every submission re-emits and re-loads a standalone
that is ~99% the same libraries as the last one, because every submission in an
assignment imports the same things.

## 3. The lever this suggests

The in-process REPL built in report 02 already does the thing that removes that
cost: load the libraries once into a realm, then compile and run many programs
*into that realm*. Measured there, in an already-warm realm:
`check: 2 + 2 is 4 end` costs **18 ms**, and `include image` — pulling in the
whole image library — costs 46 ms. Against 685 ms per submission today.

That is not an apples-to-apples number and I want to be clear about it: those
are interactions in a shared realm, not isolated runs of a whole submission, and
a real batch mode would need a fresh realm per submission to keep one student's
definitions out of the next student's namespace. But two orders of magnitude of
headroom is not going to be eaten by that.

So the shape I would suggest for autograding is **not a better daemon**, it is a
batch mode: `pyret --grade dir/*.arr`, one process, libraries loaded once,
a fresh realm per submission, results emitted per file. That is `repl.ts` plus
the in-process host from report 02 with a different driver, and it needs no
socket, no protocol, and no concurrency story at all — the parallelism becomes
"run four of these processes over a quarter of the submissions each", which is
safe by construction because they share nothing.

The obvious objection is isolation: student code can loop forever, call `exit`,
or exhaust memory, and in a shared process that takes the harness with it. Node
has no `fork(2)`, so "load once then fork per submission" is not available. The
practical answer is a worker that grades submissions until one kills it, and a
supervisor that restarts it and marks that submission as crashed — which is what
autograders do anyway, and which is cheap when a worker costs 700 ms to start
(report 02's in-process REPL startup) rather than the current cold-server 1.6 s.

I have not built any of this. Flagging it because it is the same machinery, and
because the measurement says the daemon is not where the autograder's time is
going.
