import reactors as R

fun run(lamp :: R.EventSink<String>):
  reactor:
    init: 0,
    to(lamp): lam(w :: String): w end
  end
end
