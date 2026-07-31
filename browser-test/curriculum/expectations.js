/*
 * expectations.js -- what each student entry point is supposed to do.
 *
 * This is the reviewed half of the suite. `entries` records one outcome per
 * starter file, so a Pyret change that alters ANY of them fails a named test
 * rather than being absorbed. The outcomes are described in assertions.js;
 * briefly:
 *
 *   runs                the program finishes with an empty error area
 *   interactive         it opens an animation window and draws a frame
 *   needs-google-login  it compiles and runs, and dies at load-spreadsheet
 *                       because the editor has no Google session (only when
 *                       run with --sheets=none; see README "Google Sheets")
 *   placeholder         it ships with a blank for the student's own
 *                       spreadsheet, so it errors until they paste one in
 *   teaching-error      it is deliberately broken, and must stay broken in the
 *                       specific way the lesson is about
 *   broken-upstream     same check, opposite meaning: the starter file has a
 *                       real bug and a student hits an error the lesson never
 *                       intended. Each carries a `note`; see README "Findings"
 *
 * The four `known*` lists below pin the state of the curriculum's own links.
 * They are not Pyret's problem, but they decide what this suite covers, so a
 * change to any of them should be seen rather than silently widening or
 * narrowing the run.
 *
 * Regenerating: curriculum/baseline.js drives the same harness and prints this
 * table's shape. See README.md ("Re-pinning to a new term").
 */

// Linked from the curriculum, 404 at the pinned ref. Each is a "Starter File"
// button in a lesson that opens an empty editor for a student today.
const knownMissingLinks = [
  // shared/langs/en-us/starterFiles/ai.json -> "premiums"
  "ai/premiums.arr",
  // shared/langs/en-us/starterFiles/data-science.json -> "text-stats-library"
  "libraries/text-stats-library.arr",
  // shared/langs/en-us/starterFiles/reactive.json -> "emoji-refactor"
  "reactive/emoji-refactor.arr",
];

// Curriculum links that bypass the term tag and follow a branch instead, so
// what the student gets is whatever that branch holds today.
const knownUnpinnedLinks = [
  "refs/heads/main :: ai/ai-music.arr",
  "refs/heads/main :: data-science/Expanded Animals Starter File.arr",
];

// Starter files whose OWN `use context` / `include` headers reach for a branch
// rather than the term tag -- so these entry points load library code that is
// not pinned even when the entry point itself is.
const knownUnpinnedImports = [
  "ai/ai-fast-food.arr",
  "ai/ai-images.arr",
  "ai/ai-music.arr",
  "ai/ai-old-lady.arr",
  "ai/ai-text.arr",
  "ai/ai-text2.arr",
];

// .arr files in starter-files that no lesson links to, and that are not under
// libraries/. Listed so "every entry point is covered" is a checkable claim
// rather than an assumption: anything new that appears here is either a
// student file the curriculum forgot to link, or a file that belongs on this
// list.
const knownNonEntryPoints = [
  "ai/ai-starter-file - not used.arr",
  "ai/premiums - not used.arr",
  "data-science/Blank Starter File.arr",
  "projects/games/OG - Game Screenshot Starterfile.arr",
  "reactive/robot-refactor.arr",
];

/*
 * Import headers that do more than import.
 *
 * The "libraries" group runs each distinct `use context` / `include` header on
 * its own and then exercises the library from the interactions window. That
 * works because a header normally just loads. Two Bootstrap libraries end with
 * a call that opens an animation, so importing them is already the whole
 * program -- keyed here by the first entry point that uses the header (which
 * is how the group is labelled). If a new entry point ever sorts ahead of one
 * of these and takes over the label, the key stops matching and the header is
 * judged by the default "just loads" rule -- which that header fails. Noisy
 * rather than silent, which is the right way round.
 */
const preludes = {
  // libraries/ninja-cat-library.arr ends with `game.interact()`
  "algebra/Ninja Cat.arr": { outcome: "interactive" },
  // libraries/package-delivery-library.arr ends with `animation(next-position)`
  "reactive/Package Delivery.arr": { outcome: "interactive" },
};

/*
 * One expectation per student entry point, keyed by its path in
 * bootstrapworld/starter-files at the pinned ref.
 *
 * Recorded against starter-files@fall2026 (80df26a) with curriculum@27bb2e5,
 * on an editor that CAN read the curriculum's public Google Sheets (see
 * README "Google Sheets"), and REVIEWED -- `curriculum/baseline.js` drafts
 * this table by running everything, but every non-"runs" row was read by hand,
 * because those are exactly the rows a machine cannot judge: "this file does
 * not compile" is the lesson in one place, a bug in five others, and a blank
 * waiting for the student in two more.
 *
 * As recorded:
 *
 *   runs            121   finishes clean; its own definitions are probed, and
 *                         for a sheet-backed file each loaded table must show
 *                         its declared columns and a first row
 *   interactive      29   opens a window and paints -- a reactor animation, or
 *                         (`windowKind: "chart"`) a Bootstrap Interactive Chart
 *   broken-upstream   5   genuinely broken starter files -- see README
 *   placeholder       2   templates waiting for the student's own spreadsheet
 *   teaching-error    1   core/Bug Hunting.arr, broken on purpose
 *
 * `readsSheet` marks the 76 files that open a Google Sheet. It is EMPIRICAL --
 * the set that failed with the Google-auth message on a plain editor -- not a
 * grep for `load-spreadsheet`, which misses the ones whose sheet load happens
 * inside an included library. `forEntry` uses it to pick the right expectation
 * for how the editor booted, and a `--sheets=none` run is what checks the set
 * is right: a file wrongly marked (or wrongly not) fails there.
 *
 * `checkBlocks` / `failedCheckBlocks` appear on the "runs" files that carry
 * `examples:` or `check:` blocks (the count includes CPO's summary block).
 * Several of those blocks are MEANT to fail -- they are the exercise, and stay
 * red until the student writes the function -- so the failing count is pinned
 * too rather than treated as a problem.
 */
const entries = {
  "ai/Decision Tree Starter File.arr": {"outcome":"runs","readsSheet":true},
  "ai/Self-Driving-Car.arr": {"outcome":"runs"},
  "ai/Spell Checker Starter File.arr": {"outcome":"runs"},
  "ai/ai-animals.arr": {"outcome":"interactive","readsSheet":true,"windowKind":"chart"},
  "ai/ai-fast-food.arr": {"outcome":"runs","readsSheet":true},
  "ai/ai-images.arr": {"outcome":"runs"},
  "ai/ai-music.arr": {"outcome":"runs","readsSheet":true},
  "ai/ai-old-lady.arr": {"outcome":"runs"},
  "ai/ai-text.arr": {"outcome":"runs"},
  "ai/ai-text2.arr": {"outcome":"runs"},
  "algebra-2/Aaron Judge Hits.arr": {"outcome":"runs","readsSheet":true},
  "algebra-2/CO2 Hybrid Models.arr": {"outcome":"runs","readsSheet":true},
  "algebra-2/CO2 Starter File.arr": {"outcome":"runs","readsSheet":true},
  "algebra-2/Countries Starter File.arr": {"outcome":"runs","readsSheet":true},
  "algebra-2/Covid Starter File.arr": {"outcome":"runs","readsSheet":true},
  "algebra-2/Fuel Efficiency Starter File.arr": {"outcome":"runs","readsSheet":true},
  "algebra-2/London Ride.arr": {"outcome":"runs","readsSheet":true},
  "algebra-2/Miguel Cabrera Hits.arr": {"outcome":"runs","readsSheet":true},
  "algebra-2/State Demographics (Intro) Starter File.arr": {"outcome":"runs","readsSheet":true},
  "algebra-2/State Demographics Starter File.arr": {"outcome":"runs","readsSheet":true},
  "algebra-2/Unit Clock Starter File.arr": {"outcome":"interactive"},
  "algebra/Ninja Cat.arr": {"outcome":"interactive"},
  "algebra/Sally's Lemonade.arr": {"outcome":"runs"},
  "algebra/Surface Area of Rectangular Prism.arr": {"outcome":"runs"},
  "algebra/collaboration/collaboration - solution.arr": {"outcome":"runs"},
  "algebra/collaboration/collaboration.arr": {"outcome":"runs"},
  "algebra/combinatorics/Permutations and Combinations Starter File.arr": {"outcome":"runs"},
  "algebra/inequalities/Compound Inequalities Starter File.arr": {"outcome":"runs"},
  "algebra/inequalities/Sam the Butterfly.arr": {"outcome":"interactive"},
  "algebra/inequalities/Simple Inequalities Starter File.arr": {"outcome":"runs"},
  "algebra/linearity/Exploring Linearity in Definitions.arr": {"outcome":"runs","checkBlocks":2},
  "algebra/linearity/Exploring Linearity in Graphs.arr": {"outcome":"runs"},
  "algebra/linearity/Exploring Linearity in Tables.arr": {"outcome":"runs"},
  "core/Alices Restaurant.arr": {"outcome":"runs","checkBlocks":2},
  "core/Bug Hunting.arr": {"outcome":"teaching-error","errorContains":["Pyret didn't understand your program"]},  // the lesson IS the bugs -- ten deliberate mistakes for students to find
  "core/Defining Values.arr": {"outcome":"runs"},
  "core/Mood Generator Starter File - ASK.arr": {"outcome":"runs","checkBlocks":2},
  "core/Mood Generator Starter File - IF-ELSE.arr": {"outcome":"runs","checkBlocks":2,"failedCheckBlocks":1},
  "core/Red Shape.arr": {"outcome":"runs","checkBlocks":2},
  "core/Rocket Height.arr": {"outcome":"interactive"},
  "core/bc.arr": {"outcome":"runs","checkBlocks":2},
  "core/booleans.arr": {"outcome":"runs"},
  "core/gt.arr": {"outcome":"runs"},
  "data-science/Age v Height Starter File.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Animals Starter File.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Cheerios Starter File.arr": {"outcome":"interactive","readsSheet":true,"windowKind":"chart"},
  "data-science/Coin Flip.arr": {"outcome":"interactive"},
  "data-science/Custom Scatterplots.arr": {"outcome":"interactive","readsSheet":true,"windowKind":"chart"},
  "data-science/Dessert Survey.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Dogs, Rabbits, Cats, & Tarantulas Starter File.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Expanded Animals Starter File.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Global Food Supply.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Grouped Samples Starter File.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Hair.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Lizard Sample Starter File.arr": {"outcome":"runs","readsSheet":true},
  "data-science/New Animals Starter File.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Olympic Records.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Piecewise Visualizations with Images.arr": {"outcome":"broken-upstream","errorContains":["spider-img","is unbound"],"note":"animal-img returns spider-img (line 45); the file defines tarantula-img"},
  "data-science/Piecewise Visualizations with Intervals.arr": {"outcome":"interactive","readsSheet":true,"windowKind":"chart"},
  "data-science/Piecewise Visualizations.arr": {"outcome":"interactive","readsSheet":true,"windowKind":"chart"},
  "data-science/Putting it all together.arr": {"outcome":"runs","readsSheet":true,"checkBlocks":9},
  "data-science/Row Functions Starter File.arr": {"outcome":"runs","readsSheet":true,"checkBlocks":2},
  "data-science/Table Functions Starter File.arr": {"outcome":"runs","checkBlocks":5},
  "data-science/Tooth Data.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Trust but Verify.arr": {"outcome":"runs","readsSheet":true},
  "data-science/Word Length.arr": {"outcome":"runs","checkBlocks":3},
  "data-science/dataset-library/air-quality.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/arctic-sea-ice.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/beverages.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/ca-college-admissions.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/cities-proximity-to-ocean.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/college-majors.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/countries-of-the-world.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/covid-by-county.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/e-sports.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/earthquakes.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/fast-food.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/game-reviews.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/gerrymandering.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/global-waste.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/health-by-county.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/lapd-arrests.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/marijuana-laws.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/mlb-hitting.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/modern-art.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/movies.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/music.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/nba-stats.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/nfl-passing.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/nfl-rushing.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/nypd-stop-and-frisk.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/organs-of-north-america.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/pokemon.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/refugees.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/ri-schools.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/state-demographics.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/us-colleges.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/us-income.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/us-jobs.arr": {"outcome":"runs","readsSheet":true},
  "data-science/dataset-library/voter-turnout.arr": {"outcome":"runs","readsSheet":true},
  "data-science/live-surveys/Live Survey for Bar and Pie Charts.arr": {"outcome":"interactive","readsSheet":true},
  "data-science/live-surveys/Live Survey for Box Plots.arr": {"outcome":"interactive","readsSheet":true},
  "data-science/live-surveys/Live Survey for Dot Plots.arr": {"outcome":"interactive","readsSheet":true},
  "data-science/live-surveys/Live Survey for Histograms.arr": {"outcome":"interactive","readsSheet":true},
  "data-science/live-surveys/Live Survey for Linear Regression.arr": {"outcome":"interactive","readsSheet":true},
  "data-science/live-surveys/Live Survey for MOC.arr": {"outcome":"interactive","readsSheet":true},
  "data-science/live-surveys/Live Survey for Scatter Plot.arr": {"outcome":"interactive","readsSheet":true},
  "expressions-and-equations/Additive Inverse Starter File.arr": {"outcome":"runs"},
  "expressions-and-equations/Equivalence Starter File.arr": {"outcome":"runs"},
  "expressions-and-equations/Exponents Starter File.arr": {"outcome":"runs","checkBlocks":2,"failedCheckBlocks":1},
  "expressions-and-equations/Expressions and Equations Starter File.arr": {"outcome":"runs"},
  "expressions-and-equations/Identity Starter File.arr": {"outcome":"runs"},
  "expressions-and-equations/Is it 16 Starter File.arr": {"outcome":"runs","checkBlocks":3,"failedCheckBlocks":1},
  "expressions-and-equations/Is it 16 with Negatives.arr": {"outcome":"runs","checkBlocks":3,"failedCheckBlocks":1},
  "expressions-and-equations/Multiplicative Inverse Starter File.arr": {"outcome":"runs"},
  "expressions-and-equations/Negation Starter File.arr": {"outcome":"runs","checkBlocks":2,"failedCheckBlocks":1},
  "expressions-and-equations/Negatives and Exponents Starter File.arr": {"outcome":"runs","checkBlocks":2,"failedCheckBlocks":1},
  "projects/Blank DS Starter File.arr": {"outcome":"placeholder","readsSheet":true,"errorContains":["ADDRESS-OF-YOUR-GOOGLE-SHEET"]},  // the student pastes their own sheet URL here
  "projects/Functions Starter File.arr": {"outcome":"runs","checkBlocks":3,"failedCheckBlocks":1},
  "projects/Logo Starter File.arr": {"outcome":"runs"},
  "projects/Logos Warm Up.arr": {"outcome":"runs"},
  "projects/Method 1 - Compose Functions in a single definition.arr": {"outcome":"runs"},
  "projects/Method 2 - Compose Functions 1 Step at a time.arr": {"outcome":"runs"},
  "projects/My Function.arr": {"outcome":"runs"},
  "projects/Snack Habits Template.arr": {"outcome":"placeholder","readsSheet":true,"errorContains":["PASTE THE URL FOR THE GOOGLESHEETS"]},  // the student pastes their class survey's sheet URL here
  "projects/flags/Alaska Flag (quick - repeated use of a variable).arr": {"outcome":"runs"},
  "projects/flags/Chinese Flag.arr": {"outcome":"runs"},
  "projects/flags/Flags starter file.arr": {"outcome":"runs"},
  "projects/flags/Lebanon Flag starter code (uses scale).arr": {"outcome":"runs"},
  "projects/flags/Mexican Flag.arr": {"outcome":"runs"},
  "projects/flags/Netherlands, Ireland, Mauritius.arr": {"outcome":"runs"},
  "projects/flags/Panama Flag.arr": {"outcome":"runs"},
  "projects/flags/Puerto Rico Flag.arr": {"outcome":"runs"},
  "projects/flags/Trinidad and Tobago two ways.arr": {"outcome":"runs"},
  "projects/flags/Turkey.arr": {"outcome":"runs"},
  "projects/games/OG - Blank Game.arr": {"outcome":"interactive"},
  "projects/games/Simple Game (no collision).arr": {"outcome":"interactive"},
  "projects/games/Simple Game (w_2d movement).arr": {"outcome":"interactive"},
  "projects/games/Simple Game (w_dist lines).arr": {"outcome":"interactive"},
  "projects/games/Simple Game.arr": {"outcome":"interactive"},
  "reactive/1-Number State.arr": {"outcome":"interactive","drawsFrame":false},  // to-draw: is left for the student to write
  "reactive/1-Paddle Pong.arr": {"outcome":"interactive"},
  "reactive/2-Number State.arr": {"outcome":"interactive","drawsFrame":false},  // to-draw: is left for the student to write
  "reactive/Bakery.arr": {"outcome":"runs"},
  "reactive/Bicycle.arr": {"outcome":"interactive"},
  "reactive/Cow Jump.arr": {"outcome":"broken-upstream","errorContains":["Pyret didn't understand your program"],"note":"line 25 has doubled quotes: image-url(\"\"https://...cow.png\"\")"},
  "reactive/Light Switch.arr": {"outcome":"interactive"},
  "reactive/Moving Character.arr": {"outcome":"runs"},
  "reactive/Package Delivery.arr": {"outcome":"broken-upstream","errorContains":["has no provided member animation"],"note":"line 28 calls Start.animation, but package-delivery-library.arr provides only what it re-exports from Core and Starter"},
  "reactive/Pinwheels.arr": {"outcome":"runs"},
  "reactive/Pinwheels2.arr": {"outcome":"runs"},
  "reactive/Pulsing Star.arr": {"outcome":"interactive"},
  "reactive/Reactive NinjaCat.arr": {"outcome":"broken-upstream","errorContains":["Unable to load","libraries/images/bg.png"],"note":"line 16 loads libraries/images/bg.png, which does not exist (the library uses bg.jpg)"},
  "reactive/Sunset.arr": {"outcome":"runs"},
  "reactive/Virtual Pet.arr": {"outcome":"interactive"},
  "reactive/Watermelon Smash.arr": {"outcome":"broken-upstream","errorContains":["The name interact is unbound"],"note":"line 40 calls interact(smash-react); a reactor is run as smash-react.interact()"},
  "reactive/What to Wear.arr": {"outcome":"runs","checkBlocks":2},
  "reactive/robot-emoji.arr": {"outcome":"runs"},
};

/*
 * The expectation for one entry point, given how the editor was booted.
 *
 * Files that open a Google Sheet are recorded by what they do when the sheet
 * can actually be read (`readsSheet: true`, plus the normal outcome). Without
 * that -- a plain editor, nobody signed in -- the very same file can only get
 * as far as the Google call, so the expectation degrades to
 * "needs-google-login" rather than the suite having two tables to keep in
 * step, or (worse) quietly passing whichever way it was run.
 */
function forEntry(repoPath, opts) {
  const e = entries[repoPath];
  if (!e) return e;
  if (e.readsSheet && !(opts && opts.publicSheets)) {
    return { outcome: "needs-google-login", readsSheet: true };
  }
  return e;
}

function forPrelude(label) {
  return preludes[label] || { outcome: "runs" };
}

module.exports = {
  entries,
  forEntry,
  preludes,
  forPrelude,
  knownMissingLinks,
  knownUnpinnedLinks,
  knownUnpinnedImports,
  knownNonEntryPoints,
};
