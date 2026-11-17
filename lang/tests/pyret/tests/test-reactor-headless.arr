import js-file("./test-event-source") as ES
import reactors as R

fun messages(r): r.get-message-trace-as-table().get-column("message") end

check "interact in node runs sources, to-sinks and stop-when":
  r = reactor:
    init: 0,
    on(R.every(1/100)): lam(w, n): w + n end,
    to(ES.lamp): lam(w): tostring(w) end,
    stop-when: lam(w): w >= 10 end
  end
  r.interact().get-value() is 10
  t = r.start-trace().interact()
  t.get-trace() is [list: 0, 1, 3, 6, 10]
  messages(t) is [list: "0", "1", "3", "6", "10"]
  t.get-message-trace-as-table().get-column("tick") is [list: 0, 1, 2, 3, 4]
  ES.sink-open-count() is 0
end

check "interact in node: on-to replies come before the new state's projections":
  every = R.every(1/100)
  r = reactor:
    init: 0,
    on-to(every, ES.beeper): lam(w, n): {w + 1; some(w)} end,
    to(ES.lamp): lam(w): tostring(w) end,
    stop-when: lam(w): w == 2 end
  end
  t = r.start-trace().interact()
  t.get-trace() is [list: 0, 1, 2]
  messages(t) is [list: "0", some(0), "1", some(1), "2"]
  t.get-message-trace-as-table().get-column("tick") is [list: 0, 1, 1, 2, 2]
end

check "interact in node runs on-tick":
  r = reactor:
    init: 0,
    on-tick: lam(w): w + 1 end,
    seconds-per-tick: 1/100,
    stop-when: lam(w): w == 5 end
  end
  r.interact().get-value() is 5
end

check "interact in node: an error in a handler ends the interaction":
  r = reactor:
    init: 0,
    on(R.every(1/100)): lam(w, n): raise("boom") end
  end
  r.interact() raises "boom"
end

check "interact in node: stop-when true at the start":
  r = reactor:
    init: 3,
    on(ES.counter): lam(w, n): w + n end,
    stop-when: lam(w): w == 3 end
  end
  r.interact().get-value() is 3
end
