// To test: Build Pyret, then cd to this directory, and type
// node jsnums-test.js

var Jasmine = require('jasmine');
var jazz = new Jasmine();
const R = require("requirejs");
var build = process.env["PHASE"] || "build/phaseA";
R.config({
  waitSeconds: 15000,
  paths: {
    "pyret-base": "../../" + build
  }
});
R(["pyret-base/js/js-numbers"], function(JNlib) {
  var sampleErrbacks = {
    throwDomainError: function() { throw 'domainError'; },
    throwLogNonPositive: function() { throw 'logNonPositive'; },
  };
  // Build a library instance whose prototype methods close over the
  // throwing errbacks, so that expt/log/asin/acos report via this test's
  // sentinel strings rather than the module's default INITIAL_ERRBACKS.
  var JN = JNlib.MakeNumberLibrary(sampleErrbacks);
  describe("check exceptions in js-numbers methods that can't be tested in Pyret", function() {
    it("bnpExp", function() {
      // BigInteger.*.expt calls bnPow, which calls bnpExp
      // shd raise exc for too-large
      expect(function() { JN.makeBignum(2).expt(JN.makeBignum(0xffffffff + 1)); }).toThrow('domainError');

      // BigInteger.*.log
      // should raise exception for arg <= 0
      expect(function() { JN.makeBignum(-1).log(); }).toThrow('logNonPositive');

      // BigInteger.*asin
      // should raise exception for arg ∉ [-1, +1]
      expect(function() { JN.makeBignum(-1.5).asin(); }).toThrow('domainError');
      expect(function() { JN.makeBignum(+1.5).asin(); }).toThrow('domainError');

      // BigInteger.*acos
      // should raise exception for arg ∉ [-1, +1]
      expect(function() { JN.makeBignum(-1.5).acos(); }).toThrow('domainError');
      expect(function() { JN.makeBignum(+1.5).acos(); }).toThrow('domainError');

    });

    it("BigInteger uses a canonical representation (toEqual works)", function() {
      // BigIntegers are stored as variable-length digit arrays. Operations
      // that produce a result with fewer significant words than the
      // operands historically left "phantom" enumerable slots beyond the
      // canonical word count `t`, so jasmine's `toEqual` (deep structural
      // compare) would distinguish two BigIntegers that JN.equals says
      // are the same number. bnpClamp() normalizes by deleting those
      // slots so structural equality matches numeric equality.

      // Same number via different parse paths should be structurally equal.
      expect(JN.fromString("1e5")).toEqual(JN.makeBignum("1e5"));
      expect(JN.fromString("1e30")).toEqual(JN.makeBignum("1e30"));
      expect(JN.fromString("1e140")).toEqual(JN.makeBignum("1e140"));
      expect(JN.fromString("1e309")).toEqual(JN.makeBignum("1e309"));

      // Different surface forms of the same number should also be equal.
      expect(JN.makeBignum("1e1")).toEqual(JN.makeBignum("10"));
      expect(JN.makeBignum("1e3")).toEqual(JN.makeBignum("1000"));
    });
  });

  jazz.execute();

});
