# js-numbers on native BigInt: report

Author: Claude (agent), 2026-09-23. Everything in this file is agent-written.
Branch `jsnums-native-bigint` (worktree `~/work/jsnums-bigint`), stacked on
`jsnums-hardening-rebased`. Nothing was pushed.

## Summary

- Replacing jsbn with a thin wrapper around native `BigInt` passes the whole
  oracle suite on the first run: 59/59 case files and 6/6 applicable policy
  checks. The two checks that are about jsbn digit sizes are skipped.
  `make pyret-test` also passes, 12,236 of 12,236.
- On the frozen oracle cases, every result from the BigInt build matches the
  jsbn build. Every benchmark result also matches between the two libraries.
- Bignum work gets 3x to 230x faster. Workloads that never leave fixnums,
  small rationals or roughnums show no difference beyond the noise (about
  ±8%; see the A/A control below).
- `js-numbers.js` shrinks from 4,501 lines (144 KB) to 3,360 lines (109 KB).
- Recommendation: worth doing if every target browser has BigInt (see "Risks").

## Why this base branch

drydock's `js-numbers.js` fails 111 of 177 runner groups (report section 6 of
`JSNUMS_ORACLE_REPORT.md`). `jsnums-hardening-rebased` passes all of them.
Building on it means any failure after the swap comes from the swap itself.

## Commits

1. `js-numbers: back BigInteger with native BigInt instead of jsbn`.
   - `BigInteger` becomes `function BigInteger(v) { this.v = v; }`, where `v`
     is a native bigint.
   - Its methods cover the jsbn subset the library actually uses: add,
     subtract, multiply, remainder, divideAndRemainder, mod, negate, abs,
     compareTo, equals, signum, bitLength, shiftLeft, shiftRight, testBit,
     gcd, pow and toString.
   - jsbn's `divide` is replaced by Pyret's own version, as it was before.
   - The class identity (`instanceof BigInteger`), the prototype methods for
     the numeric tower and `Numbers.BigInteger` are unchanged.
   - Removed: the whole jsbn copy (about 1,270 lines), its choice of digit size
     based on `navigator`, and the `NullExp` and `nbi` entries in `_innards`.
   - `normalizeInteger` compares against `BigInt(±9e15)`.
   - `new BigInteger(str, radix)` becomes `parseBigInteger`, which handles
     radixes 2, 8, 10 and 16 through `BigInt('0x…')`-style prefixes.
   - A `RangeError` from V8's BigInt size limit in multiply, shift or pow
     becomes a `domain-error` saying "… too large". jsbn would instead keep
     running until it ran out of memory.
   - Test harness: `runner.test.js` runs a single configuration labelled
     "native BigInt" when the library has no `prototype.DB`. `policy.test.js`
     skips the two jsbn digit-configuration checks in that case.
2. `js-numbers: makeBignum converts integer JS numbers directly`. The call now
   does `BigInt(n)` instead of a string round trip through two regexes. This
   speeds up the fixnum-overflow path about 20x (1.6x → 33x against jsbn).
3. `js-numbers: Lehmer gcd for BigInteger`. The profile of rational arithmetic
   showed 91% of time in `bnGCD` when it was plain Euclid on BigInt, because
   each step allocates. Lehmer's algorithm (Knuth 4.5.2 L) runs on 48-bit
   leading parts held in doubles. It improves harmonic sums from 2.0x to 4.7x,
   the e series from 2.9x to 5.9x, and Newton sqrt(2) from 1.3x to 5.3x.

There are two prose comments in the system diff that need review: the one-line
description of `BigInteger` and the Knuth citation on `bnGCD`.

## Validation

| check | result |
|---|---|
| `make jsnums-test` (21,915 frozen cases, 1 config) | 65 pass, 2 skipped (digit-config checks), 0 fail; 3.9 s (jsbn: 185/185 over 3 configs, 16.3 s) |
| max ulp error per op | identical to jsbn (atan=1 atan2=1 cos=1 exp=1 expt=2 log=1 sin=1 tan=1) |
| `make pyret-test` on a phaseA build | 12,236 passed |
| Lehmer gcd fuzz (`jsnums-bigint-bench/fuzzgcd.js`) | 22,562 pairs up to 3,000 bits, including Fibonacci pairs (Euclid's worst case), powers of 2, 2^k-1, equal, zero, negative, and shared-factor inputs. 0 mismatches on the bignum path. |
| hex/octal/binary `fromSchemeString` | spot-checked by hand against jsbn, all equal |

The fuzz found 2 mismatches, both on the *fixnum* path of `_integerGcd`, which
returns a signed gcd for negative inputs (e.g. `_integerGcd(-1, 0) = -1`). jsbn
returns the same values, so this behavior predates the branch. No caller
reaches it: `lcm` and `Rational.makeInstance` both pass absolute values.

### Mutation check of the new code

I made 10 hand-written mutants of the new BigInt code and ran the suite on
each. Six were caught: off-by-one in bitLength, the fixnum bound in
normalizeInteger, remainder computed as mod, floor division, inverted testBit,
and compareTo treating equal as greater. Four survived:

- mod with the sign fix-up removed: equivalent, because `modulo` fixes signs
  afterwards and `gcd` passes absolute values.
- gcd without abs: equivalent, since every caller passes absolute values.
- pow guard `e < 1` changed to `e < 0`: equivalent, because `x ** 0n` is 1.
- the hex radix prefix dropped: **a real coverage gap**. No case in the suite
  reaches `fromSchemeString`, and nothing in the runtime calls it (only a type
  declaration in `ts-compiler/src/interop/js-numbers.ts`). I checked it by hand
  (see above) but did not add cases.

## Performance

Setup: Node 24.20, 2-vCPU exe.dev VM. Each workload runs in a fresh process per
library. It warms up for at least 300 ms, then takes 7 samples of at least
150 ms each; the table shows the median. The time for the library under test is
ms per iteration of the workload. **jsbn** means `jsnums-hardening-rebased`;
**BigInt** means this branch.

**Noise:** an A/A control (jsbn against a byte-identical copy of jsbn, 10
alternating processes each) gave ratios of 1.08 and 0.98. Any ratio within
about ±10% is noise.

### Library level (`jsnums-bigint-bench/run.js`)

| workload | jsbn ms | BigInt ms | speedup |
|---|---:|---:|---:|
| fixnum add loop (1e6 adds) | 4.20 | 4.63 | 0.91x (noise) |
| fixnum mul/quotient/modulo mix (3e5) | 1.12 | 1.12 | 1.01x |
| small rationals: sum 1/10 x 1e5 | 19.15 | 18.51 | 1.03x |
| roughnum arithmetic (1e6) | 17.30 | 16.46 | 1.05x |
| 20-digit add loop (1e5) | 19.92 | 6.03 | 3.3x |
| 20-digit multiply+quotient (1e5) | 194.24 | 26.86 | 7.2x |
| 20-digit compare (1e5) | 3.03 | 3.51 | 0.86x (noise; 1.03x and 0.99x in other runs) |
| fixnum*fixnum overflow to bignum (1e5) | 178.26 | 5.36 | 33x |
| factorial 1000 | 2.18 | 0.26 | 8.3x |
| factorial 5000 | 206.72 | 4.15 | 50x |
| fibonacci 10000 (adds) | 17.27 | 1.28 | 13.5x |
| expt 3^100000 | 100.30 | 1.18 | 85x |
| expt (7/3)^2000 | 3.81 | 0.43 | 8.8x |
| toString of 5000! | 277.46 | 1.21 | 228x |
| fromString 10000 digits | 202.08 | 178.53 | 1.13x (see regex finding below) |
| quotient/modulo 2000-digit by 1000-digit (200x) | 23.48 | 2.96 | 7.9x |
| gcd of fib(5000), fib(4000) | 0.072 | 0.0057 | 12.6x |
| integerSqrt of 10^2000+1 | 50.20 | 3.83 | 13.1x |
| toFixnum of 1000-digit rational (1000x) | 13.53 | 2.37 | 5.7x |
| harmonic sum H(2000) | 563.13 | 119.92 | 4.7x |
| exact e series to 300 terms | 110.95 | 18.79 | 5.9x |
| Newton sqrt(2) exact, 12 steps | 7.70 | 1.46 | 5.3x |
| toStringDigits of H(300) to 500 digits | 266.70 | 8.06 | 33x |

I also ran the fixnum add, fixnum mix, roughnum, small rationals and 20-digit
compare workloads 10 times per library in alternating processes
(`jsnums-bigint-bench/ab.js`). The medians ranged from 0.92x to 1.22x, inside
the A/A spread.

### Pyret program level (`jsnums-bigint-bench/pyret/`)

I compiled each program with each worktree's phaseA build, so each `.jarr`
embeds that build's `js-numbers.js`. The table shows the median wall time of 5
alternating runs, including about 0.35 s of runtime startup.

| program | jsbn s | BigInt s | ratio |
|---|---:|---:|---:|
| empty (startup only) | 0.35 | 0.38 | 0.91 (noise) |
| fixloop: 3e6 fixnum multiply/modulo, tail recursion | 1.34 | 1.22 | 1.10 |
| rough: 1e6 roughnum adds | 1.44 | 1.48 | 0.97 |
| decimals: 3e5 adds of 0.1 | 0.76 | 0.80 | 0.95 |
| mid: 3e5 adds of a 20-digit number | 0.73 | 0.65 | 1.12 |
| fact: 3000! ten times | 1.02 | 0.46 | 2.2 |
| fib: fib(20000) five times | 1.15 | 0.61 | 1.9 |
| bigpow: num-expt(3, 200000) + num-to-string | 9.71 | 0.34 | 28.6 |
| harmonic: H(1500) | 0.68 | 0.42 | 1.6 |
| compound: 1000 * 1.05^600, exact | 0.47 | 0.35 | 1.3 |

At the Pyret level, the interpreter's own per-operation overhead hides much of
the library's speedup for mid-size numbers (the "mid" program). The difference
shows up once numbers are large or get printed.

## Findings that are not about BigInt

1. **`scientificPattern` backtracks quadratically.** The regex is
   `^([+-]?\d*\.?\d*)[Ee]([+]?\d+)$`. On a 10,000-digit integer string with no
   exponent, one `match` takes about 117 ms, and `makeBignum` runs it twice
   (directly and again in `expandExponent`). This dominates `fromString` in
   both libraries: 178 ms for 10k digits, against 0.18 ms for `BigInt(s)`
   itself. Because the cost is quadratic, a 100k-digit literal would take about
   10 s. A fix is to check `/[eE]/` before running the regex, or to make it
   unambiguous, e.g. `^([+-]?\d*(?:\.\d*)?)[Ee]…`, which still needs
   measuring. I have not changed it.
2. The signed result of `_integerGcd` on the fixnum path (see Validation) is
   harmless today, but it is a trap for future callers.

## Risks and open decisions

- **Browser support.** BigInt needs Chrome 67, Firefox 68, Safari 14 or later.
  The code avoids `0n` literals and uses `BigInt(…)` calls, so older parsers
  still load the file. It does use the `**` operator (ES2016). phaseA builds
  and runs under Node 24. I did not check the CPO/browser bundles or the
  Safari tests.
- **Loss of digit configurations.** The suite ran 3 jsbn digit sizes chosen
  from `navigator.appName`. With BigInt there is one code path, so the
  26-bit and 30-bit configurations are no longer covered, and there is no
  longer a need to cover them.
- **Error on huge results.** V8 caps BigInt at 2^30 bits. Beyond that, the
  operation now gives `domain-error: … too large` quickly, where jsbn would
  keep allocating. The `expt` guard (exponent > 2^32-1) and its message are
  unchanged, and the policy check for it passes.
- **Not tried:** storing raw `bigint` primitives instead of wrapping them.
  That would save one allocation per operation. The 20-digit rows (3x to 7x)
  are the ones where wrapper overhead matters most. But it would need every
  `x.method()` dispatch on boxnums to change, which is a much larger diff.
- **`_innards.NullExp` and `_innards.nbi` are gone.** Nothing in `lang/src` or
  the tests used them.

## Reproduce

```
cd ~/work/jsnums-bigint/lang && make jsnums-test
node ../jsnums-bigint-bench/run.js              # library level; paths inside are absolute to this box
node ../jsnums-bigint-bench/ab.js "fixnum add" 10
node ../jsnums-bigint-bench/fuzzgcd.js
# Pyret level: needs lang/node_modules (a symlink to ~/work/pyret-lang/lang/node_modules),
# make phaseA in both worktrees, compile the .arr files with each build's
# pyret.jarr into <dir>/rebased and <dir>/bigint, then
NODE_PATH=~/work/pyret-lang/lang/node_modules node jsnums-bigint-bench/pyret/time.js
```

The bench scripts sit in `jsnums-bigint-bench/`, apart from the system, so they
are easy to drop before any merge.
