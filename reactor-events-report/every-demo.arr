# Agent-written example (Claude). Runs on code.pyret.org with no hardware:
# two independent timers feed one reactor alongside on-tick and on-key.
import reactors as R
import image as I

spawner = R.every(2)
heartbeat = R.every(0.5)

fun draw(w):
  scene = I.empty-scene(300, 200)
  dot = I.circle(10 + (5 * num-modulo(w.beats, 2)), "solid", "red")
  label = I.text("spawned " + num-to-string(w.spawned) + "  ticks " + num-to-string(w.ticks), 16, "black")
  I.place-image(label, 150, 20, I.place-image(dot, w.x, 120, scene))
end

r = reactor:
  init: {x: 150, ticks: 0, spawned: 0, beats: 0},
  on-tick: lam(w): w.{ticks: w.ticks + 1} end,
  on-key: lam(w, k):
    if k == "left": w.{x: w.x - 10}
    else if k == "right": w.{x: w.x + 10}
    else: w
    end
  end,
  on(spawner): lam(w, n): w.{spawned: n} end,
  on(heartbeat): lam(w, n): w.{beats: n} end,
  to-draw: draw,
  stop-when: lam(w): w.spawned >= 5 end,
  close-when-stop: true
end

check "the handlers can be tested without running the reactor":
  r.react(R.custom-event(spawner, 3)).get-value().spawned is 3
  r.react(R.custom-event(heartbeat, 7)).get-value().beats is 7
  r.react(R.time-tick).get-value().ticks is 1
end

r.interact()
