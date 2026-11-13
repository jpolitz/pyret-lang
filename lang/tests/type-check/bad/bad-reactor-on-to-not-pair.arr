import reactors as R

fun run(lamp :: R.EventSink<String>):
  reactor:
    init: 0,
    on-to(R.every(1), lamp): lam(w :: Number, n :: Number): w + n end
  end
end
