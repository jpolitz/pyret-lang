# Reactor events: future work notes

Agent-written report (Claude Fable 5.1, 2026-10-28). Not written by Joe Politz.
Design discussion only; nothing here is implemented. Written while the context of the
`reactor-custom-events` branch was fresh, as input to maintainer decisions.
Where this says "today", it means the tree at commit `2aacad878`.

## 1. Built-in handlers as sugar over event sources

Goal: `on-tick`, `on-key`, `on-raw-key`, `on-mouse` become bindings in the same list as
`on(source): handler`, so the runtime has one dispatch path and world.js one handler kind.

- Desugar to dedicated prims (`makeTickHandler(f, rate)`, `makeKeyHandler(f)`,
  `makeMouseHandler(f)`) typed on the existing handler shapes and returning
  `EventHandler<a>`. Do not desugar to `on(R.tick): lam(w, _): f(w) end`: desugar runs
  before type checking and the wrapper would degrade arity and type errors.
- `seconds-per-tick` folds into the tick prim at desugar time, since both are syntactic
  fields. `seconds-per-tick` without `on-tick` can then be a well-formedness error.
- Key and mouse sources need the interaction surface. Change the source protocol to
  `subscribe(emit, context)` where `context` carries the top node in the browser and is
  null in node. Context-free sources ignore it.
- Preserve traces: built-in sources should map back to `time-tick`, `keypress(k)`,
  `mouse(x, y, kind)` in `interact-trace` / `react` output, and `R.react(r, R.time-tick)`
  should route to the tick binding.
- `on_tick` / `on_key` / `on_mouse` in `world-lib.js` become the subscribe implementations
  behind the built-in sources; world.js keeps `OnEvent`, `to-draw`, `stop-when`.

## 2. Running reactors from node

Today: `react` works headless; `interact` is a param that only code.pyret.org sets, and in
node it raises "No interaction set up for this context".

- The core loop (`change_world`, listener list, handler protocol) is DOM-free. DOM-bound
  parts are the top node, jQuery focus, the canvas draw, and key/mouse listeners.
- A node `interact` is `runtime.pauseStack` plus handler registration plus resume on
  `stop-when` or SIGINT. Pending timers keep the process alive.
- Image output: node-canvas already works headless. Sinks for the drawn frame:
  a frame recorder (GIF or image sequence, one frame per transition or per tick), a final
  or per-event PNG for golden-image tests, or nothing.
- The important design choice is the clock, not the sink. Tick and `every` should draw time
  from an injectable scheduler so a headless run with a virtual clock is instant and
  deterministic. `every` currently calls `setInterval` directly and would need to change.
- With a virtual clock, headless `interact` takes a script of timed events and produces a
  trace plus frames: a reactor test harness for the main suite instead of Playwright.
- `change_world` retries re-entrant calls on a 10 ms timer; under a virtual clock this should
  become a queue (the per-source queue in `on_event` is the shape).
- Suggested order: context argument and injectable clock for sources; built-ins as prims
  over sources; then headless `interact` as scheduler plus optional frame sink.

## 3. Emitting from reactors

Rewritten 2026-11-13 by Claude Fable 5.2 (agent prose). This section used to compare five designs
and recommend `to(sink)` with a reactor-provided `send`/`no-message` type, sink-side dedupe by
default, and an `{attach, send, detach}` sink object. Emitting is now implemented (commit
`0de67cf37`) and differs from that recommendation; `REACTOR_SINKS_REPORT.md` is the description of
what exists. What changed from the earlier recommendation, all at the maintainer's direction:

- Optionality is the sink's own message type (`Option` or a library datatype), not a Reactors type.
- `on-to(source, sink)` was added for output that depends on the event; with it, one-shot effects no
  longer need level-triggered projections plus dedupe and re-arming.
- Reactors does no dedupe.
- Tests observe output through a message trace rather than an outputs column on the state trace.

Still future, none designed:

- Send failures. The maintainer's expectation is a library-provided source, e.g.
  `on(HTTP.send-failure)`, carrying the response that failed. Related: "errors in `send` shut the
  world down" should probably be narrowed to synchronous misuse.
- An HTTP library (request source, respond sink whose message names its request, consumed-once
  handles, a timeout for unanswered requests, fake requests for tests) and micro:bit sinks.
- Several messages from one transition. Left to the sink's message type (a list, or a combinator).
- An equality key for sources and sinks built by a function call, so that `MB.led(2, 3)` or
  `R.every(1)` made twice match each other in `custom-event`.
- A dedupe helper under `reactors.internal` for libraries that want send-on-change.
- Running sinks from node, which needs section 2.
