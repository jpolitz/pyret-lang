# Is the compile server the right architecture?

*Written by Claude (agent). Not written by Joe. This one is largely a read of
`lang/src/arr/compiler/server.js`, `server.arr`, `src/ts-compiler/src/server.ts`
and `npm/client-lib.js`; where I say "measured" I ran something, and where I say
"reading" I did not.*

Joe asked whether the websocket compile server is a good design or just the
thing that got hacked up first. Short answer: **the transport is the least
interesting thing wrong with it.** WebSockets over a unix socket are wasted
rather than harmful. The protocol on top of them is where the real problems
are, and there are four concrete bugs in it.

## What is actually there

Reading `server.js` (the Pyret-hosted server; `server.ts` is a faithful port
with the same shape):

* An `http.createServer` that 404s every request, existing solely to be
  upgraded away by `ws.Server`.
* Listening on a **unix domain socket** — `/tmp/parley-<username>/comm.sock`.
  Not TCP. No browser can reach it, no other machine can reach it.
* **One message per connection.** `tryQueue` calls `connection.close()` after
  every job, and the client's `wsRound` opens a connection, sends one message,
  and collects responses until close.
* Messages are `{command, ...}` JSON, with the compile options **JSON-encoded
  inside** the JSON (`compileOptions` is a string; `server.arr` calls
  `J.read-json` twice).
* No request ids. Responses are correlated by "whatever arrived on this
  connection before it closed".

So: a stream protocol's worth of machinery, used as one-shot RPC, over a
transport that is already reliable, ordered, and local.

## Four bugs, not opinions

**1. The queue is LIFO, and the documentation says FIFO.**

`server.js:126` does `runQueue.push(...)`; `server.js:79` does
`runQueue.pop()`. Same in `server.ts:220`/`180`. `npm/pyret.js`'s help text
says: *"If multiple compile jobs are sent at the same time, they are queued and
processed in FIFO order."* It is a stack. With one client at a time nobody
notices; with a `make -j` or a grading loop, jobs complete newest-first.

**2. Two concurrent clients can get each other's output.**

`runQueue` is declared once per server (`server.js:36`, `server.ts:141`), but
`tryQueue`, `respond` and `connection.close()` are defined **inside the
`'connection'` handler** and capture *that* connection. So if client A enqueues
a job and client B's connection handler is the one that runs `tryQueue`, A's
compile progress and result are written to B's socket, and B's connection is
the one that gets closed. A waits forever; B gets output for a file it never
asked about.

This is precisely the multi-client scenario the server exists to serve, and it
is silent when it happens.

**3. Per-request configuration is global mutable server state.**

`builtin-js-dir`, `builtin-arr-dir` and `allow-builtin-overrides` arrive per
message and are applied with `B.set-builtin-js-dirs(...)` — module-level
mutable state in the server process. Two clients in different projects with
different values stomp each other, and the loser gets a compile against the
other project's builtins.

**4. A stale socket makes the CLI exit 0 without compiling.** (Measured.)

Kill a server with `SIGKILL`, or reboot, and the socket file survives its exit
handler. The next invocation sees the file, connects, gets `ECONNREFUSED`, and:

```
$ node pyret.js --backend ts test/tests/test-unbound-error.arr
[client] Connection error: Error: connect ECONNREFUSED /tmp/parley-exedev/comm-ts.sock.
[client] You can try again, and the Pyret server may restart
$ echo $?
0
```

Advisory on **stdout**, exit **0**, nothing compiled. A Makefile or a grading
script reads that as success. (This is also documented in report 01 — it is how
I initially misdiagnosed a `cli.test.js` failure.)

## Design problems that aren't bugs yet

* **Connection-per-request throws away the only thing a persistent connection
  buys.** Measured, from report 02: 33 ms per REPL interaction through the
  server vs 11 ms in-process, of which roughly half the gap is the compiler
  (the batch table isolates that at ~2×) and the rest is connect / frame /
  close, per interaction.
* **No request ids means nothing is addressable.** `{command: "stop"}` breaks
  whatever happens to be running, globally. You cannot cancel one job of three,
  cannot interleave a status query with a compile, cannot stream diagnostics for
  job A while job B runs. Every future feature that wants those needs the
  protocol changed anyway — which is the thing "future-proof" was supposed to
  buy.
* **Lifecycle is heuristics over a filename.** Socket exists ⇒ server is up.
  `mtime(socket) < mtime(compiler)` ⇒ restart. No pid file, no version
  handshake, no health check, no way to ask "which compiler are you?". The
  version check in particular is a proxy for the thing you actually care about.
* **REPL sessions leak.** `repl-start` puts a session (and its realm — the
  expensive part) into a `MutableStringDict` keyed by id, and only `repl-close`
  removes it. A client that crashes or is `SIGKILL`ed leaks its realm for the
  life of the server. Nothing is tied to connection lifetime.
* **The protocol is implemented twice** — `server.js`/`server.arr` and
  `server.ts` — and has already diverged: `server.ts` has no `repl-*` commands
  at all, which is why `--repl --backend ts` used to hang.
* **One server per user, shared by every directory.** Deliberate, and right for
  the module cache. But it also means one wedged project wedges every project,
  and it is what makes (3) reachable.

## Was WebSocket the wrong call?

Not really, and it is not what I would fix first.

The argument for it — "future-proof for many use cases" — is a real argument,
and it would be right if the future use cases were *a browser* or *a remote
client*. But the server binds a unix socket path, and the client speaks
`ws+unix://`. Nothing browser-shaped can reach it as written. So today ws buys
an HTTP server that 404s, a handshake, and framing, on a transport that already
guarantees delivery and ordering. Newline-delimited JSON over the same unix
socket would do everything the current protocol does with strictly less code
and one fewer dependency in both implementations.

The genuinely future-proof thing is not the transport, it is **a protocol with
request ids and a persistent connection** — and that is exactly what is
missing. If a real editor integration ever happens, what you will want is
LSP-shaped: ids, cancellation by id, streaming diagnostics, a capabilities
handshake. That design is the same whether it rides on ws frames or newlines.
Getting the protocol right makes the transport an implementation detail; keeping
ws does not make the protocol right.

## What I would actually do, in order

1. **Fix the LIFO queue.** One line, and the docs already claim the fix.
2. **Fix the cross-connection output bug.** Either hoist `tryQueue`/`respond`
   so a job carries its own connection, or queue `{message, connection}` pairs.
3. **Stale sockets: unlink and restart on `ECONNREFUSED`, and never exit 0 on a
   failed compile.** This is the one that can silently pass a broken build.
4. **Add request ids and stop closing the connection.** This subsumes `stop`
   (cancel by id), removes the per-request connect cost, and is the
   prerequisite for anything editor-shaped.
5. **Tie REPL sessions to connection lifetime**, or give them a TTL.
6. **Drop the double JSON encoding.** Vestigial.
7. *Then*, if you like: drop `ws` and `http` for NDJSON. Cheap once (4) exists,
   removes a dependency, and loses nothing you are using.

## Addendum: what the actual workflow does to it

Joe's correction to my framing: the real pattern is **one long-running client,
plus Ctrl-C and restart of the CLI in the same terminal session** — not five
terminals at once, and "logically it's better if the 5 terminals are 5
different things anyway."

That reprioritises everything above. Bugs 1, 2 and 3 are all *multi-client*
bugs. They are real, but on this workflow they never fire. Meanwhile the thing
that does fire is the session leak, and it is much worse than "not a bug yet".

Measured (`reports/cli-repl-bench/test-restart-cycle.js`): start
`pyret --repl --server`, run two interactions, SIGINT the client, start it
again — sixteen times, against one surviving server.

```
cycle  startup_ms  server_RSS_MB  delta
    1        1766          465.8
    2         572          514.7  +48.9
    3         510          558.5  +43.8
    4         465          574.3  +15.8
    5         458          584.3  +10.0
    6         465          590.7   +6.4
    7         461          602.6  +11.9
    8         437          625.0  +22.4
    9         442          648.5  +23.5
   10         457          673.4  +24.9
   11         407          699.7  +26.3
   12         407          725.7  +26.0
   13         450          752.4  +26.7
   14         411          780.1  +27.7
   15         409          806.7  +26.6
   16         406          833.7  +27.0
still works afterwards: True
```

**466 MB → 834 MB over sixteen Ctrl-C restarts**, settling into a steady
**~27 MB per abandoned session** with no plateau. Nothing is reclaimed. It keeps
working, so you never see an error — you see the machine get slower. Forty
restarts in a working day is about a gigabyte of leaked realms.

The same sixteen cycles in-process (now the default): **790 ms median restart**,
zero server processes, `/tmp/parley-<user>/` empty afterwards, nothing to leak
because the process that held it exited.

### The leak and connection-per-request are the same bug

`repl-start` puts the session — and its realm, which is the 27 MB — into a
`MutableStringDict` keyed by id, and only `repl-close` removes it. A Ctrl-C'd
client never sends `repl-close`.

The obvious fix is "drop the session when its connection closes". You cannot,
because **the connection already closed** — `tryQueue` closes after every
message, so `repl-start` returns `repl-ready` and hangs up, and each
`repl-interact` is a fresh connection. The session outlives every connection by
construction, so there is no connection whose close means "this session is
over".

That is the clearest argument I have for item 4 on the list above. A persistent
connection is not a performance micro-optimisation; it is the thing that gives
server-side state a lifetime. Get it and the leak fixes itself, `stop` becomes
addressable, and the per-interaction connect cost goes away — one change, three
problems.

If you want a band-aid before that: have `repl-start` evict every existing
session before creating a new one. That is correct exactly when there is one
client, which you have just said is the case — and it is wrong the moment there
isn't, which is why I have not done it.

### "Five terminals should be five different things"

Agreed, and that is an argument against the server's *scope*, not just its
protocol. `/tmp/parley-<username>/comm.sock` is one server per **user**: every
project shares one process, one module cache, and one set of globally-mutated
builtin dirs (bug 3). Per-project would be strictly better and would make bug 3
unreachable.

But follow it one step further. If the server serves exactly one client, and
its lifetime should match that client's session, then it is not a daemon — it is
**a worker process the CLI owns**: started over a socketpair or stdio, inherited
rather than discovered, dying with its parent. No socket file in a shared
namespace, no staleness, no `--shutdown`, no version heuristics, no leak,
because there is nothing to outlive. That is the design I would point at for
`--repl --backend pyret`, where in-process is not available. Against in-process
it buys crash isolation and a separate heap; it does not buy warmth across
restarts, and per the numbers above warmth across restarts is worth about
400 ms.

## The bigger question underneath

The REPL numbers (report 02) say the daemon was not buying the REPL anything.
Your point about the batch case is the other half, and it stands: for `pyret
prog.arr` in a tight loop the server is the whole ballgame — measured, 2151 ms
cold vs 663 ms warm on the pyret backend, 878 vs 443 on ts. Per invocation, in
a loop over 100 files, that is minutes.

But notice *what* it is buying: a warm compiler and an in-RAM module cache
across many short-lived processes. A daemon is one way to get that. The other
is to not have many short-lived processes — `pyret dir/*.arr` or `pyret --watch`
in a single process would beat the daemon (no connect, no serialisation, no
lifecycle) for exactly the tight-loop case, and needs no protocol at all.

That is the design question I would put back to you: **is the daemon serving
"many invocations of a CLI", or "one long-running client"?**

Joe's answer is the second one — which, measured, removes the last argument for
the daemon *in his own usage*. The tight-loop case I invoked above to justify it
is somebody's pattern (grading harnesses, CI, Makefiles) but not the one that
motivated it. For one long-running client plus occasional restarts, the daemon
is saving ~400 ms a few times an hour and charging ~27 MB per restart for it.

So, revised:

* **Keep the daemon for the many-short-invocations case.** It is genuinely good
  at that, nothing here changes it, and the batch path still uses it.
* **Stop treating it as the default architecture for interactive use.** The REPL
  default already flipped. `--backend pyret --repl` is the remaining case, and a
  private stdio worker fits it better than a shared daemon.
* **Fix the session leak** — properly via item 4, or with the band-aid above if
  you want it today. This is the only one of the bugs on your path.
* Bugs 1–3 stay on the list but drop in priority: they are correctness bugs for
  a concurrency pattern you have just said you do not have, and would not
  encourage.

Either way I would not spend effort defending or replacing the websocket. It is
the part of this that is merely unnecessary.
