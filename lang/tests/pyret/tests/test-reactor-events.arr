import js-file("./test-event-source") as ES
import reactors as R

check "event sources from a JS library":
  R.event-source-name(ES.counter) is "counter"
  R.event-source-name(ES.words) is "words"
  torepr(ES.counter) is "event-source(\"counter\")"
  ES.counter is ES.counter
  ES.counter is-not ES.words
  ES.counter is-not== ES.words
  R.event-source-name(5) raises "EventSource"
end

check "on builds a handler":
  h = R.on(ES.counter, lam(w, n): w + n end)
  h.source is ES.counter
  R.on(5, lam(w, n): w end) raises "EventSource"
  R.on(ES.counter, 5) raises "Function"
end

check "reacting to custom events programmatically":
  r = reactor:
    init: 10,
    on-tick: lam(w): w + 1 end,
    on-event: [list:
      R.on(ES.counter, lam(w, n): w + n end),
      R.on(ES.words, lam(w, s): w + string-length(s) end)
    ]
  end
  r.react(R.custom-event(ES.counter, 5)).get-value() is 15
  r.react(R.custom-event(ES.words, "abc")).get-value() is 13
  r.react(R.custom-event(ES.counter, 5)).react(R.time-tick).get-value() is 16
  R.react(r, R.custom-event(ES.counter, 1)).get-value() is 11

  t = r.start-trace().react(R.custom-event(ES.counter, 2)).react(R.custom-event(ES.words, "x"))
  t.get-trace() is [list: 10, 12, 13]

  r.react(R.custom-event(R.every(1), 3)) raises "No on-event handler defined for the event source"
  r.react(R.custom-event(5, 3)) raises "EventSource"
end

check "no on-event at all":
  r = reactor:
    init: 0,
    on-tick: lam(w): w + 1 end
  end
  r.react(R.custom-event(ES.counter, 5)) raises "No on-event handler defined for the event source"
end

check "multiple handlers on the same source run in order":
  r = reactor:
    init: [list:],
    on-event: [list:
      R.on(ES.counter, lam(w, n): link(n, w) end),
      R.on(ES.counter, lam(w, n): link(n * 10, w) end)
    ]
  end
  r.react(R.custom-event(ES.counter, 2)).get-value() is [list: 20, 2]
  r.start-trace().react(R.custom-event(ES.counter, 2)).get-trace() is [list: [list:], [list: 2], [list: 20, 2]]
end

check "stop-when applies to custom events":
  r = reactor:
    init: 0,
    stop-when: lam(w): w >= 3 end,
    on-event: [list: R.on(ES.counter, lam(w, n): w + n end)]
  end
  r.react(R.custom-event(ES.counter, 3)).react(R.custom-event(ES.counter, 3)).get-value() is 3
end

check "on-event must be a list of handlers":
  reactor:
    init: 0,
    on-event: 5
  end raises "List"
  reactor:
    init: 0,
    on-event: [list: 5]
  end raises "EventHandler"
  reactor:
    init: 0,
    on-event: [list: ES.counter]
  end raises "EventHandler"
end

check "every":
  R.event-source-name(R.every(2)) is "every 2s"
  R.event-source-name(R.every(1/2)) is "every 1/2s"
  R.every(0) raises "NumPositive"
  R.every(-1) raises "NumPositive"
  r = reactor:
    init: 0,
    on-event: [list: R.on(R.every(1), lam(w, n): w + n end)]
  end
  r.react(R.custom-event(R.every(1), 7)) raises "No on-event handler defined"
end

check "subscription is not started by react":
  ES.subscriber-count() is 0
  r = reactor:
    init: 0,
    on-event: [list: R.on(ES.counter, lam(w, n): w + n end)]
  end
  r.react(R.custom-event(ES.counter, 1)).get-value() is 1
  ES.subscriber-count() is 0
  r.interact() raises "No interaction set up"
end

check "on(source): handler syntax":
  r = reactor:
    init: 10,
    on-tick: lam(w): w + 1 end,
    on(ES.counter): lam(w, n): w + n end,
    on(ES.words): lam(w, s): w + string-length(s) end
  end
  r.react(R.custom-event(ES.counter, 5)).get-value() is 15
  r.react(R.custom-event(ES.words, "abc")).get-value() is 13
  r.react(R.time-tick).get-value() is 11
  r.react(R.custom-event(R.every(1), 3)) raises "No on-event handler defined"
end

check "on(source) entries come before on-event entries, in source order":
  r = reactor:
    init: [list:],
    on(ES.counter): lam(w, n): link(n, w) end,
    on-event: [list: R.on(ES.counter, lam(w, n): link(n * 100, w) end)],
    on(ES.counter): lam(w, n): link(n * 10, w) end
  end
  r.react(R.custom-event(ES.counter, 2)).get-value() is [list: 200, 20, 2]
end

check "on(source) checks its parts":
  reactor:
    init: 0,
    on(5): lam(w, n): w end
  end raises "EventSource"
  reactor:
    init: 0,
    on(ES.counter): 5
  end raises "Function"
end

check "on(source) handlers in a traced reactor":
  r = reactor:
    init: 0,
    on(ES.counter): lam(w, n): w + n end
  end
  r.start-trace().react(R.custom-event(ES.counter, 2)).react(R.custom-event(ES.counter, 3)).get-trace()
    is [list: 0, 2, 5]
end
