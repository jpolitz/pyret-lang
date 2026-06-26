/*
 * Embedded-instance version of code.pyret.org/test/type-check.js.
 * Same assertion (tester.testRunAndUseRepl with {typeCheck:true}) and the same
 * REPL specs, run inside an embedded instance. Exercises type-checked runs and
 * the interactions REPL inside the embed iframe.
 */
var embed = require("./embed-setup");
var tester = embed.tester;
var loadSpecsFromFile = require("../shared/load-cpo-specs").loadSpecsFromFile;

describe("Embedded instance — type-check mode REPL (test/type-check.js specs)", function () {
  before(embed.setupEmbedSingle());
  after(embed.teardown);

  loadSpecsFromFile("type-check.js").forEach(function (s) {
    tester.testRunAndUseRepl(it, s.name, s.code, s.repl, s.options);
  });
});
