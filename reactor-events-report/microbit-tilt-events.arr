use context starter2024
import js-file("/microbit") as MB

import image as I

# The same tilt demo as tilt-demo.arr, but driven by events instead of
# polling MB.await-sample() from on-tick: the board's tilt, temperature and
# buttons each arrive through their own handler.

fun clamp(lo, hi, x): num-max(lo, num-min(hi, x)) end

fun draw(w):
  scene = I.empty-scene(440, 440)
  roll = w.tilt.x / 1000
  pitch = w.tilt.y / 1000
  board = I.rotate(num-to-roughnum(clamp(-75, 75, roll * 55)),
    I.rectangle(190, 150, "solid", if w.pressed: "gold" else: "seagreen" end))
  label = I.text(num-to-string(w.temp) + " C", 24, "gray")
  I.place-image(label, 220, 30,
    I.place-image(board, 220 + (roll * 140), 220 + (pitch * 140), scene))
end

MB.connect()

r = reactor:
  init: {tilt: {x: 0, y: 0, z: 0}, temp: 0, pressed: false},
  on(MB.tilt): lam(w, t): w.{tilt: t} end,
  on(MB.temperature): lam(w, c): w.{temp: c} end,
  on(MB.button-a): lam(w, state): w.{pressed: state == "down"} end,
  to-draw: draw
end

r.interact()
