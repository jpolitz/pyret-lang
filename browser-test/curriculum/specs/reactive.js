// Specs for the reactive/ starter files. One row per student entry
// point: the outcome it must have, and the interactions-window entries to
// type after a clean run. See ../README.md for the row format.
module.exports = {
  "reactive/1-Number State.arr": {
    outcome: "interactive",
    drawsFrame: false,
  },
  "reactive/1-Paddle Pong.arr": {
    outcome: "interactive",
  },
  "reactive/2-Number State.arr": {
    outcome: "interactive",
    drawsFrame: false,
  },
  "reactive/Bakery.arr": {
    outcome: "runs",
    repl: [
      ["birthday-cake", null],
      ["chocolate-cake", null],
    ],
  },
  "reactive/Bicycle.arr": {
    outcome: "interactive",
  },
  "reactive/Cow Jump.arr": {
    outcome: "errors",
    upstream: true,
    errorContains: ["Pyret didn't understand your program"],
    note: "line 25 has doubled quotes: image-url(\"\"https://...cow.png\"\")",
  },
  "reactive/Light Switch.arr": {
    outcome: "interactive",
  },
  "reactive/Moving Character.arr": {
    outcome: "runs",
    repl: [
      ["bottom-left", null],
      ["top-right", null],
    ],
  },
  "reactive/Package Delivery.arr": {
    outcome: "errors",
    upstream: true,
    errorContains: ["has no provided member animation"],
    note: "line 28 calls Start.animation, but package-delivery-library.arr provides only what it re-exports from Core and Starter",
  },
  "reactive/Pinwheels.arr": {
    outcome: "runs",
    repl: [
      ["PINWHEEL-IMG", null],
      ["STARTING-PINWHEELS", null],
    ],
  },
  "reactive/Pinwheels2.arr": {
    outcome: "runs",
    repl: [
      ["PINWHEEL-IMG", null],
      ["STARTING-PINWHEELS", null],
    ],
  },
  "reactive/Pulsing Star.arr": {
    outcome: "interactive",
  },
  "reactive/Reactive NinjaCat.arr": {
    outcome: "errors",
    upstream: true,
    errorContains: ["Unable to load","libraries/images/bg.png"],
    note: "line 16 loads libraries/images/bg.png, which does not exist (the library uses bg.jpg)",
  },
  "reactive/Sunset.arr": {
    outcome: "runs",
    repl: [
      ["sketchA", null],
    ],
  },
  "reactive/Virtual Pet.arr": {
    outcome: "interactive",
  },
  "reactive/Watermelon Smash.arr": {
    outcome: "errors",
    upstream: true,
    errorContains: ["The name interact is unbound"],
    note: "line 40 calls interact(smash-react); a reactor is run as smash-react.interact()",
  },
  "reactive/What to Wear.arr": {
    outcome: "runs",
    checkBlocks: 2,
    repl: [
      ["warm-outfit", null],
      ["cool-outfit", null],
    ],
  },
  "reactive/robot-emoji.arr": {
    outcome: "runs",
    repl: [
      ["face", null],
      ["grill-mouth", null],
      ["image-width(circle(10, \"solid\", \"red\"))", "20"],
      ["num-sqrt(16)", "4"],
    ],
  },
};
