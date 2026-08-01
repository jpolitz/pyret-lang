// Specs for the algebra/ starter files. One row per student entry
// point: the outcome it must have, and the interactions-window entries to
// type after a clean run. See ../README.md for the row format.
module.exports = {
  "algebra/Ninja Cat.arr": {
    outcome: "interactive",
  },
  "algebra/Sally's Lemonade.arr": {
    outcome: "runs",
  },
  "algebra/Surface Area of Rectangular Prism.arr": {
    outcome: "runs",
    repl: [
      ["prism", null],
      ["LENGTH", null],
      ["string-trim(\"  hi  \")", "hi"],
      ["round-digits(3.14159, 2)", "3.14"],
      ["num-round-to(2.34567, 2)", "2.35"],
      ["image-width(rectangle(300, 200, \"solid\", \"red\"))", "300"],
      ["is-function(bar-chart)", "true"],
    ],
  },
  "algebra/collaboration/collaboration - solution.arr": {
    outcome: "runs",
    repl: [
      ["g", null],
      ["h", null],
    ],
  },
  "algebra/collaboration/collaboration.arr": {
    outcome: "runs",
    repl: [
      ["a", null],
      ["g", null],
    ],
  },
  "algebra/combinatorics/Permutations and Combinations Starter File.arr": {
    outcome: "runs",
    repl: [
      ["ravioli", null],
      ["pizza", null],
    ],
  },
  "algebra/inequalities/Compound Inequalities Starter File.arr": {
    outcome: "runs",
    repl: [
      ["B", null],
      ["C", null],
    ],
  },
  "algebra/inequalities/Sam the Butterfly.arr": {
    outcome: "interactive",
  },
  "algebra/inequalities/Simple Inequalities Starter File.arr": {
    outcome: "runs",
    repl: [
      ["less-than-zero", null],
      ["listA", null],
    ],
  },
  "algebra/linearity/Exploring Linearity in Definitions.arr": {
    outcome: "runs",
    checkBlocks: 2,
    repl: [
      ["funI(3)", "37"],
      ["funB(10)", "20"],
      ["funE(4)", "16"],
      ["funF(99)", "6.5"],
    ],
  },
  "algebra/linearity/Exploring Linearity in Graphs.arr": {
    outcome: "runs",
  },
  "algebra/linearity/Exploring Linearity in Tables.arr": {
    outcome: "runs",
  },
};
