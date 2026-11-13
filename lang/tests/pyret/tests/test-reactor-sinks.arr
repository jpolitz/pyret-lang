import js-file("./test-event-source") as ES
import reactors as R

check "event sinks from a JS library":
  R.event-sink-name(ES.lamp) is "lamp"
  torepr(ES.lamp) is "event-sink(\"lamp\")"
  ES.lamp is ES.lamp
  ES.lamp is-not ES.beeper
  R.event-sink-name(5) raises "EventSink"
  R.event-sink-name(R.spy-on) is "spy-on"
  R.event-sink-name(ES.counter) raises "EventSink"
end

check "to and on-to build bindings":
  t = R.to(ES.lamp, lam(w): "on" end)
  t.sink is ES.lamp
  o = R.on-to(ES.counter, ES.beeper, lam(w, n): {w; none} end)
  o.source is ES.counter
  o.sink is ES.beeper
  R.to(5, lam(w): w end) raises "EventSink"
  R.to(ES.counter, lam(w): w end) raises "EventSink"
  R.to(ES.lamp, 5) raises "Function"
  R.on-to(ES.lamp, ES.beeper, lam(w, n): {w; none} end) raises "EventSource"
  R.on-to(ES.counter, ES.counter, lam(w, n): {w; none} end) raises "EventSink"
  R.on-to(ES.counter, ES.beeper, 5) raises "Function"
end

fun messages(r): r.get-message-trace-as-table().get-column("message") end
fun ticks(r): r.get-message-trace-as-table().get-column("tick") end
fun sinks(r):
  r.get-message-trace-as-table().get-column("handler").map(lam(h): R.event-sink-name(h.sink) end)
end

check "to(sink) projects the state after each transition":
  r = reactor:
    init: 0,
    on-tick: lam(w): w + 1 end,
    on(ES.counter): lam(w, n): w + n end,
    to(ES.lamp): lam(w): if w > 2: "on" else: "off" end end
  end
  t = r.start-trace()
  messages(t) is empty
  r1 = t.react(R.time-tick)
  r1.get-value() is 1
  messages(r1) is [list: "off"]
  R.get-message-trace-as-table(r1).get-column("message") is [list: "off"]
  r2 = r1.react(R.custom-event(ES.counter, 5)).react(R.time-tick)
  messages(r2) is [list: "off", "on", "on"]
  ticks(r2) is [list: 1, 2, 3]
  sinks(r2) is [list: "lamp", "lamp", "lamp"]
  r2.get-trace() is [list: 0, 1, 6, 7]
end

check "the message trace needs tracing, and restarts with it":
  r = reactor:
    init: 0,
    on-tick: lam(w): w + 1 end,
    to(ES.lamp): lam(w): tostring(w) end
  end
  r.get-message-trace-as-table() raises "isn't tracing"
  r.react(R.time-tick).get-message-trace-as-table() raises "isn't tracing"
  t = r.start-trace().react(R.time-tick)
  messages(t) is [list: "1"]
  messages(t.start-trace()) is empty
  t.stop-trace().get-message-trace-as-table() raises "isn't tracing"
  R.get-message-trace-as-table(5) raises "Reactor"
end

check "on-to(source, sink) returns a new state and a message":
  r = reactor:
    init: 10,
    on-to(ES.counter, ES.beeper): lam(w, n):
        {w + n; if n > 3: some(n) else: none end}
      end
  end
  r1 = r.react(R.custom-event(ES.counter, 5))
  r1.get-value() is 15
  r2 = r.start-trace().react(R.custom-event(ES.counter, 5)).react(R.custom-event(ES.counter, 1))
  r2.get-value() is 16
  r2.get-trace() is [list: 10, 15, 16]
  messages(r2) is [list: some(5), none]
  ticks(r2) is [list: 1, 2]
end

check "the trace holds the binding that produced each message":
  r = reactor:
    init: 0,
    to(ES.lamp): lam(w): "state " + tostring(w) end,
    on-to(ES.counter, ES.lamp): lam(w, n): {w + n; "reply " + tostring(n)} end
  end
  t = r.start-trace().react(R.custom-event(ES.counter, 4))
  messages(t) is [list: "reply 4", "state 4"]
  ticks(t) is [list: 1, 1]
  handlers = t.get-message-trace-as-table().get-column("handler")
  handlers.get(0).source is ES.counter
  handlers.get(0).sink is ES.lamp
  handlers.get(1).sink is ES.lamp
  torepr(handlers.get(1)) is "to(event-sink(\"lamp\"), <function>)"
  torepr(handlers.get(0)) is "on-to(event-source(\"counter\"), event-sink(\"lamp\"), <function>)"
end

check "several bindings on one source each count as a transition":
  r = reactor:
    init: 0,
    on(ES.counter): lam(w, n): w + n end,
    on-to(ES.counter, ES.beeper): lam(w, n): {w * 10; some(w)} end,
    to(ES.lamp): lam(w): tostring(w) end
  end
  r1 = r.start-trace().react(R.custom-event(ES.counter, 2))
  r1.get-value() is 20
  r1.get-trace() is [list: 0, 2, 20]
  messages(r1) is [list: "2", some(2), "20"]
  ticks(r1) is [list: 1, 2, 2]
  sinks(r1) is [list: "lamp", "beeper", "lamp"]
end

check "value forms in on-event":
  r = reactor:
    init: 0,
    on-event: [list:
      R.to(ES.lamp, lam(w): tostring(w) end),
      R.on-to(ES.counter, ES.beeper, lam(w, n): {w + n; some(n)} end)
    ]
  end
  r1 = r.start-trace().react(R.custom-event(ES.counter, 3))
  r1.get-value() is 3
  messages(r1) is [list: some(3), "3"]
end

check "on-to handlers must return a pair":
  r = reactor:
    init: 0,
    on-to(ES.counter, ES.beeper): lam(w, n): w + n end
  end
  r.react(R.custom-event(ES.counter, 3)) raises "must return a tuple {new-state; message}"
  r3 = reactor:
    init: 0,
    on-to(ES.counter, ES.beeper): lam(w, n): {w; n; n} end
  end
  r3.react(R.custom-event(ES.counter, 3)) raises "must return a tuple {new-state; message}"
end

check "errors in projections surface from react":
  r = reactor:
    init: 0,
    on-tick: lam(w): w + 1 end,
    to(ES.lamp): lam(w): raise("no lamp") end
  end
  r.react(R.time-tick) raises "no lamp"
end

check "a stopped reactor sends nothing":
  r = reactor:
    init: 0,
    on-tick: lam(w): w + 1 end,
    stop-when: lam(w): w >= 1 end,
    to(ES.lamp): lam(w): tostring(w) end
  end
  r1 = r.start-trace().react(R.time-tick)
  messages(r1) is [list: "1"]
  messages(r1.react(R.time-tick)) is [list: "1"]
  r1.react(R.time-tick).get-value() is 1
end

check "react does not open sinks":
  r = reactor:
    init: 0,
    on-tick: lam(w): w + 1 end,
    to(ES.lamp): lam(w): tostring(w) end
  end
  messages(r.start-trace().react(R.time-tick)) is [list: "1"]
  ES.sink-open-count() is 0
end

check "interact adds to the message trace":
  r = reactor:
    init: 0,
    on-to(ES.counter, ES.beeper): lam(w, n): {w + n; some(n)} end,
    to(ES.lamp): lam(w): tostring(w) end
  end
  t = ES.fake-run(r.start-trace().react(R.custom-event(ES.counter, 1)), 5)
  t.get-trace() is [list: 0, 1, 6]
  messages(t) is [list: some(1), "1", "1", some(5), "6"]
  ticks(t) is [list: 1, 1, 1, 2, 2]
  sinks(t) is [list: "beeper", "lamp", "lamp", "beeper", "lamp"]
  r.interact() raises "No interaction set up"
end

check "sources print as the library asks":
  torepr(R.every(2)) is "every(2)"
  torepr(R.every(1/2)) is "every(1/2)"
  torepr(R.spy-on) is "event-sink(\"spy-on\")"
end

check "sources and sinks are started once per binding and told how they are bound":
  r = reactor:
    init: 0,
    on(ES.counter): lam(w, n): w + n end,
    on-to(ES.counter, ES.beeper): lam(w, n): {w; none} end,
    to(ES.lamp): lam(w): "on" end,
    to(ES.beeper): lam(w): none end
  end
  ES.attach-log(r) is [list:
    "counter single",
    "counter paired with beeper", "beeper paired with counter",
    "lamp single",
    "beeper single"]
  ES.sink-open-count() is 0
  ES.subscriber-count() is 0
  r.interact() raises "No interaction set up"
end

check "sink bindings check their parts":
  reactor:
    init: 0,
    to(5): lam(w): w end
  end raises "EventSink"
  reactor:
    init: 0,
    on-to(ES.counter, 5): lam(w, n): {w; n} end
  end raises "EventSink"
  reactor:
    init: 0,
    to(ES.lamp): 5
  end raises "Function"
end
