import reactors as R

reactor:
  init: 0,
  on-event: [list: R.on(R.every(1), lam(w :: Number, s :: String): w end)]
end
