# Custom event sources for reactors

Agent-written report (Claude Fable 5.1), 2026-10-28. Everything in this file and
in `reactor-events-report/` is agent prose; the system diff is described in
"Files changed" below.

## Summary

Reactors can now subscribe to arbitrary event emitters. A reactor gets one new
option, `on-event`, whose value is a list of bindings made with `R.on`:

```
import reactors as R
import js-file("/microbit") as MB

r = reactor:
  init: {tilt: {x: 0, y: 0, z: 0}, temp: 0},
  on-tick: advance,
  on-event: [list:
    R.on(MB.tilt, lam(w, t): w.{tilt: t} end),
    R.on(MB.temperature, lam(w, c): w.{temp: c} end)
  ],
  to-draw: draw
end
r.interact()
```

`MB.tilt` and `MB.temperature` are *event sources*: values a JS library builds
with one call. The language has no new syntax and no new hardcoded `on-*`
names. A library that wants the familiar look can define `MB.on-tilt(f)` as
`R.on(MB.tilt, f)` in one line (the attached micro:bit patch does this).

Reactors stay testable without running them: `R.custom-event(source, value)`
is a new `Event` and `r.react(R.custom-event(MB.tilt, {x: 0, y: 500, z: 800}))`
runs the matching handler, so programs that use a device can be tested in
`check` blocks with no hardware.

## The design

### Vocabulary

| Pyret name | Type | Meaning |
|---|---|---|
| `R.EventSource<E>` | opaque, branded | something that emits values of type `E` while a reactor is interacting |
| `R.on(src, f)` | `(EventSource<E>, (a, E -> a)) -> EventHandler<a>` | bind a handler to a source |
| `on-event: [list: ...]` | reactor option, `List<EventHandler<a>>` | the reactor's subscriptions |
| `R.custom-event(src, v)` | `(EventSource<E>, E) -> Event` | an event to feed to `react` programmatically |
| `R.event-source-name(src)` | `EventSource<E> -> String` | the library-chosen name, used in errors and `torepr` |
| `R.every(seconds)` | `Number -> EventSource<Number>` | a built-in timer source, emits 1, 2, 3, ... |

A handler always takes two arguments, the state and the emitted value, in the
same shape as `on-key` and `on-mouse`. Several bindings may target one source;
`react` applies them in list order and the running reactor subscribes each one.

### Why a value-level list and not new syntax

The alternatives I considered:

- *Loosen the well-formedness check so any `on-foo:` field is allowed.* The
  compiler could not know what `foo` is bound to; the runtime would need a
  registry of names, and two libraries could collide on a name.
- *New grammar, e.g. `on(MB.tilt): handler`.* Touches the parser, the AST and
  every visitor in both compilers, the pretty-printer, the CodeMirror mode and
  the VS Code grammar, for a feature that is just "a pair of source and
  function".
- *A list of bindings under one reactor option.* Sources and bindings become
  first-class values. They can be put in variables, built in loops, provided
  by libraries, and compared in tests. It composes with the existing
  `init`/`on-tick`/`to-draw` fields and the type checker can relate the
  state type of every handler to the reactor's `init`.

I went with the last. `on-event` parallels the other handler options in name;
`R.on` is short and is the name every JavaScript emitter uses, which is what
students meet next.

### What a library author writes

A raw JS module declares a dependency on `reactors` and calls
`internal.makeEventSource(name, subscribe)`:

```js
var seconds = Reactors.makeEventSource("wall-clock seconds", function(emit) {
  var id = setInterval(function() { emit(runtime.makeNumber(new Date().getSeconds())); }, 1000);
  return function() { clearInterval(id); };
});
```

The contract is:

- `subscribe(emit)` is called when a reactor that binds this source starts
  interacting (once per binding, per `interact()`).
- It returns a function that stops the stream; it is called when the reactor
  stops (`stop-when`, window close, an error in any handler, or the program
  being stopped).
- `emit(value)` may be called from any JavaScript context at any time: a
  timer, a `WebSocket` message, a serial-port read, a DOM listener. `value`
  must be a Pyret value. Calls made while no reactor is listening are dropped.
- The source can be provided with the type `EventSource<E>` through the
  module's `provides` block by naming the type from `builtin://reactors`
  (see `reactor-events-report/custom-source-template.js`).

`reactor-events-report/pyret-microbit-events.patch` applies this to
`jpolitz/pyret-microbit`: it adds `MB.sample`, `MB.tilt`, `MB.temperature`,
`MB.light`, `MB.button-a`, `MB.button-b` (and the same six fields on every
named controller), plus `MB.on-tilt(f)` style sugar, all derived from the
existing sample stream with change detection. `microbit-tilt-events.arr` is
the tilt demo rewritten to use them instead of polling in `on-tick`. I could
not run that patch against a board; it parses and follows the module's
existing conventions.

### Runtime behaviour in the browser

`bigBangFromDict` in `world.js` turns each binding into an `OnEvent` world
configuration whose raw handler is `rawJsworld.on_event(subscribe, receive)`
in `world-lib.js`. That handler:

- subscribes in `onRegister` and unsubscribes in `onUnregister`, the same
  lifecycle hooks `on_tick`/`on_key` use, so pause/stop/error all end the
  stream;
- keeps a FIFO queue per binding and delivers one value per `change_world`
  in order, so a burst from a fast device is not reordered by the world's
  retry-after-10ms mechanism;
- always delivers asynchronously (`setTimeout 0`), so a source that emits
  from inside `subscribe` or from inside a handler cannot re-enter the world
  loop before the initial world is installed;
- ignores emissions for a world index that is no longer current;
- converts a synchronous exception from `subscribe` into a reactor error
  (`The event source "x" failed to start: ...`) delivered through the normal
  big-bang shutdown path.

Handlers run through `adaptWorldFunction`, so errors inside them are reported
exactly like `on-tick` errors and end the interaction.

### Programmatic `react`

`custom-event(source, value)` is a new variant of `Event` in
`reactor-events.arr`. `react` looks up the bindings whose source is
`identical` to the event's source, applies them in order (tracing records each
intermediate state), and raises
`No on-event handler defined for the event source "name"` when there are
none, mirroring `No on-key handler defined`. `stop-when` is consulted first,
as for every other event.

### Types

The static type of `makeReactor`'s option record gains
`on-event :: Option<List<EventHandler<a>>>`, and `R.on` is
`forall a, e. (EventSource<e>, (a, e -> a)) -> EventHandler<a>`. With
`-type-check`:

- a handler whose payload type disagrees with the source is rejected;
- a handler whose state type disagrees with `init` is rejected;
- `R.custom-event(src, v)` requires `v` to match the source's payload type.

Both compilers (`src/arr/compiler` and `src/ts-compiler`) were changed
identically; the parity suites agree.

**Pre-existing bug fixed along the way.** `reactors.js` declared the types of
`keypress`, `mouse`, `time-tick`, `raw-key` and `react` with `["local",
"Event"]`, but the module has no local `Event` datatype; the user-visible
`R.Event` is an alias for `reactor-events`' `Event`. Under `-type-check`,
`R.react(r, R.keypress("a"))` therefore failed with "`Event` was incompatible
with `Event`" before this change (verified on the unmodified tree). All of
those declarations now use the `ReactorEvent` shorthand, and
`good-reactor-events.arr` covers `e :: R.Event = R.custom-event(...)` followed
by `R.react(r, e)`.

## Files changed

Language and compilers (`lang/`):

- `src/arr/trove/reactor-events.arr`: `custom-event(source, value)` variant of `Event`.
- `src/js/trove/reactors.js`: `EventSource` and `EventHandler` brands, `on`,
  `every`, `custom-event`, `event-source-name`, `on-event` validation in
  `make-reactor`, dispatch in `react`, and `internal.makeEventSource` /
  `isEventSource` / `getSourceInfo` for libraries and for `world.js`; plus the
  `Event` type-declaration fix described above.
- `src/arr/compiler/compile-structs.arr`, `src/ts-compiler/src/compile-structs.ts`:
  `on-event` in the reactor option table (annotation `Any`; the list and its
  elements are checked in `make-reactor` with `List` / `EventHandler` contract errors).
- `src/arr/compiler/type-defaults.arr`, `src/ts-compiler/src/type-defaults.ts`:
  the `on-event` field in `makeReactor`'s type.
- `src/ts-compiler/tests/run-unit-tests.js`: the sorted option list in the
  well-formedness message now includes `on-event`.

Browser runtime (`code.pyret.org/`):

- `src/web/js/trove/world-lib.js`: `on_event`.
- `src/web/js/trove/world.js`: `OnEvent` and its creation in `bigBangFromDict`.

Tests:

- `lang/tests/pyret/tests/test-reactor-events.arr` with `test-event-source.js`
  (a JS module that provides two typed sources, used to test construction,
  equality, printing, dispatch order, tracing, `stop-when`, contract errors,
  `every`, and that `react` never subscribes), registered in `main2.arr`.
- `lang/tests/pyret/tests/test-reactor.arr`: parse/print of `on-event`.
- `lang/tests/type-check/good/good-reactor-events.arr` and three `bad/` files.
- `browser-test/tests/reactor-events.js`, registered as the `reactor-events`
  suite: runs real reactors in code.pyret.org through Playwright and asserts
  the delivered trace, interleaving with `on-tick`, and error reporting.

Not changed on purpose: `docs/` (proposed text below), the legacy
`W.big-bang(init, [list: ...])` configuration API (it could get a
`W.on-event(src, f)` option in a few lines if wanted), and the parser.

## Validation

All runs below were made on this box against the final tree.

| Suite | Command | Result |
|---|---|---|
| Language suite (`main2`) | `make pyret-test` in `lang/` | 12335 passed, 0 failed (includes the new `test-reactor-events.arr`, 33 checks) |
| Type-check corpus | `tests/type-check/main.arr` | 215 passed (96 good, 68 bad); new good/bad files included |
| TS compiler unit tests | `make ts-unit-test` | 18 passed |
| TS/Pyret type-check parity | `make ts-type-check-parity` | 178 programs, identical diagnostics |
| TS/Pyret well-formedness parity | `make ts-wf-parity` | 147 programs, identical diagnostics |
| Browser, new suite | `node run.js --env=cpo --suites=reactor-events` | 5 passed: ordered delivery and trace `[0, 1, 3, 6, 10]`, interleaving with `on-tick` and two sources, handler error reporting and recovery, timers torn down on stop, typed run |
| Browser, existing suites | `--suites=errors,check-blocks` | 246 passed |
| Example | `reactor-events-report/every-demo.arr` run in the editor | reactor stopped at `spawned: 5` with 278 ticks and 19 heartbeats, check block passed |

Not validated: the micro:bit patch against a real board (no hardware here).

## Proposed documentation (for `docs/src/builtin/reactors.scrbl`)

I did not edit the docs. Suggested additions, in prose for the maintainer to
scribble-ify:

**`on-event`** (new subsection after `on-mouse`). The `on-event` option takes a
list of event handlers, each built with `on`. While the reactor is running,
every event source named in the list is subscribed to, and each value the
source emits is passed, along with the current state, to the corresponding
handler, which produces the new state. Handlers are applied in the order
they appear. Subscriptions end when the reactor stops.

```
on :: (source :: EventSource<E>, handler :: (a, E -> a)) -> EventHandler<a>
```

**Event sources.** `EventSource<E>` values come from libraries (for example a
module that talks to a device) and from `every`:

```
every :: (seconds :: NumPositive) -> EventSource<Number>
```

A source made by `every(s)` emits `1`, `2`, `3`, ... once every `s` seconds.
`event-source-name(src)` returns the name the library gave the source.

**Reacting programmatically.** `custom-event(source, value)` is the `Event`
for a value emitted by `source`; `react(r, custom-event(src, v))` applies the
handlers bound to `src` and raises an error if there are none.

**For library authors** (in `libraries-internal` or the raw-module docs):
the `reactors` module's `internal` object has
`makeEventSource(name, subscribe)`, where `subscribe(emit)` returns an
unsubscribe function and `emit` takes a Pyret value.

## Possible follow-ups

- Source combinators in Pyret (`R.map-source`, `R.filter-source`) can be
  added without any runtime change by rewriting the binding at `on` time,
  so that the mapping function runs on the Pyret stack inside the handler.
- A `W.on-event(src, f)` option for the legacy list-based `big-bang`.
- If delivery order across *different* sources matters (it is currently
  per-source FIFO, cross-source order is arrival order modulo the world's
  10 ms retry), a single shared queue in `world-lib.js` would make it total.
- `every` emits the fire count; if elapsed time is more useful in practice it
  is a one-line change.
