/*
 * Embedded-instance version of code.pyret.org/test/chart.js.
 * Same assertion (tester.runAndCheckAllTestsPassed -> checkAllTestsPassed,
 * "Looks shipshape") and the same chart .arr programs (read from
 * test-util/pyret-programs/charts/ by the loader), run inside an embedded
 * instance. This is the "same chart tests pass the same tests" demonstration.
 */
var embed = require("./embed-setup");
var tester = embed.tester;
var loadSpecsFromFile = require("../shared/load-cpo-specs").loadSpecsFromFile;

describe("Embedded instance — Running chart programs (test/chart.js programs)", function () {
  before(embed.setupEmbedSingle());
  after(embed.teardown);

  loadSpecsFromFile("chart.js").forEach(function (s) {
    it("should run chart program from " + s.program, function (done) {
      this.timeout(s.baseTimeout || 900000);
      tester.runAndCheckAllTestsPassed(s.code, this.browser, { title: "embed-" + s.program }, s.baseTimeout || 900000);
      this.browser.call(done);
    });
  });
});
