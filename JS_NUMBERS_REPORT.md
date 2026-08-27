# js-numbers hardening report

Authored by Claude (agent), branch `js-numbers-hardening`. All prose in this
file is agent-written.

## Scope

Goal: make `lang/src/js/base/js-numbers.js` rock solid, with a pure-JS test
suite that does not touch the Pyret runtime. Design intent (from the task):
pyretnums are exactly small safe integers (unboxed JS integer doubles),
bignums (`BigInteger`), exact rationals (`Rational`), and roughnums
(`Roughnum`). Fixnums (arbitrary JS doubles) are an *output* representation
produced by `toFixnum` only, never a pyretnum representation. No complex
numbers.

Deliverables:

- `lang/src/js/base/js-numbers.js` — fixes, all confined to this file
  (plus a two-line Makefile target update, flagged below).
- `lang/tests/jsnums-test/*.test.js` + `helpers.js` — new suite:
  119 tests (deterministic + seeded property tests), zero dependencies,
  runs with `node --test` against the *source* file directly (no Pyret
  build needed). `make jsnums-test` runs it.
- The old jasmine/requirejs `jsnums-test.js` (which required a completed
  `phaseA` build) was removed; its assertions were migrated into
  `errors.test.js` (errbacks cases) and `roughnum.test.js`/`basics` (atan2,
  BigInteger canonicity).

## Bugs found and fixed

Ordered roughly by severity. "Oracle" below means Node's native `BigInt`
used from the tests to compute exact expected values.

### 1. BigInteger division: wrong quotient/remainder (jsbn estimator)

`bnpDivRemTo`'s floating-point quotient-digit estimate can come out one too
LOW; the algorithm only corrects overestimates. Result: e.g.
`33911095126815243304 / 2129087680346` returned quotient `15927523` with
remainder equal to the divisor (exact answer: `15927524` rem `0`). This
corrupted rational arithmetic (`(a/b)*b !== a`), `quotient`, `remainder`,
`gcd`-reduced constructions, etc.

Two-layer cause:

- Node ≥ 21 defines a global `navigator` without a string `appName`, so
  jsbn's 2005-era browser sniffing started selecting the `am1`/26-bit digit
  configuration under Node (historically Node and every modern browser used
  `am3`/28-bit). With 26-bit digits, `F2 = 2*26-52 = 0`, and the estimate's
  slack term `e = 1<<F2` is too small to absorb float rounding — the
  latent underestimate becomes reachable.
- The underestimate is a latent jsbn bug in any configuration; nothing
  downstream checked `remainder < divisor`.

Fixes: (a) the am-selection now requires a genuine string
`navigator.appName`, defaulting to `am3`/28 (restores the battle-tested
configuration under Node); (b) `bnpDivRemTo` now does an exact final
repair: while the pending remainder ≥ the (shifted) divisor, subtract and
bump the quotient. Cost measured as noise. `bigint-config.test.js` runs the
regression case and randomized division/multiplication oracles under all
three configurations (am1/am2/am3) by injecting fake `navigator` objects.

### 2. `toFixnum` off by 1 ulp (~20% of doubles)

`_integerDivideToFixnum` / `BigInteger.toFixnum` went through
`splitIntIntoMantissaExpt` — splicing decimal mantissa and exponent strings
— which double-rounds. `toFixnum(fromFixnum(x)) === x` failed for ~20% of
random doubles.

Fix: new `bigIntegerQuotientToDouble(n, d)` computes the correctly-rounded
(round-half-even) double of `n/d` using only jsbn integer ops: scale so the
quotient has 55–56 bits, divide with remainder, round to the available
significand width (53 bits for normals, fewer for subnormals) using the
remainder as sticky bit, then scale by the power of two.

Correctness notes recorded here since the code comment just points at this
report:

- After rounding, `q2 ≤ 2^keep ≤ 2^53`, so `Number(q2.toString())` is
  exact, and a carry to exactly `2^keep` needs no renormalization: the
  scaling step yields `2^(e2+1)` (or `Infinity` at the top of the range),
  which is what round-to-nearest requires.
- The scaling loops (`res *= 2` / `res *= 0.5`) are exact at every step:
  going down, each intermediate `mag·2^-j` has its lowest set bit
  ≥ `lowbit(final) ≥ 2^-1074`; going up, intermediates are bounded by the
  final value (or saturate at `Infinity`, which is the correct result).

The tests validate this against an independently implemented BigInt oracle
(`qToNearestDouble` in `helpers.js`), and the oracle itself is validated
bit-exactly: decompose random doubles via `DataView` into exact rationals
and require the oracle to invert the decomposition, including explicit
half-ulp midpoint (ties-to-even) and boundary cases (`MAX_VALUE` + half
ulp → `Infinity`, half of `MIN_VALUE` → 0, subnormals).

`toFixnum(fromFixnum(x)) === x` now holds for all finite doubles tested
(5000 random spanning the full exponent range, plus specials).

### 3. `modulo(fixnum, bignum)` performed string concatenation

`modulo`'s fast path triggered on `typeof m === 'number'` alone; with a
BigInteger divisor, `result + n` concatenated strings, e.g.
`modulo(69735, -411299629828477929)` returned the *string*
`"69735-411299629828477929"`. Fixed by requiring both args to be fixnums.

### 4. `bnMod` with negative modulus

`modulo(negative bignum, -4)` returned `-7` (out of range): `bnMod`
subtracted the remainder from the *signed* modulus. `bnMod` now yields a
value in `[0, |a|)`; `modulo`'s sign adjustment then produces
divisor-signed results, verified against a floored-mod oracle.

### 5. `quotient`/`remainder` by zero returned NaN or garbage

`quotient(1, 0)` → `NaN`; `quotient(bignum, 0)` → BigInteger `0`. Both now
throw `throwDivByZero` (matching `divide`/`modulo`). `remainder` also
rejects roughnum zero divisors.

### 6. `equalsAnyZero` missed BigInteger zero → `0/0` Rational

BigInteger zeros arise from e.g. `subtract(1e20, 1e20)`.
`equalsAnyZero(bigzero)` returned `false` (it called
`bnEquals(0)` with a raw JS number, which compared garbage), so
`divide(5, bigzero)` built a literal `0/0` Rational instead of erroring.
Fixed with a proper per-representation check.

### 7. `fromString("1/0")` built a `1/0` Rational

`Rational.makeInstance(n, 0)` silently constructed a poisoned value that
flowed through arithmetic. Now: `makeRational(n, 0)` throws div-by-zero;
`fromString("1/0")` (and `"~1/0"`) returns `false` — important because
Pyret's `string-to-number` uses `fromString`'s `false` for its `none`
result, so parsing must not throw.

### 8. Small-integer canonicalization

Bignum-path results with small values stayed `BigInteger` (e.g.
`fromString("2.0")`, `subtract(1e20, 1e20)`, `gcd` results, rational
components after reduction). The docs say fixnums are preferred whenever
possible. Added `normalizeInteger` applied centrally in
`makeNumericBinop`/`makeIntegerBinop`/`makeIntegerUnOp` result paths and to
`Rational.makeInstance` components, with an O(1) word-count gate and a
direct word-sum conversion so benchmarks match the old code (see
Performance). Property test asserts results are canonical: fixnums are
in-range integers, BigIntegers are only used beyond ±9e15, rationals are
reduced with positive denominators and canonical components.

### 9. `integerSqrt`/`sqrt` fixnum precision

`Math.floor(Math.sqrt(k²−1))` returns `k` for large `k` (e.g.
`k = 94868329`), so `integerSqrt(k²−1)` was off by one and `sqrt(k²−1)`
returned exact `k` for a non-square. `integerSqrt` now adjusts exactly
(the adjustment arithmetic stays < 2^53 so it is exact); `sqrt` only
claims exactness when `result*result === n`.

### 10. `sqrt` of huge non-square bignum returned a false-exact integer

`sqrt(10^620 + 1)` returned the exact integer `10^310` (an exact answer
for a non-square). Since the roughnum result overflows doubles, it now
throws the roughnum overflow error (consistent with `~1e400` handling).
`sqrt(10^620)` still returns the exact root.

### 11. `Rational.sqrt` accuracy

Was computed as `sqrt(n)/sqrt(d)` (two extra roundings; `sqrt(2/3)` was 1
ulp off). Now: exact perfect-square detection via `integerSqrt` (no float
comparisons), otherwise `Math.sqrt(toFixnum(q))` (correctly-rounded input,
correctly-rounded sqrt), with the componentwise fallback kept for
magnitudes beyond double range.

### 12. `Roughnum.roundEven` sign bug

`roundEven(~-2.5)` returned `+2` — the negation was never applied back.

### 13. Roughnum `floor`/`ceiling`/`round`/`roundEven` beyond ±9e15

Returned raw doubles like `1e300` as "fixnums", violating the fixnum
range invariant. Out-of-range results now route through `toRational` and
return exact integers (BigIntegers).

### 14. Roughnum `numerator`/`denominator` garbage for e-notation doubles

The old string-hacking produced `numerator(~1.5e-7) = ~0`,
`denominator(~1.5e-7) = ~2000`. Now computed via `toRational` (→ `~3`,
`~20000000`). A denominator that overflows doubles (e.g. for `~5e-324`)
now errors instead of returning garbage.

### 15. `eqv` threw on roughnum pairs

`eqv(~1, ~1)` hit `Roughnum.equals`'s incomparable-values error. `eqv` is
the total "same number, same exactness" predicate; two roughnums now
compare by their doubles. `equals` still throws incomparable-values for
roughnums (Pyret's `==` semantics), unchanged.

### 16. `expt` fixes

- Fixnum path used `Math.pow`, which is not guaranteed exact for integer
  args across engines. Replaced with square-and-multiply in exact double
  integer arithmetic (all intermediates provably exact below the overflow
  bound), bailing to bignums on overflow. Verified against BigInt oracle
  including bases near the overflow roots.
- `expt(0, ~0)` returned `0`; now `~1` (consistent with
  `Math.pow(0,0) = 1` and the boxed path's `x^~0 = ~1`).
- `expt(-2, ~0.5)` threw a misleading "roughnum overflow error" (from
  `Roughnum.makeInstance(NaN)`); now a domain error about non-integral
  powers of negative numbers, raised in `Roughnum.expt` itself.
  (`Roughnum.makeInstance(NaN)` keeps the historical "roughnum overflow
  error" message: `tests/pyret/tests/test-numbers.arr` asserts that
  `num-sin(very-bignum)` raises "roughnum overflow", and that path reaches
  `makeInstance` with `Math.sin(Infinity) = NaN`. A first draft with a
  NaN-specific message failed exactly those three Pyret checks.)

### 17. `lcm` returned negative results

`lcm(7160948, -61563685217994868099800)` was negative (the fixnum-path
sign accident didn't extend to bignums). `lcm` now takes `abs` of both
arguments; results verified nonnegative against the oracle.

### 18. Missing module exports (runtime-visible regression)

The outer errbacks-wrapping export list omitted `makeRational`,
`makeRoughnum`, `MIN_FIXNUM`, `MAX_FIXNUM`, `BigInteger`, `Rational`,
`Roughnum`, `_innards`. `src/js/trove/image-lib.js` calls
`jsnums.makeRoughnum(...)`, which would have been `undefined` at runtime.
All restored.

### 19. `fromFixnum(NaN/Infinity)` returned `false`

The runtime's `makeNumber` feeds arbitrary JS doubles here; a `false`
"number" would corrupt silently. Now throws a domain error.

### 20. `makeBignum` accepted garbage

`makeBignum("abc")` → `1122`, `"1.5"` → `15`, `" 5"` → `5`. Now validates
an (optionally exponent-expanded) integer string and throws a domain error
otherwise.

### 21. `fromSchemeString` fixes (legacy WeScheme surface; unused by runtime.js)

- `'-0.0'` (and previously `±inf.0`, `±nan.0`) returned
  `Roughnum(Infinity)`, i.e. threw "roughnum overflow error". `-0.0` now
  parses as `~-0`; the inf/nan forms throw a clear domain error.
- Overflowing integers in non-decimal radices were re-parsed as base 10
  (`#x` + 20 f's produced nonsense); now parsed with the right radix, and
  inexactness (`#i`) is honored for overflowed integers.
- `#i1/2` built a Rational out of Roughnums; rational parts are now parsed
  exactly and the exactness applied to the whole ratio (`#i1/2` → `~0.5`).
- Zero-denominator rationals: `"1/0"` → `false`; `"#e1/0"` (must-be-number
  form) throws div-by-zero.
- Several error paths referenced undefined variables (`r`, `this` in
  strict mode) and would have thrown `ReferenceError`s; the complex-number
  rejection threw a bare string. All now use errbacks.

### 22. `toStringDigits` with digit counts past ~500 spliced literal "..."

After rounding, the value's decimal expansion always terminates within
`digits` places, but `toRepeatingDecimal`'s default 512-step exploration
limit could cut it off first, and the cutoff marker `"..."` was then
appended into the numeric output (`toStringDigits(1/1867, 600)` ended in
dots). The limit now scales with the requested digit count. Verified
against a BigInt long-division oracle. (An `expt` guard was also added so
a rational base with an integer exponent above 2^32 raises the same
"exponent too large" domain error the BigInteger path already had,
instead of attempting an astronomically large exact power.)

### 23. Misc latent fixes

- `bnpFromInt` referenced the global `DV` (strict-mode `ReferenceError` on
  a dead-but-reachable-by-refactoring path); now `this.DV`.
- `isOverflow(NaN)` was `false` (NaN could masquerade as a fixnum); now
  any non-finite is "overflow".
- `divide(~0, x)` returned exact `0`; now stays `~0` (roughnum contagion;
  `divide(0, ~x)` still returns exact `0`, matching Racket).

## Semantics deliberately kept

- `equals` on roughnums throws incomparable-values (Pyret `==` semantics);
  runtime checks `isRoughnum` before calling.
- `fromFixnum`/`toRational` of a double read its *printed decimal* (e.g.
  `fromFixnum(0.1) = 1/10`), not the binary value. This makes
  `toFixnum ∘ fromFixnum = id` (now actually true, see bug 2) while keeping
  WYSIWYG conversions.
- `num-floor`-style ops on roughnums return exact integers (runtime relies
  on this); `isInteger(~2) === false`; `multiply(0, ~x) = 0` exact.
- `fromString` accepts only Pyret number syntax (no `.5`, `5.`, `1/-2`).
- `atan2` returns angles in `[0, 2π)` and errors on `(0, 0)`.
- `toFixnum` of values beyond double range returns `±Infinity` / `0`.

## Test suite

`lang/tests/jsnums-test/`, run via `make jsnums-test` or
`node --test tests/jsnums-test/*.test.js` (Node ≥ 20; no build, no deps).

- `helpers.js` — AMD-shim loader for the source file (with optional fake
  `navigator` for digit-config forcing), `Q` exact-rational BigInt oracle,
  `qToNearestDouble` reference conversion, seeded PRNG (mulberry32) so all
  property tests are deterministic, assertion helpers that check value
  *and* representation kind.
- `basics.test.js` — parsing (all syntactic forms and rejections),
  constructors, predicate matrix, conversions, string roundtrips, export
  surface.
- `arith.test.js` — arithmetic across all type pairs, overflow boundary
  exactness, contagion/identity special cases, division-by-zero matrix,
  equality/eqv semantics, comparison matrix, field laws, and oracle
  properties (1500 random rational quadruples, 2000 boundary integer ops,
  IEEE-match for roughnum ops).
- `integer.test.js` — quotient/remainder/modulo sign conventions and
  oracles, Euclidean identities, gcd/lcm oracle, integerSqrt invariant +
  adversarial near-squares, expt (integer/rational/roughnum exponents,
  exactness oracle, identities, error cases).
- `rounding.test.js` — floor/ceiling/round/roundEven across variants
  (incl. tie and sign cases and huge roughnums), rounding-relation
  properties, numerator/denominator reconstruction,
  toRepeatingDecimal (known values, cutoff, and exact reconstruction
  property), toStringDigits.
- `roughnum.test.js` — sqrt exactness rules, exp/log (incl. beyond-double
  bignum log), trig with exact special cases, asin/acos/atan2 domains,
  roughlyEquals(Rel), extreme-double construction and toRational chains.
- `errors.test.js` — per-call errbacks override/restore, sentinel-errback
  library instances (migrated legacy tests), BigInteger structural
  canonicity (migrated), the full fromSchemeString matrix, error-message
  content, no-ReferenceError guarantees.
- `properties.test.js` — oracle self-validation (bit-level, incl. midpoint
  ties), toFixnum correct rounding for 5000 random rationals/bignums,
  overflow/underflow boundaries, cross-variant string roundtrips, total
  order vs oracle, canonical-kind property, expt/log/sqrt consistency,
  argument non-mutation, telescoping/factorial chain computations.
- `bigint-config.test.js` — the division regression and randomized
  division/multiplication/gcd oracles under am1/26, am2/30, am3/28.

Setting `JSNUMS_TEST_APPNAME` (e.g. `Opera` → am1/26,
`Microsoft Internet Explorer` → am2/30) runs the *entire* suite under a
forced digit configuration; all tests pass under all three. A one-off
heavier fuzz (360k random divisions per configuration, biased toward exact
multiples and off-by-one neighbors, plus signed modulo spot checks) was run
during development with zero mismatches.

## Performance

Micro-benchmarks (this 2-CPU VM, Node 24) before vs after:

- 800! : ~8 ms → ~2 ms (division fix path unchanged; multiply unchanged)
- 2000-iteration growing-rational loop: ~1350 ms → ~1340 ms
- 300 quotients of a 2000-digit number: ~10 ms → ~16 ms (divRemTo repair
  adds one shift+compare per division)
- 2000 bignum `toFixnum` of a 30-digit number: ~18 ms

An earlier draft of `normalizeInteger` cost 1.9× on rational-heavy loops;
the committed version gates on word count in O(1) and converts small
values by direct word summation, restoring baseline.

## Flagged for human review (system-prose / interface notes)

- Makefile: `jsnums-test` target now runs the node:test suite and no
  longer depends on `phaseA` (agent-edited recipe, two lines).
- I added brief constraint comments in js-numbers.js at the genuinely
  non-obvious spots (divRemTo repair, correct-rounding scaling, navigator
  sniffing, expt exactness); wording is agent-written — trim as desired.
- `src/ts-compiler/src/interop/js-numbers.ts` declares `isSchemeNumber` in
  its interface; the library exports `isPyretNumber` (the TS facade's
  `[key: string]: any` makes this harmless, but the named entry is stale).
  Not changed (outside the library).
- The inner library still exports legacy aliases
  `Numbers['FloatPoint'] = Numbers['Complex'] = Roughnum` (marked FIXME
  upstream). Left as-is.
- `splitIntIntoMantissaExpt` is no longer used by `toFixnum` (only
  exported via `_innards`); left in place.
- Behavior changes worth knowing when reviewing Pyret-level fallout:
  `0^~0` is now `~1` (was `0`); `~0/x` is now `~0` (was `0`); huge-roughnum
  floor/ceiling/round now return exact bignums (were out-of-range raw
  doubles); `sqrt` of a huge non-square errors (was a false-exact
  integer); `fromString("1/0")` is now `false` (was a `1/0` Rational).
  `make pyret-test` (main2 suite) was run against the new library to
  check for fallout — see the result note at the end of this file.

## Validation summary

- `make jsnums-test`: 119/119 passing.
- Property tests are seeded and deterministic; they exercise roughly
  40k randomized oracle comparisons per run.
- `make pyret-test` (phaseA rebuild + main2 suite, which both compiles and
  runs on the patched library): all 12411 checks pass. A first run failed
  exactly 3 checks — the `num-sin(very-bignum) raises "roughnum overflow"`
  family — because a draft gave `Roughnum.makeInstance(NaN)` a NaN-specific
  message; the historical message was restored (see bug 16) and the rerun
  is clean.
