// Specs for the ai/ starter files. One row per student entry
// point: the outcome it must have, and the interactions-window entries to
// type after a clean run. See ../README.md for the row format.
module.exports = {
  "ai/Decision Tree Starter File.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["shelter-sheet", null],
      ["training", null],
      ["training.row-n(0)", "ID"],
    ],
  },
  "ai/Self-Driving-Car.arr": {
    outcome: "runs",
    repl: [
      ["c-predictor", null],
      ["string-trim(\"  hi  \")", "hi"],
      ["ROAD-HALF-WIDTH", null],
      ["is-function(random-track)", "true"],
      ["is-function(drive)", "true"],
    ],
  },
  "ai/Spell Checker Starter File.arr": {
    outcome: "runs",
    repl: [
      ["levenshtein(\"kitten\", \"sitting\")", "3"],
      ["levenshtein(\"abc\", \"abc\")", "0"],
      ["is-function(alt-words)", "true"],
    ],
  },
  "ai/ai-animals.arr": {
    outcome: "interactive",
    readsSheet: true,
    windowKind: "chart",
  },
  "ai/ai-fast-food.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["fast-food-sheet", null],
      ["fast-food", null],
      ["fast-food.row-n(0)", "ID"],
    ],
  },
  "ai/ai-images.arr": {
    outcome: "runs",
    repl: [
      ["black-sq", null],
      ["white-sq", null],
      ["string-trim(\"  hi  \")", "hi"],
      ["num-words(\"the quick brown fox\")", "4"],
      ["is-function(build-tree)", "true"],
      ["is-function(cosine-similarity)", "true"],
    ],
  },
  "ai/ai-music.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["music-sheet", null],
      ["load-music-sheet", null],
    ],
  },
  "ai/ai-old-lady.arr": {
    outcome: "runs",
    repl: [
      ["corpus", null],
    ],
  },
  "ai/ai-text.arr": {
    outcome: "runs",
    repl: [
      ["badger", null],
      ["blue-whale", null],
    ],
  },
  "ai/ai-text2.arr": {
    outcome: "runs",
    repl: [
      ["badger", null],
      ["kangaroo", null],
    ],
  },
};
