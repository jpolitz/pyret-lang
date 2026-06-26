/*
 * Embedded-instance version of code.pyret.org/test/check-blocks.js.
 * Same assertion (tester.testRunsAndHasCheckBlocks, unchanged) and same specs
 * (loaded from test/check-blocks.js), run against an embedded instance.
 */
var embed = require("./embed-setup");
var tester = embed.tester;
var loadSpecsFromFile = require("../shared/load-cpo-specs").loadSpecsFromFile;

describe("Embedded instance — Rendering check blocks (test/check-blocks.js specs)", function () {
  before(embed.setupEmbedSingle());
  after(embed.teardown);

  loadSpecsFromFile("check-blocks.js").forEach(function (s) {
    tester.testRunsAndHasCheckBlocks(it, s.name, s.code, s.specs, s.options);
  });
});
