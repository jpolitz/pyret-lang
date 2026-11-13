# Reactors: `to(sink)` and `on-to(source, sink)`

Agent-written report (Claude Fable 5.2, 2026-11-13). Not written by Joe Politz.
Describes the uncommitted working tree on `reactor-custom-events` on top of `2aacad878`.

## What a program can now write

```
import reactors as R

r = reactor:
  init: 0,
  on(MB.button-a): lam(count, press): count + 1 end,
  to(MB.leds): lam(count): digit-pattern(count) end,
  on-to(MB.button-b, MB.speaker): lam(count, press):
      {0; if count > 3: some(MB.beep) else: none end}
    end
end
```

| Form | Handler type | Meaning |
|---|---|---|
| `on(source): h` | `(a, E -> a)` | unchanged |
| `to(sink): f` | `(a -> M)` | after every transition, and once for the initial state when `interact` starts, send `f(state)` to the sink |
| `on-to(source, sink): h` | `(a, E -> {a; M})` | on each event, the first component is the new state and the second is sent to the sink |

`M` is whatever the sink declares (`EventSink<M>`). Reactors has no "nothing to send" value: a sink
that allows silence declares `EventSink<Option<Sound>>` or its own datatype and interprets it in JS.

Value forms, usable in the `on-event` list: `R.to(sink, f)`, `R.on-to(source, sink, h)`.
Other new names in `reactors`: the type `EventSink<M>`, `R.event-sink-name(sink)`,
`R.get-message-trace-as-table(reactor)` (also a method), and `R.spy-on`.

`R.spy-on` is a built-in sink that accepts any message and shows it the way a `spy` statement does
(in the interactions area on code.pyret.org). The name is the maintainer's. Its type is
`forall m. EventSink<m>`; `EventSink<Any>` was rejected by the type checker for a `String` message.

## Semantics

- Each handler call is one transition. After each transition every `to` projection runs on the new
  state, in the order the bindings appear.
- `on-to` reply order: the reply is sent, then the `to` projections of the new state. In the browser
  the reply is sent immediately before the state is committed rather than after; nothing can observe
  the difference because both happen in the same synchronous step.
- Several bindings on one source run in order, each as its own transition, so `to` projections run
  once per binding.
- Reactors does no dedupe. A `to` sink receives a message on every transition, including when the
  projection is unchanged. Send-on-change is the sink library's choice.
- `react` never opens a sink or calls `send`. What would have been sent is visible in the message
  trace (next section).
- When `stop-when` is already true, `react` returns the same reactor, as before.
- An `on-to` handler that does not return a 2-tuple is a runtime error naming the source and sink
  (a type error under the type checker).

## Message trace

A tracing reactor (`start-trace()`) records every message alongside its states, under both `react`
and `interact`. `r.get-message-trace-as-table()` returns a table with one row per message, in send
order:

| Column | Contents |
|---|---|
| `tick` | index into `get-trace()` of the state that transition produced, so it joins with `get-trace-as-table` |
| `handler` | the binding value that produced the message: what `R.to(...)` / `R.on-to(...)` return. It prints as `to(sink, <function>)` or `on-to(source, sink, <function>)` and has `.sink`, and for `on-to` `.source` |
| `message` | the message value |

This replaced `R.sent-to` at the maintainer's direction: nothing is filtered by identity; the
binding is shown and the reader or the program filters afterwards. Under `interact` the projection of
the initial state appears at tick 0; `react` never projects the initial state. Like `get-trace`, it
is an error on a reactor that is not tracing, and `start-trace()` empties it.

Sources and sinks print as `event-source("name")` / `event-sink("name")` by default. A library can
pass a third argument to `makeEventSource` / `makeEventSink`, `{ constr: "every", args: [seconds] }`,
to print as a constructor call; `R.every(2)` now prints as `every(2)`.

## Protocol for library authors (JS)

```
var sink = reactors.internal.makeEventSink("leds", function open(context) {
  var last = null;                       // per-binding, per-run state lives in this closure
  return {
    send: function(message) { ... },     // throwing ends the interaction with an error
    close: function() { ... }            // optional
  };
});

var source = reactors.internal.makeEventSource("request", function subscribe(emit, context) {
  ...
  return function unsubscribe() { ... };
});
```

- `open` and `subscribe` run once per binding when an `interact` starts (and again if the world is
  paused and resumed); `close` / `unsubscribe` run when it stops. A sink named by two bindings is
  opened twice; hardware state shared between them belongs in the library's module scope.
- `context` says how this binding was written (maintainer's guidance, 2026-11-13):
  - source under `on(source)`: `{ paired: false }`
  - source under `on-to(source, sink)`: `{ paired: true, sink: <the EventSink value> }`
  - sink under `to(sink)`: `{ paired: false }`
  - sink under `on-to(source, sink)`: `{ paired: true, source: <the EventSource value> }`
  A library checks its partner by identity against its own values (`context.sink === respond`), and
  may throw from `open`/`subscribe` to refuse a binding; the interaction then ends with
  "The event source/sink NAME failed to start: MESSAGE". Reactors itself allows any pairing.
- These checks run when `interact` starts, not when the reactor is built and not under `react`.
- `open` may return a bare function, which is treated as `send`.
- `send` receives the raw Pyret value outside any Pyret run. It may return a Promise; the world then
  waits for it before continuing (the next listener, or committing an `on-to` state), and a rejection
  ends the interaction with an error. `spy-on` uses this to start its own Pyret run for rendering.
  This is new relative to our discussion, where `send` was synchronous only.
- Also exported under `internal`: `isEventSink`, `getSinkInfo`.

This differs from the `{attach, send, detach}` object in `REACTOR_EVENTS_FUTURE_WORK.md`: `open`
returning the session mirrors `subscribe` returning `unsubscribe`, and gives dedupe memory that
resets per run without the library managing it. The second argument to `subscribe` is new; existing
sources that ignore it are unaffected.

## How it is built

- Grammar: `event-field` takes a comma-separated argument list. `s-event-field` changed shape from
  `(l, name, source, value)` to `(l, name, args :: List<Expr>, value)`; this node only exists on this
  branch.
- Well-formedness (both compilers): the name must be `on`, `to` or `on-to` with 1, 1 and 2 arguments.
- Desugar (both compilers): `to` -> prim `makeToHandler(sink, f)`, `on-to` -> prim
  `makeOnToHandler(source, sink, h)`, typed in both `type-defaults`. All three kinds go into the same
  array passed to `makeReactor`, typed `RawArray<EventHandler<a>>`.
- `interact` handlers (`world.bigBangFromDict`) take a fourth argument, a function
  `(binding, message)` called for every send when tracing.
- `reactors.js`: bindings carry a kind; `make-reactor` splits them into `on-event` (on and on-to) and
  `to-sink` in the handler dictionary handed to `interact`.
- `world.js`: a `ToSink` world option (a world-change listener, registered after `to-draw`), reply
  handling in `OnEvent`, and a per-`interact` table of open sink sessions (one per binding). `world-lib.js` is unchanged.

## Needs your decision

1. (Resolved: `R.console-log` was replaced by `R.spy-on`.)
2. (Resolved: `R.sent-to` was replaced by the message trace.) Remaining choices in it that are
   mine: the name `get-message-trace-as-table`, the column names, and offering only a table (no list
   form like `get-trace`).
3. `R.to` and `R.on-to` return `EventHandler<a>`, and `to` bindings are accepted in the `on-event`
   list. The type name is now slightly off for a `to` binding; renaming it (e.g. `Binding`) is a
   separate change.
4. Not committed. The earlier work on this branch was committed by the agent; say if you want the
   same here.

## Prose I wrote into the system (please review)

- Error messages in `well-formed.arr` / `well-formed.ts`: "A reactor option with arguments must be
  written `on(event-source)`, `to(event-sink)`, or `on-to(event-source, event-sink)`, but found one
  named ..." and "The reactor option `X` must be written `...`, but found N arguments".
- Error messages in `reactors.js`: "The on-to handler for the event source S and the sink K must
  return a tuple {new-state; message}"; "The event sink K
  did not provide a send function".
- Error messages in `world.js`: "The event sink K failed to start: ..." / "failed to send: ...".
- Test names and two header comments in `browser-test/tests/reactor-events.js`.
- Parser comments of the form `// (event-field NAME PARENNOSPACE arg (COMMA arg)* RPAREN COLON value)`,
  following the file's convention.

## Stale documentation noticed

- `REACTOR_EVENTS_FUTURE_WORK.md` section 3 still describes `send`/`no-message`, sink-side dedupe as
  a default, and `{attach, send, detach}`. All three are superseded by this report.
- `REACTOR_EVENTS_CHECKLIST.md` section B says an event field needs "one handler per new
  nonterminal"; extending an existing rule needed only the existing handler.
- The file header comment in `browser-test/tests/reactor-events.js` describes only `on-event`.

## Not done

- No `HTTP` or micro:bit library; no batching or failure reporting (both left to sink libraries).
- No node `interact`, so real `send` calls are only exercised in the browser tests.
- No documentation changes (the docs are not in this tree).

## Verification

Run on the final tree, 2026-11-13:

| Check | Result |
|---|---|
| `make pyret-test` | 12448 passed from a clean `tests/compiled`. A run with a stale `tests/compiled` failed 2 checks in `test-import-variable.arr` (values 43 and 44, which belong to `test-import-variable-reexport.arr`: both mutate the shared `defines-vars.arr` and the stale build ran them in the other order). That file passes alone and is unrelated to reactors |
| `make type-check-test` | 224 passed; each new `bad/` file was checked by hand to fail for the intended reason |
| `make ts-unit-test` | 21 passed |
| `make ts-type-check-parity` | 187 of 187 |
| `make ts-wf-parity` | 147 of 147 |
| Browser, `--env=cpo --suites=reactor-events` | 10 passed |
| Browser, `--compiler=ts` | not run: `cpo-main-ts.jarr` is not built on this box, so the editor fails to load |

New tests: `lang/tests/pyret/tests/test-reactor-sinks.arr` (with sinks and a fake `interact` added to
`test-event-source.js`), cases in `test-reactor.arr` and `test-well-formed.arr`, three TS unit tests,
`tests/type-check/good/good-reactor-sinks.arr`, five `tests/type-check/bad/bad-reactor-*` files, and
five browser tests in `browser-test/tests/reactor-events.js`.

A sink whose `send` throws or rejects is not covered by any test: `spy-on` accepts every message, so
the browser test for that path was replaced by one for an error in a `to` projection.

The single/paired context is only tested through the fake `interact` in node. No browser test
observes it, because the only built-in source and sink ignore it.
