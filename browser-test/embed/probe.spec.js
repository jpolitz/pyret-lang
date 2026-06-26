/*
 * probe.spec.js -- small end-to-end validation that the upstream assertions
 * really run against an embedded instance. Uses the REAL util.js helpers
 * (testRunsAndHasCheckBlocks / testErrorRendersString / testRunAndAllTestsPass)
 * with a few representative specs lifted from the upstream suite.
 */
var path = require("path");
var embed = require("./embed-setup");
var tester = embed.tester;

describe("PROBE: upstream assertions inside an embedded instance", function () {
  before(embed.setupEmbedSingle());
  after(embed.teardown);

  // from test/check-blocks.js
  tester.testRunsAndHasCheckBlocks(it, "simple", "check: 1 is 2 end", [[["failed"]]]);
  tester.testRunsAndHasCheckBlocks(it, "is-pass", "check: 2 is 2 end", [[["Passed"]]]);

  // from test/errors.js
  tester.testErrorRendersString(it, "field-not-found", "{}.x", "did not have a field");

  // a passing program (checkAllTestsPassed / "Looks shipshape")
  tester.testRunAndAllTestsPass(it, "all-pass", "check:\n  1 is 1\n  2 is 2\nend");
});
