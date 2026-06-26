/*
 * Embedded-instance version of code.pyret.org/test/tables.js.
 * Same assertion (tester.checkTableRendersCorrectly) and the same table .arr
 * program, run inside an embedded instance.
 */
var embed = require("./embed-setup");
var tester = embed.tester;
var loadSpecsFromFile = require("../shared/load-cpo-specs").loadSpecsFromFile;

describe("Embedded instance — Running Tables programs (test/tables.js programs)", function () {
  before(embed.setupEmbedSingle());
  after(embed.teardown);

  loadSpecsFromFile("tables.js").forEach(function (s) {
    it("should render table program from " + s.program, function (done) {
      this.timeout(s.baseTimeout || 900000);
      tester.checkTableRendersCorrectly(s.code, this.browser, { title: "embed-" + s.program }, s.baseTimeout || 900000);
      this.browser.call(done);
    });
  });
});
