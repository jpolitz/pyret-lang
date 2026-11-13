import reactors as R

fun show(w :: Number) -> String: tostring(w) end
fun reply(w :: Number, n :: Number) -> {Number; Option<Number>}:
  {w + n; if n > 3: some(n) else: none end}
end

fun run(lamp :: R.EventSink<String>, beeper :: R.EventSink<Option<Number>>) -> Table:
  s :: R.EventSource<Number> = R.every(1/2)
  r :: R.Reactor<Number> = reactor:
    init: 0,
    on(s): lam(w :: Number, n :: Number): w + n end,
    to(lamp): show,
    on-to(s, beeper): reply,
    on-to(R.every(2), lamp): lam(w :: Number, n :: Number): {w * n; "tick"} end,
    on-event: [list: R.to(lamp, show), R.on-to(s, beeper, reply)]
  end
  name :: String = R.event-sink-name(lamp)
  logger :: R.Reactor<Number> = reactor:
    init: 0,
    to(R.spy-on): show,
    to(R.spy-on): lam(w :: Number): w end,
    on-to(s, R.spy-on): lam(w :: Number, n :: Number): {w; some(n)} end
  end
  R.get-message-trace-as-table(r.start-trace().react(R.custom-event(s, 4)))
end
