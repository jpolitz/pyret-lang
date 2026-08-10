// Specs for the core/ starter files. One row per student entry
// point: the outcome it must have, and the interactions-window entries to
// type after a clean run. See ../README.md for the row format.
module.exports = {
  "core/Alices Restaurant.arr": {
    outcome: "runs",
    checkBlocks: 2,
    repl: [
      ["cost", null],
      ["sales-tax", null],
    ],
  },
  "core/Bug Hunting.arr": {
    outcome: "errors",
    compileError: true,
    errorContains: ["Pyret didn't understand your program"],
    note: "deliberately broken -- the lesson is finding the bugs, so it must fail at compile time",
  },
  "core/Defining Values.arr": {
    outcome: "runs",
    repl: [
      ["x", null],
      ["y", null],
    ],
  },
  "core/Mood Generator Starter File - ASK.arr": {
    outcome: "runs",
    checkBlocks: 2,
    repl: [
      ["mood", null],
    ],
  },
  "core/Mood Generator Starter File - IF-ELSE.arr": {
    outcome: "runs",
    checkBlocks: 2,
    failedCheckBlocks: 1,
    repl: [
      ["mood", null],
    ],
  },
  "core/Red Shape.arr": {
    outcome: "runs",
    checkBlocks: 2,
    repl: [
      ["red-shape", null],
    ],
  },
  "core/Rocket Height.arr": {
    outcome: "interactive",
  },
  "core/bc.arr": {
    outcome: "runs",
    checkBlocks: 2,
    repl: [
      ["gt", null],
    ],
  },
  "core/booleans.arr": {
    outcome: "runs",
    repl: [
      ["is-even(4)", "true"],
      ["is-odd(4)", "false"],
      ["is-less-than-one(0.5)", "true"],
      ["is-primary-color(\"red\")", "true"],
    ],
  },
  "core/gt.arr": {
    outcome: "runs",
    repl: [
      ["gt", null],
    ],
  },
};
