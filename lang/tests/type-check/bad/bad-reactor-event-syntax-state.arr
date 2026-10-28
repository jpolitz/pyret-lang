import reactors as R

reactor:
  init: "hello",
  on(R.every(1)): lam(w :: Number, n :: Number): w + n end
end
