import reactors as R

fun add-count(w :: Number, n :: Number) -> Number: w + n end

s :: R.EventSource<Number> = R.every(1/2)

r :: R.Reactor<Number> = reactor:
  init: 0,
  on-tick: lam(w :: Number): w + 1 end,
  on(s): add-count,
  on(R.every(2)): lam(w :: Number, n :: Number): w * n end
end

n :: Number = R.react(r, R.custom-event(s, 4)).get-value()
