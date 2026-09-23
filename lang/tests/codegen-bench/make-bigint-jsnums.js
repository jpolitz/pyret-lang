#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const LANG = path.resolve(__dirname, "../..");
const SRC = path.join(LANG, "src/js/base/js-numbers.js");
const MARKER = "    // END OF copy-and-paste of jsbn.\n";

const OVERRIDE = `
    function bi$mk(v) { var r = new BigInteger(null); r.v = v; return r; }
    function bi$of(x) {
      if (typeof x === "number") { return BigInt(x); }
      if (typeof x === "bigint") { return x; }
      return x.v;
    }
    function bi$abs(v) { return v < 0n ? -v : v; }
    function bi$parse(s, b) {
      if (b == null) { b = 10; }
      if (b === 10 && /^-?[0-9]+$/.test(s)) { return BigInt(s); }
      var neg = false, acc = 0n, rb = BigInt(b);
      for (var i = 0; i < s.length; i++) {
        var d = parseInt(s[i], b);
        if (isNaN(d)) {
          if (s[i] === "-" && acc === 0n) { neg = true; }
          continue;
        }
        acc = acc * rb + BigInt(d);
      }
      return neg ? -acc : acc;
    }
    bnpFromString = function(s, b) { this.v = bi$parse(String(s), b); };
    bnpFromInt = function(x) { this.v = BigInt(x); };
    bnpFromNumber = function() { throw new Error("bigint jsnums: fromNumber unsupported"); };
    bnToString = function(b) { return this.v.toString(b || 10); };
    bnNegate = function() { return bi$mk(-this.v); };
    bnAbs = function() { return this.v < 0n ? bi$mk(-this.v) : this; };
    bnCompareTo = function(a) { var x = this.v, y = bi$of(a); return x < y ? -1 : (x > y ? 1 : 0); };
    bnBitLength = function() { var v = this.v < 0n ? ~this.v : this.v; return v === 0n ? 0 : v.toString(2).length; };
    bnMod = function(a) { var m = bi$of(a), r = this.v % m; if (r < 0n) { r += bi$abs(m); } return bi$mk(r); };
    bnClone = function() { return bi$mk(this.v); };
    bnIntValue = function() { return Number(BigInt.asIntN(32, this.v)); };
    bnSigNum = function() { return this.v < 0n ? -1 : (this.v > 0n ? 1 : 0); };
    bnEquals = function(a) { return this.v === bi$of(a); };
    bnMin = function(a) { return this.v < bi$of(a) ? this : a; };
    bnMax = function(a) { return this.v > bi$of(a) ? this : a; };
    bnShiftLeft = function(n) { return bi$mk(n < 0 ? this.v >> BigInt(-n) : this.v << BigInt(n)); };
    bnShiftRight = function(n) { return bi$mk(n < 0 ? this.v << BigInt(-n) : this.v >> BigInt(n)); };
    bnAdd = function(a) { return bi$mk(this.v + bi$of(a)); };
    bnSubtract = function(a) { return bi$mk(this.v - bi$of(a)); };
    bnMultiply = function(a) { return bi$mk(this.v * bi$of(a)); };
    bnDivide = function(a) { return bi$mk(this.v / bi$of(a)); };
    bnRemainder = function(a) { return bi$mk(this.v % bi$of(a)); };
    bnDivideAndRemainder = function(a) { var y = bi$of(a); return [bi$mk(this.v / y), bi$mk(this.v % y)]; };
    bnPow = function(e) {
      if (greaterThan(e, 0xffffffff)) {
        errbacks.throwDomainError('expt: exponent ' + e + ' too large');
      }
      if (lessThan(e, 1)) {
        return BigInteger.ONE;
      }
      return bi$mk(this.v ** BigInt(typeof e === "number" ? e : String(e)));
    };
    bnGCD = function(a) {
      var x = bi$abs(this.v), y = bi$abs(bi$of(a));
      while (y !== 0n) { var t = x % y; x = y; y = t; }
      return bi$mk(x);
    };
    bnpIsEven = function() { return (this.v & 1n) === 0n; };
    bnTestBit = function(n) { return ((this.v >> BigInt(n)) & 1n) !== 0n; };
    bnGetLowestSetBit = function() {
      if (this.v === 0n) { return -1; }
      var v = bi$abs(this.v), i = 0;
      while ((v & 1n) === 0n) { v >>= 1n; i++; }
      return i;
    };
    bnAnd = function(a) { return bi$mk(this.v & bi$of(a)); };
    bnOr = function(a) { return bi$mk(this.v | bi$of(a)); };
    bnXor = function(a) { return bi$mk(this.v ^ bi$of(a)); };
    bnNot = function() { return bi$mk(~this.v); };
    bnAndNot = function(a) { return bi$mk(this.v & ~bi$of(a)); };

    BigInteger.prototype.fromString = bnpFromString;
    BigInteger.prototype.fromInt = bnpFromInt;
    BigInteger.prototype.fromNumber = bnpFromNumber;
    BigInteger.prototype.toString = bnToString;
    BigInteger.prototype.negate = bnNegate;
    BigInteger.prototype.abs = bnAbs;
    BigInteger.prototype.compareTo = bnCompareTo;
    BigInteger.prototype.bitLength = bnBitLength;
    BigInteger.prototype.mod = bnMod;
    BigInteger.prototype.clone = bnClone;
    BigInteger.prototype.intValue = bnIntValue;
    BigInteger.prototype.signum = bnSigNum;
    BigInteger.prototype.equals = bnEquals;
    BigInteger.prototype.min = bnMin;
    BigInteger.prototype.max = bnMax;
    BigInteger.prototype.shiftLeft = bnShiftLeft;
    BigInteger.prototype.shiftRight = bnShiftRight;
    BigInteger.prototype.add = bnAdd;
    BigInteger.prototype.subtract = bnSubtract;
    BigInteger.prototype.multiply = bnMultiply;
    BigInteger.prototype.divide = bnDivide;
    BigInteger.prototype.remainder = bnRemainder;
    BigInteger.prototype.divideAndRemainder = bnDivideAndRemainder;
    BigInteger.prototype.pow = bnPow;
    BigInteger.prototype.gcd = bnGCD;
    BigInteger.prototype.isEven = bnpIsEven;
    BigInteger.prototype.testBit = bnTestBit;
    BigInteger.prototype.getLowestSetBit = bnGetLowestSetBit;
    BigInteger.prototype.and = bnAnd;
    BigInteger.prototype.or = bnOr;
    BigInteger.prototype.xor = bnXor;
    BigInteger.prototype.not = bnNot;
    BigInteger.prototype.andNot = bnAndNot;
    ["modPow", "modPowInt", "modInverse", "isProbablePrime", "toByteArray", "byteValue", "shortValue",
     "bitCount", "setBit", "clearBit", "flipBit"].forEach(function(m) {
      BigInteger.prototype[m] = function() { throw new Error("bigint jsnums: " + m + " unsupported"); };
    });
    BigInteger.ZERO = nbv(0);
    BigInteger.ONE = nbv(1);
`;

function generate(out) {
  const src = fs.readFileSync(SRC, "utf8");
  if (src.split(MARKER).length !== 2) { throw new Error("marker not found exactly once in " + SRC); }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, src.replace(MARKER, () => MARKER + OVERRIDE));
  return out;
}

module.exports = { generate };

if (require.main === module) {
  console.log(generate(path.resolve(process.argv[2] || path.join(LANG, "build/codegen-bench/js-numbers-bigint.js"))));
}
