import reactors as R

fun add-count(w :: Number, n :: Number) -> Number: w + n end

s :: R.EventSource<Number> = R.every(1/2)

r :: R.Reactor<Number> = reactor:
  init: 0,
  on-tick: lam(w :: Number): w + 1 end,
  on-event: [list: R.on(s, add-count), R.on(R.every(2), add-count)]
end

h :: R.EventHandler<Number> = R.on(R.every(1), lam(w :: Number, n :: Number): w * n end)
e :: R.Event = R.custom-event(s, 4)
n :: Number = R.react(r, e).get-value()
