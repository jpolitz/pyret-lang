// Specs for the data-science/ starter files. One row per student entry
// point: the outcome it must have, and the interactions-window entries to
// type after a clean run. See ../README.md for the row format.
module.exports = {
  "data-science/Age v Height Starter File.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["h-sheet", null],
      ["h-table", null],
      ["h-table.row-n(0)", "id"],
    ],
  },
  "data-science/Animals Starter File.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["shelter-sheet", null],
      ["animals-table", null],
      ["animals-table.row-n(0)", "name"],
    ],
  },
  "data-science/Cheerios Starter File.arr": {
    outcome: "interactive",
    readsSheet: true,
    windowKind: "chart",
  },
  "data-science/Coin Flip.arr": {
    outcome: "interactive",
  },
  "data-science/Custom Scatterplots.arr": {
    outcome: "interactive",
    readsSheet: true,
    windowKind: "chart",
  },
  "data-science/Dessert Survey.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["dessert-sheet", null],
      ["dessert-table", null],
      ["dessert-table.row-n(0)", "id"],
    ],
  },
  "data-science/Dogs, Rabbits, Cats, & Tarantulas Starter File.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["shelter-sheet", null],
      ["more-animals", null],
      ["more-animals.row-n(0)", "name"],
    ],
  },
  "data-science/Expanded Animals Starter File.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["shelter-sheet", null],
      ["more-animals", null],
      ["more-animals.row-n(0)", "name"],
    ],
  },
  "data-science/Global Food Supply.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["food-sheet", null],
      ["food-table", null],
      ["food-table.row-n(0)", "country"],
    ],
  },
  "data-science/Grouped Samples Starter File.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["shelter-sheet", null],
      ["animals-table", null],
      ["animals-table.row-n(0)", "name"],
    ],
  },
  "data-science/Hair.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["hair-sheet", null],
      ["hair-table", null],
      ["hair-table.row-n(0)", "hair-color"],
    ],
  },
  "data-science/Lizard Sample Starter File.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["shelter-sheet", null],
      ["lizard-sample", null],
      ["lizard-sample.row-n(0)", "name"],
    ],
  },
  "data-science/New Animals Starter File.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["shelter-sheet", null],
      ["animals-table", null],
      ["animals-table.row-n(0)", "name"],
    ],
  },
  "data-science/Olympic Records.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["olympics-sheet", null],
      ["running-men-table", null],
      ["running-men-table.row-n(0)", "Meters"],
    ],
  },
  "data-science/Piecewise Visualizations with Images.arr": {
    outcome: "errors",
    upstream: true,
    errorContains: ["spider-img","is unbound"],
    note: "animal-img returns spider-img (line 45); the file defines tarantula-img",
  },
  "data-science/Piecewise Visualizations with Intervals.arr": {
    outcome: "interactive",
    readsSheet: true,
    windowKind: "chart",
  },
  "data-science/Piecewise Visualizations.arr": {
    outcome: "interactive",
    readsSheet: true,
    windowKind: "chart",
  },
  "data-science/Putting it all together.arr": {
    outcome: "runs",
    checkBlocks: 9,
    readsSheet: true,
    repl: [
      ["shelter-sheet", null],
      ["animals-table", null],
      ["animals-table.row-n(0)", "name"],
    ],
  },
  "data-science/Row Functions Starter File.arr": {
    outcome: "runs",
    checkBlocks: 2,
    readsSheet: true,
    repl: [
      ["shelter-sheet", null],
      ["animals-table", null],
      ["animals-table.row-n(0)", "name"],
    ],
  },
  "data-science/Table Functions Starter File.arr": {
    outcome: "runs",
    checkBlocks: 5,
    repl: [
      ["shapes-table", null],
      ["blue-triangle", null],
    ],
  },
  "data-science/Tooth Data.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["tooth-sheet", null],
      ["tooth-table", null],
      ["tooth-table.row-n(0)", "name"],
    ],
  },
  "data-science/Trust but Verify.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["shelter-sheet", null],
      ["animals-table", null],
      ["animals-table.row-n(0)", "name"],
      ["is-function(is-fixed)", "true"],
      ["is-function(nametag)", "true"],
    ],
  },
  "data-science/Word Length.arr": {
    outcome: "runs",
    checkBlocks: 3,
    repl: [
      ["source-text", null],
      ["each-word", null],
    ],
  },
  "data-science/dataset-library/air-quality.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["air-sheet", null],
      ["air-table", null],
      ["air-table.row-n(0)", "state"],
    ],
  },
  "data-science/dataset-library/arctic-sea-ice.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["arctic-sheet", null],
      ["arctic-table", null],
      ["arctic-table.row-n(0)", "year"],
    ],
  },
  "data-science/dataset-library/beverages.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["beverages-sheet", null],
      ["beverages-table", null],
      ["beverages-table.row-n(0)", "name"],
    ],
  },
  "data-science/dataset-library/ca-college-admissions.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["college-sheet", null],
      ["college-table", null],
      ["college-table.row-n(0)", "college-year"],
    ],
  },
  "data-science/dataset-library/cities-proximity-to-ocean.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["data-sheet", null],
      ["cities-table", null],
      ["cities-table.row-n(0)", "city"],
    ],
  },
  "data-science/dataset-library/college-majors.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["majors-sheet", null],
      ["majors-table", null],
      ["majors-table.row-n(0)", "major"],
    ],
  },
  "data-science/dataset-library/countries-of-the-world.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["countries-sheet", null],
      ["countries-table", null],
      ["countries-table.row-n(0)", "country"],
    ],
  },
  "data-science/dataset-library/covid-by-county.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["covid-sheet", null],
      ["covid-table", null],
      ["covid-table.row-n(0)", "id"],
    ],
  },
  "data-science/dataset-library/e-sports.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["esports-sheet", null],
      ["esports-table", null],
      ["esports-table.row-n(0)", "game"],
    ],
  },
  "data-science/dataset-library/earthquakes.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["eq-sheet", null],
      ["eq-table", null],
      ["eq-table.row-n(0)", "time"],
    ],
  },
  "data-science/dataset-library/fast-food.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["fastfood-sheet", null],
      ["fastfood-table", null],
      ["fastfood-table.row-n(0)", "name"],
    ],
  },
  "data-science/dataset-library/game-reviews.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["reviews-sheet", null],
      ["reviews-table", null],
      ["reviews-table.row-n(0)", "title"],
    ],
  },
  "data-science/dataset-library/gerrymandering.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["election-2018-sheet", null],
      ["election-table", null],
      ["election-table.row-n(0)", "state"],
    ],
  },
  "data-science/dataset-library/global-waste.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["global-waste-sheet", null],
      ["waste-table", null],
      ["waste-table.row-n(0)", "country"],
    ],
  },
  "data-science/dataset-library/health-by-county.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["health-sheet", null],
      ["health-table", null],
      ["health-table.row-n(0)", "id"],
    ],
  },
  "data-science/dataset-library/lapd-arrests.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["arrests-sheet", null],
      ["arrests-table", null],
      ["arrests-table.row-n(0)", "id"],
    ],
  },
  "data-science/dataset-library/marijuana-laws.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["marijuana-sheet", null],
      ["marijuana-table", null],
      ["marijuana-table.row-n(0)", "state"],
    ],
  },
  "data-science/dataset-library/mlb-hitting.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["mlb-sheet", null],
      ["mlb-table", null],
      ["mlb-table.row-n(0)", "team"],
    ],
  },
  "data-science/dataset-library/modern-art.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["art-sheet", null],
      ["art-table", null],
      ["art-table.row-n(0)", "title"],
    ],
  },
  "data-science/dataset-library/movies.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["movies-sheet", null],
      ["movies-table", null],
      ["movies-table.row-n(0)", "rank"],
    ],
  },
  "data-science/dataset-library/music.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["music-sheet", null],
      ["music-table", null],
      ["music-table.row-n(0)", "artist"],
    ],
  },
  "data-science/dataset-library/nba-stats.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["nba-sheet", null],
      ["nba-table", null],
      ["nba-table.row-n(0)", "id"],
    ],
  },
  "data-science/dataset-library/nfl-passing.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["nfl-passing-sheet", null],
      ["nfl-passing-table", null],
      ["nfl-passing-table.row-n(0)", "rank"],
    ],
  },
  "data-science/dataset-library/nfl-rushing.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["nfl-rushing-sheet", null],
      ["rush-table", null],
      ["rush-table.row-n(0)", "rank"],
    ],
  },
  "data-science/dataset-library/nypd-stop-and-frisk.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["nypd-sheet", null],
      ["nypd-table", null],
      ["nypd-table.row-n(0)", "id"],
    ],
  },
  "data-science/dataset-library/organs-of-north-america.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["organs-sheet", null],
      ["organs-table", null],
      ["organs-table.row-n(0)", "organ-id"],
    ],
  },
  "data-science/dataset-library/pokemon.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["pokemon-sheet", null],
      ["pokemon-table", null],
      ["pokemon-table.row-n(0)", "number"],
    ],
  },
  "data-science/dataset-library/refugees.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["refugees-sheet", null],
      ["refugees-table", null],
      ["refugees-table.row-n(0)", "country"],
    ],
  },
  "data-science/dataset-library/ri-schools.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["ri-schools-sheet", null],
      ["schools-table", null],
      ["schools-table.row-n(0)", "district"],
    ],
  },
  "data-science/dataset-library/state-demographics.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["states-sheet", null],
      ["states-table", null],
      ["states-table.row-n(0)", "state"],
    ],
  },
  "data-science/dataset-library/us-colleges.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["colleges-sheet", null],
      ["colleges-table", null],
      ["colleges-table.row-n(0)", "school"],
    ],
  },
  "data-science/dataset-library/us-income.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["income-sheet", null],
      ["income-table", null],
      ["income-table.row-n(0)", "year"],
    ],
  },
  "data-science/dataset-library/us-jobs.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["occupation-sheet", null],
      ["occupation-table", null],
      ["occupation-table.row-n(0)", "occupation"],
    ],
  },
  "data-science/dataset-library/voter-turnout.arr": {
    outcome: "runs",
    readsSheet: true,
    repl: [
      ["voter-sheet", null],
      ["voter-table", null],
      ["voter-table.row-n(0)", "state"],
    ],
  },
  "data-science/live-surveys/Live Survey for Bar and Pie Charts.arr": {
    outcome: "interactive",
    readsSheet: true,
  },
  "data-science/live-surveys/Live Survey for Box Plots.arr": {
    outcome: "interactive",
    readsSheet: true,
  },
  "data-science/live-surveys/Live Survey for Dot Plots.arr": {
    outcome: "interactive",
    readsSheet: true,
  },
  "data-science/live-surveys/Live Survey for Histograms.arr": {
    outcome: "interactive",
    readsSheet: true,
  },
  "data-science/live-surveys/Live Survey for Linear Regression.arr": {
    outcome: "interactive",
    readsSheet: true,
  },
  "data-science/live-surveys/Live Survey for MOC.arr": {
    outcome: "interactive",
    readsSheet: true,
  },
  "data-science/live-surveys/Live Survey for Scatter Plot.arr": {
    outcome: "interactive",
    readsSheet: true,
  },
};
