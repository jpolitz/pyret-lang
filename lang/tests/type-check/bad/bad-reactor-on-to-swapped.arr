import reactors as R

fun run(lamp :: R.EventSink<String>):
  reactor:
    init: 0,
    on-to(lamp, R.every(1)): lam(w :: Number, n :: Number): {w + n; "x"} end
  end
end
