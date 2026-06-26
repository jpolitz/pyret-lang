/*
 * Embedded-instance version of code.pyret.org/test/errors.js.
 *
 * Same assertions (tester.testErrorRendersString / testRunsAndHasCheckBlocks,
 * imported UNCHANGED from code.pyret.org/test-util/util.js) run on the same
 * inputs (loaded directly out of test/errors.js via the recording loader),
 * but against an embedded Pyret instance instead of a top-level /editor page.
 */
var embed = require("./embed-setup");
var tester = embed.tester;
var loadSpecsFromFile = require("../shared/load-cpo-specs").loadSpecsFromFile;

describe("Embedded instance — Rendering errors (test/errors.js specs)", function () {
  before(embed.setupEmbedSingle());
  after(embed.teardown);

  loadSpecsFromFile("errors.js").forEach(function (s) {
    if (s.kind === "checkBlocks") {
      tester.testRunsAndHasCheckBlocks(it, s.name, s.code, s.specs, s.options);
    } else if (s.kind === "errorString") {
      tester.testErrorRendersString(it, s.name, s.code, s.expected, s.options);
    }
  });
});
