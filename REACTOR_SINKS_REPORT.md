# Reactors: `to(sink)` and `on-to(source, sink)`

Agent-written report (Claude Fable 5.2, 2026-11-13). Not written by Joe Politz.
Describes commit `0de67cf37` on `reactor-custom-events`. The earlier work on event sources is in
`REACTOR_EVENTS_REPORT.md`; templates for library authors are in `reactor-events-report/`.

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

New names in `reactors`:

| Name | Type | Meaning |
|---|---|---|
| `R.EventSink<M>` | opaque, branded | something that accepts values of type `M` while a reactor is interacting |
| `R.to(sink, f)` | `(EventSink<M>, (a -> M)) -> EventHandler<a>` | value form of `to(sink): f`, usable in the `on-event` list |
| `R.on-to(source, sink, h)` | `(EventSource<E>, EventSink<M>, (a, E -> {a; M})) -> EventHandler<a>` | value form of `on-to(source, sink): h` |
| `R.event-sink-name(sink)` | `EventSink<M> -> String` | the library-chosen name |
| `R.get-message-trace-as-table(r)` | `Reactor<a> -> Table` | every message a tracing reactor sent (also a method) |
| `R.spy-on` | `EventSink<M>` for any `M` | built-in sink; shows each message the way a `spy` statement does |

## Decisions and who made them

Maintainer (2026-11-13):

- `to` and `on-to` land together; `on-to` is one name with two arguments, returning a tuple.
- Optionality belongs to the sink; recommend `Option`, or the library's own datatype.
- Sinks take `send(message)` only. Correlation (an HTTP response naming its request), batching,
  dedupe and failure reporting are each library's message-type and JS design.
- Sources and sinks are instantiated knowing whether they are single or paired, so libraries can
  check a pairing. Reactors itself allows any pairing.
- The built-in sink is named `spy-on`.
- No `sent-to`; a message trace that shows the binding with each message instead.
- JS-side libraries can be "many (hard) things possible"; the Pyret side stays "easy things easy".

Agent (review these):

- The name `get-message-trace-as-table`, its column names, and offering only a table.
- The `handler` column holds the whole binding value rather than separate source and sink columns.
- `open(context)` returning `{send, close}`, and the shape of `context`.
- `send` may return a Promise.
- Opening a sink once per binding rather than once per sink (maintainer agreed afterwards).
- The optional third argument for constructor-style printing, and `every(2)` printing that way.
- `R.to` and `R.on-to` return `EventHandler<a>`, and `to` bindings are accepted in the `on-event`
  list. The type name is slightly off for a `to` binding; renaming it (e.g. `Binding`) is separate.

## Semantics

- Each handler call is one transition. After each transition every `to` projection runs on the new
  state, in the order the bindings appear.
- `on-to` reply order: the reply is sent, then the `to` projections of the new state. In the browser
  the reply is sent immediately before the state is committed rather than after.
- Several bindings on one source run in order, each as its own transition, so `to` projections run
  once per binding.
- Reactors does no dedupe. A `to` sink receives a message on every transition, including when the
  projection is unchanged.
- `react` never opens a sink or calls `send`. What would have been sent is in the message trace.
- When `stop-when` is already true, `react` returns the same reactor, as before.
- An `on-to` handler that does not return a 2-tuple is a runtime error naming the source and sink
  (a type error under the type checker).

## Message trace

A tracing reactor (`start-trace()`) records every message alongside its states, under both `react`
and `interact`. `r.get-message-trace-as-table()` returns one row per message, in send order:

| Column | Contents |
|---|---|
| `tick` | index into `get-trace()` of the state that transition produced, so it joins with `get-trace-as-table` |
| `handler` | the binding value that produced the message: what `R.to(...)` / `R.on-to(...)` return. It prints as `to(sink, <function>)` or `on-to(source, sink, <function>)` and has `.sink`, and for `on-to` `.source` |
| `message` | the message value |

Nothing is filtered by identity; the binding is shown and the reader or the program filters
afterwards, for example
`t.get-column("handler").map(lam(h): R.event-sink-name(h.sink) end)`.

- Under `interact` the projection of the initial state appears at tick 0. `react` never projects the
  initial state, so a trace built only with `react` starts at tick 1.
- Like `get-trace`, it is an error on a reactor that is not tracing, and `start-trace()` empties it.
- The existing state trace (`get-trace`, `get-trace-as-table`, `interact-trace`) is unchanged.
- Under the type checker a program can obtain the table (`mt :: Table = r.get-message-trace-as-table()`)
  but cannot read it: the checker's `Table` type has no `get-column`, and `extract message from mt end`
  makes the checker fail while rendering its own error (`compile-structs.arr:1372`). Both problems
  exist for every table, including `get-trace-as-table`, and are not specific to reactors. Untyped
  programs are unaffected. A typed way to read messages would need a list form, and the message
  column has no single type.

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
- `context` says how this binding was written:
  - source under `on(source)`: `{ paired: false }`
  - source under `on-to(source, sink)`: `{ paired: true, sink: <the EventSink value> }`
  - sink under `to(sink)`: `{ paired: false }`
  - sink under `on-to(source, sink)`: `{ paired: true, source: <the EventSource value> }`

  A library checks its partner by identity against its own values (`context.sink === respond`), and
  may throw from `open`/`subscribe` to refuse a binding; the interaction then ends with
  "The event source/sink NAME failed to start: MESSAGE".
- These checks run when `interact` starts, not when the reactor is built and not under `react`.
- `open` may return a bare function, which is treated as `send`.
- `send` receives the raw Pyret value outside any Pyret run. It may return a Promise; the world then
  waits for it before continuing (the next listener, or committing an `on-to` state), and a rejection
  ends the interaction with an error. `spy-on` uses this to start its own Pyret run for rendering.
- Printing: sources and sinks print as `event-source("name")` / `event-sink("name")`. A third
  argument `{ constr: "every", args: [seconds] }` to `makeEventSource` / `makeEventSink` prints the
  value as a constructor call instead; `R.every(2)` prints as `every(2)`.
- Also exported under `internal`: `isEventSink`, `getSinkInfo`.
- A complete module is in `reactor-events-report/custom-sink-template.js`. It and the source
  template were loaded together in a small program, typed and untyped, on 2026-11-13; the sink's
  `send` itself was not run, since that needs `interact`.

Identity: a source or sink is matched by identity (`R.custom-event(source, v)` finds handlers this
way). A library function that builds a new value per call, such as `R.every(1)`, therefore never
matches a binding made with another call. Bind the value to a name, or have the library return the
same value for the same arguments.

## How it is built

- Grammar: `event-field` takes a comma-separated argument list. `s-event-field` is
  `(l, name, args :: List<Expr>, value)`.
- Well-formedness (both compilers): the name must be `on`, `to` or `on-to` with 1, 1 and 2 arguments.
- Desugar (both compilers): `to` -> prim `makeToHandler(sink, f)`, `on-to` -> prim
  `makeOnToHandler(source, sink, h)`, typed in both `type-defaults`. All three kinds go into the same
  array passed to `makeReactor`, typed `RawArray<EventHandler<a>>`.
- `reactors.js`: bindings carry a kind; `make-reactor` splits them into `on-event` (on and on-to) and
  `to-sink` in the handler dictionary handed to `interact`. Each binding record has `kind`,
  `handler`, `value` (the Pyret binding), and as applicable `source`, `name`, `subscribe`, `sink`,
  `sinkName`, `openSink`, `splitReply`.
- The interaction handler registered with `setInteract` (`world.bigBangFromDict`) takes a fourth
  argument, a function `(binding, message)` to call for every send when tracing.
- `world.js`: a `ToSink` world option (a world-change listener, registered after `to-draw`), reply
  handling in `OnEvent`, and a per-`interact` table of open sink sessions (one per binding).
  `world-lib.js` is unchanged.

## Prose I wrote into the system (please review)

- Error messages in `well-formed.arr` / `well-formed.ts`: "A reactor option with arguments must be
  written `on(event-source)`, `to(event-sink)`, or `on-to(event-source, event-sink)`, but found one
  named ..." and "The reactor option `X` must be written `...`, but found N arguments".
- Error messages in `reactors.js`: "The on-to handler for the event source S and the sink K must
  return a tuple {new-state; message}"; "The event sink K did not provide a send function"; "Tried to
  get the message trace of a reactor that isn't tracing; try calling start-trace() first".
- Error messages in `world.js`: "The event sink K failed to start: ..." / "failed to send: ...".
- The title `spy-on` and the label `sent` in what the `spy-on` sink displays.
- Test names and two comments in `browser-test/tests/reactor-events.js`.
- Parser comments of the form `// (event-field NAME PARENNOSPACE arg (COMMA arg)* RPAREN COLON value)`,
  following the file's convention.

## Proposed documentation

I did not edit `docs/`. `docs/src/builtin/reactors.scrbl` and `docs/src/lang/forms.scrbl` do not
yet describe `on(source)` either; the proposal for that is at the end of `REACTOR_EVENTS_REPORT.md`.
The text below extends it, in prose for the maintainer to scribble-ify.

**Grammar** (`forms.scrbl`, reactor expressions; replaces the `event-field` line proposed earlier):

```
event-field: NAME PARENNOSPACE binop-expr (COMMA binop-expr)* RPAREN COLON binop-expr
```

The name must be `on` (one argument), `to` (one argument) or `on-to` (two arguments).

**`to(sink)`** (new subsection after `to-draw`). A reactor option written `to(sink): f` sends
information out of the reactor while it is running. When the reactor starts, and again each time its
state changes, `f` is called with the current state and the result is sent to the sink:

```
to(sink) :: (a -> M)      where sink :: EventSink<M>
```

What a sink does with a message, and what type of message it accepts, is described by the library
that provides it. A reactor may have any number of `to(...)` options.

**`on-to(source, sink)`** (after `on(source)`). An option written `on-to(source, sink): handler`
handles an event and sends a message in one step. The handler takes the current state and the
emitted value and returns a tuple of the new state and the message:

```
on-to(source, sink) :: (a, E -> {a; M})      where source :: EventSource<E>, sink :: EventSink<M>
```

Use `to` when what is sent depends only on the state, and `on-to` when it depends on the event that
just happened.

**Event sinks.** `EventSink<M>` values come from libraries. `spy-on` is a sink that accepts any
value and displays it like a `spy` statement, which is useful for seeing what a reactor would send:

```
r = reactor:
  init: 0,
  on(every(1)): lam(count, n): count + 1 end,
  to(spy-on): lam(count): count end
end
```

`event-sink-name(sink)` returns the name the library gave the sink. `to(sink, f)` and
`on-to(source, sink, handler)` are the value forms, for use in an `on-event` list.

**Message traces** (with `get-trace`). `get-message-trace-as-table(r)` returns a table of the
messages a tracing reactor has sent, with columns `tick`, `handler` and `message`. `tick` is the
position in `get-trace(r)` of the state the message goes with. `react` does not deliver messages to
sinks; it only records them, so a reactor that uses a device can be tested without it:

```
check:
  t = r.start-trace().react(custom-event(src, 5))
  t.get-message-trace-as-table().get-column("message") is [list: 1]
end
```

**For library authors** (in `libraries-internal` or the raw-module docs): the section "Protocol for
library authors (JS)" above.

## Not done

- No `HTTP` or micro:bit library using sinks.
- No node `interact`, so real `send` calls are only exercised in the browser tests.
- Possible follow-ups are listed in `REACTOR_EVENTS_FUTURE_WORK.md` section 3.

## Verification

Run on the committed tree, 2026-11-13:

| Check | Result |
|---|---|
| `make pyret-test` | 12448 passed from a clean `tests/compiled`. A run with a stale `tests/compiled` failed 2 checks in `test-import-variable.arr` (values 43 and 44, which belong to `test-import-variable-reexport.arr`: both mutate the shared `defines-vars.arr` and the stale build ran them in the other order). That file passes alone and is unrelated to reactors |
| `make type-check-test` | 224 passed; each new `bad/` file was checked by hand to fail for the intended reason |
| `make ts-unit-test` | 21 passed |
| `make ts-type-check-parity` | 187 of 187 |
| `make ts-wf-parity` | 147 of 147 |
| Browser, `--env=cpo --suites=reactor-events` | 10 passed |
| Browser, `--compiler=ts` | not run: `cpo-main-ts.jarr` is not built on this box, so the editor fails to load |

New tests: `lang/tests/pyret/tests/test-reactor-sinks.arr` (with sinks and fake `interact` handlers
added to `test-event-source.js`), cases in `test-reactor.arr` and `test-well-formed.arr`, three TS
unit tests, `tests/type-check/good/good-reactor-sinks.arr`, five `tests/type-check/bad/bad-reactor-*`
files, and five browser tests in `browser-test/tests/reactor-events.js`.

After the commit, one line changed in `reactors.js`: the `get-message-trace-as-table` method is
declared as returning `Table` instead of `Any`, found while checking the templates in a typed
program. `test-reactor-sinks.arr` (72 passed) and the typed `good-reactor-sinks.arr` were rerun
afterwards; the full suites were not.

Gaps:

- A sink whose `send` throws or rejects is not covered by any test: `spy-on` accepts every message.
- The single/paired context and the `interact` side of the message trace for an arbitrary sink are
  tested in node through fake `interact` handlers. In the browser, the message trace is tested with
  `spy-on`; no browser test observes the context.
