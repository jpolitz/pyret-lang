# Stock Pyret Runtime Behavior Reference

Source of truth: `/home/exedev/work/drydock/lang/src/js/base/runtime.js` (6558 lines) plus
`src/js/trove/ffi.js` (error constructors) and `src/js/base/js-numbers.js` (numeric tower).
Line numbers below refer to those files. Goal: enough precision to make an alternative
runtime byte-identical in messages and reprs.

---

## 0. Common machinery (read this first)

### 0.1 Arity guards

Nearly every builtin begins with the literal pattern (all on one line in source):

```js
if (arguments.length !== N) { var $a=new Array(arguments.length); for (var $i=0;$i<arguments.length;$i++) { $a[$i]=arguments[$i]; } throw thisRuntime.ffi.throwArityErrorC(["<name>"], N, $a, false); }
```

`ffi.throwArityErrorC(funLoc, arity, args, isMethod)` (ffi.js:391) does
`makeSrcloc(funLoc)` — for a 1-element array of a string this becomes
`srcloc.builtin(name)` — and raises the Pyret error
`arity-mismatch(loc, arity, args-as-pyret-list, isMethod=false)`.
The arity check runs **before** any type checks. The `<name>` used in the arity error is
noted per function below (several are wrong/stale; they are quoted verbatim).

### 0.2 `checkArgsInternal1/2/3/Inline` — contract-style argument checks

runtime.js:2755–2871. Signature: `checkArgsInternalN(moduleName, funName, arg1, ann1, ...)`.
Each ann is a `PPrimAnn` (runtime.js:3005): `ann.check(moduleName, arg)` runs
`pred(arg)`; on failure it produces
`contract-fail(loc, reason)` raised via `raiseJSJS`, where:

- `loc` = `srcloc.builtin(moduleName)` (moduleName is a plain string like `"Strings"`,
  `"Numbers"`, `"RawArrays"`, `"Lists"`, `"Booleans"`, `"equality"`, `"runtime"`;
  `makeSrcloc` on a non-array stringifies it into a builtin srcloc).
- `reason` = `failure-at-arg(loc, index, funName, args-list, type-mismatch(val, annName))`
  with **0-based** `index`, `funName` the string noted per function, and `args-list` a
  Pyret list of **all** the arguments passed.

Checks run left to right; the first failing argument raises. This is the "contract error"
rendering path (`ffi.contractFail` / `ffi.makeFailureAtArg` / `ffi.makeTypeMismatch`),
**not** a message-exception.

Annotation names installed by `makePrimAnn` (runtime.js:6463–6483): `Number`, `Exactnum`,
`Roughnum`, `NumInteger`, `NumNatural`, `NumRational`, `NumPositive`, `NumNegative`,
`NumNonPositive`, `NumNonNegative`, `String`, `Boolean`, `RawArray`,
`Function` (predicate: `isFunction(v) || isMethod(v)`), `Method`, `Nothing`, `Object`,
`Tuple`, `Any` (always true). `List` is installed later by ffi.js:610
(`runtime.makePrimAnn("List", isList)`).

### 0.3 `makeCheckType` checks — generic type mismatches

runtime.js:1403–1431. `checkString`, `checkNumber`, `checkNumInteger`,
`checkNumNonNegative`, `checkArray` (name `"RawArray"`), `checkNatural`
(name `"Natural Number"`, runtime.js:5036), etc. On failure they call
`ffi.throwTypeMismatch(val, typeName)` (ffi.js:286) which raises
`generic-type-mismatch(val, typeName)` — a different error datatype than the
contract failure of §0.2. Functions below note which mechanism they use.
(Each `makeCheckType` closure also has its own arity guard with location `["runtime"]`.)

### 0.4 `ffi.throwMessageException(msg)`

ffi.js:255: checks `msg` is a string, raises `message-exception(msg)`. Used for ad-hoc
errors; all messages quoted verbatim below.

### 0.5 js-numbers errbacks

runtime.js:26–36: every js-numbers error (`throwDivByZero`, `throwToleranceError`,
`throwRelToleranceError`, `throwGeneralError`, `throwDomainError`, `throwSqrtNegative`,
`throwLogNonPositive`, `throwIncomparableValues`) is routed to
`ffi.throwMessageException(msg)` with the message composed **inside js-numbers**, e.g.:

- `'modulo: the second argument is zero'` (js-numbers.js:705)
- `'modulo: the first argument ' + m + " is not an integer."` / second-argument variant
- `'sqrt: negative argument ' + n` (js-numbers.js:755)
- `'log: non-positive argument ' + n` (js-numbers.js:823)
- `"/: division by zero, " + x + ' ' + y`
- `"negative tolerance " + delta` (roughlyEquals, js-numbers.js:531)
- `'negative relative tolerance ' + delta` (roughlyEqualsRel, js-numbers.js:552)
- `'acos: out of domain argument ' + n`, `'asin: out of domain argument ' + n`,
  `'atan2: out of domain argument (0, 0)'`

### 0.6 How numbers stringify inside messages

`"... " + n` and `String(n)` both invoke the Pyret number's `toString()`:
fixnums (plain JS numbers, always integer-valued) print like JS integers ("5", "-3");
BigIntegers print their digits; Rationals print `"num/den"` (e.g. `"1/2"`);
Roughnums print `"~"` + JS float formatting (e.g. `"~1.5"`). This is also exactly what
`torepr`/`tostring` do for numbers (both use `String`).

### 0.7 `MAX_ARRAY_SIZE`

runtime.js:18: `const MAX_ARRAY_SIZE = 4294967295;`

---

## 1. Strings

All are wrapped with `makeFunction(fn, "<kebab-name>")` in `runtimeNamespaceBindings`
(runtime.js:5998–6027). Pyret strings are plain JS strings; `makeString` is identity
(after a JS-level guard). All length/index semantics are **UTF-16 code unit** based
(JS `.length`, `.charAt`, `.indexOf`).

### string-contains — `string_contains` (runtime.js:4882)
1. Arity guard, name `["string-contains"]`, 2 args.
2. `checkArgsInternal2("Strings", "string-contains", l, String, r, String)`.
3. Returns `l.indexOf(r) !== -1` (JS boolean). Empty needle → `true`.

### string-append — `string_append` (4876)
1. Arity `["string-append"]`, 2.
2. `checkArgsInternal2("Strings", "string-append", l, String, r, String)`.
3. Returns `l.concat(r)`.

### string-length — `string_length` (4900)
1. Arity `["string-length"]`, 1.
2. `checkArgsInternal1("Strings", "string-length", s, String)`.
3. Returns `makeNumber(s.length)` = `jsnums.fromFixnum(s.length)` (exact integer;
   counts UTF-16 code units, so astral chars count as 2).

### string-isnumber / string-is-number — `string_isnumber` (4906)
Both exported names share one implementation; arity error name is `["string-isnumber"]`
for both.
1. Arity `["string-isnumber"]`, 1.
2. `checkArgsInternal1("Strings", "string-isnumber", s, String)`.
3. `jsnums.fromString(s)`; returns JS `true` if it parsed (`!== false`), else `false`.

### string-tonumber — `string_tonumber` (4914)
1. Arity `["string-tonumber"]`, 1.
2. `checkArgsInternal1("Strings", "string-tonumber", s, String)`.
3. `jsnums.fromString(s)`: on success returns the number; on failure returns a **fresh
   `nothing`** (`makeNothing()` — a new PNothing instance, not the singleton).

### string-to-number — `string_to_number` (4926) — separate function!
1. Arity `["string-to-number"]`, 1.
2. `checkArgsInternal1("Strings", "string-to-number", s, String)`.
3. Returns `ffi.makeSome(num)` or `ffi.makeNone()` (an `Option`).

### string-repeat — `string_repeat` (4938)
1. Arity `["string-repeat"]`, 2.
2. `checkArgsInternal2("Strings", "string-repeat", s, String, n, Number)`.
   Note: **no** integer or non-negative check.
3. Loop `for(var i = 0; i < jsnums.toFixnum(n); i++) resultStr += s;`
   Edge cases: negative n → `""`; fractional n (e.g. `5/2` → 2.5) repeats
   `ceil(2.5)=3` times (JS `<` against the float); n = 0 → `""`.

### string-substring — `string_substring` (4847)
1. Arity `["string-substring"]`, 3.
2. `checkArgsInternal3("Strings", "string-substring", s, String, min, NumInteger, max, NumInteger)`.
3. Bounds checks, **in this order**, each a `ffi.throwMessageException`:
   - `jsnums.greaterThan(min, max)` →
     `"substring: min index " + String(min) + " is greater than max index " + String(max)`
   - `jsnums.lessThan(min, 0)` →
     `"substring: min index " + String(min) + " is less than 0"`
   - `jsnums.greaterThan(max, string_length(s))` →
     `"substring: max index " + String(max) + " is larger than the string length " + String(string_length(s))`
   (Note `string_length(s)` is re-invoked, and `max == length` is allowed.)
4. Returns `s.substring(toFixnum(min), toFixnum(max))`.

### string-replace — `string_replace` (4863)
1. Arity `["string-replace"]`, 3.
2. `checkArgsInternal3("Strings", "string-replace", s, String, find, String, replace, String)`.
3. Returns `s.split(find).join(replace)` — i.e. replaces **all** (non-overlapping,
   left-to-right) occurrences; empty `find` splits between every code unit
   (`"ab"` with find `""`, replace `"-"` → `"a-b"`).

### string-split — `string_split` (4956)
1. Arity `["string-split"]`, 2.
2. `checkArgsInternal2("Strings", "string-split", s, String, splitstr, String)`.
3. `idx = s.indexOf(splitstr)`. If `-1`: returns Pyret list `[list: s]`.
   Else returns 2-element list `[list: s.slice(0, idx), s.slice(idx + splitstr.length)]`
   (splits only on the **first** occurrence). Empty splitstr: idx 0 → `["", s]`.

### string-split-all — `string_split_all` (4949)
1. Arity `["string-split-all"]`, 2.
2. `checkArgsInternal2("Strings", "string-split-all", s, String, splitstr, String)`.
3. Returns `ffi.makeList(s.split(splitstr))` — full JS `split` semantics
   (empty splitstr → one string per code unit; `"a,b,".split(",")` → `["a","b",""]`).

### string-char-at — `string_charat` (4968)
1. Arity `["string-char-at"]`, 2.
2. `checkArgsInternal2("Strings", "string-char-at", s, String, n, Number)`.
3. `if(!jsnums.isInteger(n) || n < 0)` (raw JS `<` — fine for fixnums) →
   `ffi.throwMessageException("string-char-at: expected a positive integer for the index, but got " + n)`
   (`n` stringified per §0.6, e.g. `... but got 1/2`).
4. `if(n > (s.length - 1))` →
   `ffi.throwMessageException("string-char-at: index " + n + " is greater than the largest index the string " + s)`
   (verbatim — the sentence really ends with the raw, unquoted string; on an empty
   string every index ≥ 0 hits this).
5. Returns `String(s.charAt(toFixnum(n)))` — a 1-code-unit string.

### string-toupper / string-to-upper — `string_toupper` (4980)
Arity `["string-toupper"]`, 1; `checkArgsInternal1("Strings", "string-toupper", s, String)`;
returns `s.toUpperCase()` (JS locale-independent Unicode default mapping).

### string-tolower / string-to-lower — `string_tolower` (4986)
Arity `["string-tolower"]`, 1; `checkArgsInternal1("Strings", "string-tolower", s, String)`;
returns `s.toLowerCase()`.

### string-explode — `string_explode` (4992)
Arity `["string-explode"]`, 1; `checkArgsInternal1("Strings", "string-explode", s, String)`;
returns `ffi.makeList(s.split(""))` — one element per UTF-16 code unit (surrogate pairs
split in half).

### string-index-of — `string_indexOf` (4998)
1. Arity `["string-index-of"]`, 2.
2. `checkArgsInternal2("Strings", "string-index-of", s, String, find, String)`.
3. Returns `makeNumberBig(s.indexOf(find))` — `makeNumberBig` is the identity, so the
   result is the JS number: 0-based index of first occurrence, **-1 if absent**.

### string-find / string-get-index — `string_getIndex` (5012)
(Both kebab names map to the same function; `string-find` IS present.)
1. Arity `["string-get-index"]`, 2 (yes — even for `string-find`).
2. `checkArgsInternal2("Strings", "string-find", s, String, find, String)`
   (funName in contract error is `"string-find"`).
3. If `s.indexOf(find) < 0`:
   `ffi.throwMessageException(`string-find: Target string "${find}" was not found inside source string "${s}"`)`
   — the quotes around find/s are literal double-quote characters.
4. Else returns the index (JS number).

### string-find-opt / string-find-index — `string_findIndexOpt` (5004)
1. Arity `["string-find-opt"]`, 2.
2. `checkArgsInternal2("Strings", "string-find-opt", s, String, find, String)`.
3. Returns `none` if index < 0 else `some(index)`.

### string-to-code-point — `string_to_code_point` (5021)
1. Arity `["string-to-code-point"]`, 1.
2. `checkArgsInternal1("Strings", "string-to-code-point", s, String)`.
3. `if(s.length !== 1)` →
   `ffi.throwMessageException("Expected a string of length exactly one, got " + s)`
   (raw, unquoted `s`). Note: a surrogate **pair** has length 2 and is rejected.
4. `charCode = codePointAt(s, 0)` (codePoint.js polyfill; a lone surrogate — the only
   way a length-1 string touches astral territory — returns the surrogate code unit
   itself, so this error branch is effectively unreachable). If not a number or NaN:
   `thisRuntime.ffi.throwMessageException("Could not find code for character: ", s)` —
   **verbatim two-argument call**; the message string ends with `": "` and the second
   argument is ignored by `throwMessageException` (it only checks/uses its first arg).
5. Returns the raw JS integer (a fixnum).

### string-from-code-point — `string_from_code_point` (5039)
1. Arity `["string-from-code-point"]`, 1.
2. `checkNatural(c)` — §0.3 mechanism: on failure `generic-type-mismatch(c, "Natural Number")`
   (predicate: `isNumber && jsnums.isInteger && jsnums.greaterThanOrEqual(val, 0)`).
   **Not** a contract failure — different rendering than the other string functions.
3. `c = jsnums.toFixnum(c)`; `if(c > 65535)` (ASTRAL_CUTOFF) →
   `ffi.throwMessageException("Invalid code point: " + c)` (c is a JS number here).
4. `fromCodePoint(c)` in try/catch; non-string result or exception → same
   `"Invalid code point: " + c` message.
5. Returns the 1-char JS string.

### string-to-code-points — `string_to_code_points` (5058)
1. Arity `["string-to-code-points"]`, 1.
2. `checkArgsInternal1("Strings", "string-to-code-points", s, String)`.
3. Loops `i` over `s.length`, calling `string_to_code_point(s[i])` on each **single
   code unit** — so an astral character comes back as its two surrogate code units
   (e.g. one emoji yields two entries), not as one code point; results collected and
   returned as `ffi.makeList(returnArray)`.

### string-from-code-points — `string_from_code_points` (5069)
1. Arity `["string-from-code-points"]`, 1.
2. `checkArgsInternal1("Strings", "string-from-code-points", l, List)`.
3. `ffi.toArray(l)`, then concatenates `string_from_code_point(c)` for each element
   (so each element gets the `checkNatural` / `"Invalid code point: "` treatment).
4. Returns the accumulated JS string (raw, not via makeString).

### gensym — (runtime.js:2630–2636)
`var gensymCounter = Math.floor(Math.random() * 1000);` at runtime creation.
1. Arity `["gensym"]`, 1.
2. `checkArgsInternal1("runtime", "gensym", base, String)` — note moduleName `"runtime"`.
3. Returns `unwrap(base) + String(gensymCounter++)` — base string with the current
   counter appended, counter post-incremented (shared across all gensym calls in the
   runtime instance).

**Not present:** there is no `raw-array-join-str` and no plain `string-find`-style
"join" helper; the only join in the runtime is `raw-list-join-str-last`
(runtime.js:4641, exported only in `builtins`): joins the `tostring` of each list
element with `sep`, using `lastSep` before the final element
(`<= 1` element: plain `join(sep)`).

---

## 2. Numbers

All exported in `runtimeNamespaceBindings` (runtime.js:5943–5996). "Returns big" below
means `makeNumberBig(x)` which is the **identity** — the js-numbers value passes through.

Common shape unless noted: arity guard, then `checkArgsInternalN("Numbers", funName, ...)`
per §0.2, then a single js-numbers call.

| Export | Impl (line) | Arity-error name | contract funName | Arg anns (in order) | Body / notes |
|---|---|---|---|---|---|
| num-max | num_max (5149) | `["num-max"]` 2 | `"num-max"` | l Number, r Number | `greaterThanOrEqual(l,r) ? l : r` (returns the actual argument object) |
| num-min | num_min (5156) | `["num-min"]` 2 | `"num-min"` | l Number, r Number | `lessThanOrEqual(l,r) ? l : r` |
| num-equal | num_equal (5108) | **`["num-equals"]`** 2 | **`"num-equals"`** | l Number, r Number | `makeBoolean(jsnums.equals(l, r))`. Note roughnum comparison inside jsnums.equals throws incomparable-values message from js-numbers via errbacks. |
| num-abs | num_abs (5163) | `["num-abs"]` 1 | `"num-abs"` | n Number | `jsnums.abs(n)` |
| num-sin | num_sin (5170) | `["num-sin"]` 1 | `"num-sin"` | n Number | `jsnums.sin(n)` (exact 0 stays exact 0; otherwise roughnum) |
| num-cos | num_cos (5176) | `["num-cos"]` 1 | `"num-cos"` | n Number | `jsnums.cos(n)` |
| num-tan | num_tan (5182) | `["num-tan"]` 1 | `"num-tan"` | n Number | `jsnums.tan(n)` |
| num-asin | num_asin (5188) | `["num-asin"]` 1 | `"num-asin"` | n Number | `jsnums.asin(n)`; out of domain → message `'asin: out of domain argument ' + n` |
| num-acos | num_acos (5194) | `["num-acos"]` 1 | `"num-acos"` | n Number | `jsnums.acos(n)`; domain msg `'acos: out of domain argument ' + n` |
| num-atan | num_atan (5200) | `["num-atan"]` 1 | `"num-atan"` | n Number | `jsnums.atan(n)` |
| num-atan2 | num_atan2 (5207) | `["num-atan2"]` 2 | `"num-atan2"` | y Number, x Number | `jsnums.atan2(y, x)`; (0,0) → `'atan2: out of domain argument (0, 0)'` |
| num-modulo | num_modulo (5214) | `["num-modulo"]` 2 | `"num-modulo"` | n **NumInteger**, mod **NumInteger** | `jsnums.modulo(n, mod)`; mod 0 → message `'modulo: the second argument is zero'`; sign of result follows `mod` |
| num-remainder | num_remainder (5221) | `["num-remainder"]` 2 | `"num-remainder"` | n Number, m Number | `jsnums.remainder(n, m)` |
| num-sqrt | num_sqrt (5242) | `["num-sqrt"]` 1 | `"num-sqrt"` | n **NumNonNegative** | `jsnums.sqrt(n)` (perfect-square rationals stay exact; else roughnum) |
| num-sqr | num_sqr (5248) | `["num-sqr"]` 1 | `"num-sqr"` | n Number | `jsnums.sqr(n)` |
| num-truncate | num_truncate (5254) | `["num-truncate"]` 1 | `"num-truncate"` | n Number | `n >= 0 ? jsnums.floor(n) : jsnums.ceiling(n)` |
| num-ceiling | num_ceiling (5264) | `["num-ceiling"]` 1 | `"num-ceiling"` | n Number | `jsnums.ceiling(n)` |
| num-floor | num_floor (5270) | `["num-floor"]` 1 | `"num-floor"` | n Number | `jsnums.floor(n)` |
| num-round | num_round (5276) | `["num-round"]` 1 | `"num-round"` | n Number | `jsnums.round(n)` (round-half-away-from-zero per js-numbers) |
| num-round-even | num_round_even (5282) | `["num-round-even"]` 1 | `"num-round-even"` | n Number | `jsnums.roundEven(n)` |
| num-log | num_log (5358) | `["num-log"]` 1 | `"num-log"` | n **NumPositive** | `jsnums.log(n)` |
| num-exp | num_exp (5364) | `["num-exp"]` 1 | `"num-exp"` | n Number | `jsnums.exp(n)` |
| num-expt | num_expt (5442) | `["num-expt"]` 2 | **`"num-is-rational"`** (verbatim bug) | n Number, pow Number | `jsnums.expt(n, pow)`; `0^negative` → message `"expt: division by zero"` |
| num-exact | num_exact (5370) | `["num-exact"]` 1 | `"num-exact"` | n Number | `jsnums.toRational(n)` |
| num-to-rational | num_to_rational (5376) | `["num-to-rational"]` 1 | `"num-to-rational"` | n Number | `jsnums.toRational(n)` (identical to num-exact) |
| num-to-roughnum | num_to_roughnum (5382) | `["num-to-roughnum"]` 1 | `"num-to-roughnum"` | n Number | `jsnums.toRoughnum(n)` |
| num-to-fixnum | num_to_fixnum (5388) | `["num-to-fixnum"]` 1 | **`"num-fixnum"`** | n Number | `jsnums.toFixnum(n)` — returns a raw JS double; if fractional, the value re-enters the tower as an *exact* number equal to the double (JS numbers are fixnums) |
| num-is-integer | num_is_integer (5394) | `["num-is-integer"]` 1 | `"num-is-integer"` | n Number | `jsnums.isInteger(n)` |
| num-is-rational | num_is_rational (5400) | `["num-is-rational"]` 1 | `"num-is-rational"` | n Number | `jsnums.isRational(n)` |
| num-is-roughnum | num_is_roughnum (5406) | `["num-is-roughnum"]` 1 | `"num-is-roughnum"` | n Number | `jsnums.isRoughnum(n)` |
| num-is-positive | num_is_positive (5412) | `["num-is-positive"]` 1 | `"num-is-positive"` | n Number | `jsnums.isPositive(n)` |
| num-is-negative | num_is_negative (5418) | `["num-is-negative"]` 1 | `"num-is-negative"` | n Number | `jsnums.isNegative(n)` |
| num-is-non-positive | num_is_non_positive (5424) | `["num-is-non-positive"]` 1 | `"num-is-non-positive"` | n Number | `jsnums.isNonPositive(n)` |
| num-is-non-negative | num_is_non_negative (5430) | `["num-is-non-negative"]` 1 | `"num-is-non-negative"` | n Number | `jsnums.isNonNegative(n)` |
| num-is-fixnum | num_is_fixnum (5436) | `["num-is-fixnum"]` 1 | `"num-is-fixnum"` | n Number | `typeof n === "number"` |
| num-tostring / num-to-string | num_tostring (5448) | `["num-tostring"]` 1 (both exports) | `"num-tostring"` | n Number | `makeString(String(n))` per §0.6 |
| num-to-string-digits | num_tostring_digits (5454) | `["num-to-string-digits"]` 2 | `"num-to-string-digits"` | n Number, digits NumInteger | `jsnums.toStringDigits(n, digits)` (js-numbers.js:4012): rounds `n` to `digits` decimal places (`round(n*10^d)/10^d`); positive digits pad with zeros after `.`; integers get `"." + "0"*d` when d≥1; negative digits round to the left of the decimal |

### -digits and -place variants (runtime.js:5288–5356)

All: arity 2, `checkArgsInternal2("Numbers", <contract-name>, n, Number, digits/place, NumInteger)`;
`tenX = jsnums.expt(10, digits|place)`; digits: `divide(base(multiply(n, tenX)), tenX)`;
place: `multiply(base(divide(n, tenX)), tenX)`. Verbatim names (several arity names are
stale):

| Export | Arity-error name | contract funName |
|---|---|---|
| num-truncate-digits | `["num-truncate-digits"]` | `"num-truncate-digits"` |
| num-ceiling-digits | `["num-ceiling"]` | `"num-ceiling-digits"` |
| num-floor-digits | `["num-floor"]` | `"num-floor-digits"` |
| num-round-digits | `["num-round"]` | `"num-round-digits"` |
| num-round-even-digits | `["num-round-even"]` | `"num-round-even-digits"` |
| num-truncate-place | `["num-truncate-place"]` | `"num-truncate-place"` |
| num-ceiling-place | `["num-ceiling"]` | `"num-ceiling-place"` |
| num-floor-place | `["num-floor"]` | `"num-floor-place"` |
| num-round-place | `["num-round"]` | `"num-round-place"` |
| num-round-even-place | `["num-round-even"]` | `"num-round-even-place"` |

(Also: the PFunction *display* names for `num-truncate-digits` and `num-truncate-place`
are both `"num-truncate"` — runtime.js:5969/5974.)

### num-within / num-within-abs / num-within-rel (runtime.js:5115–5147)

Each takes a tolerance and **returns a new function** of two numbers.

- **num-within-abs(delta)**: arity name `["within"]`, 1;
  `checkArgsInternal1("Numbers", "num-within-abs", delta, NumNonNegative)`.
  Inner fn (PFunction name `"num-within-abs(...)"`): arity name `["from within"]`, 2;
  `checkArgsInternal2("Numbers", "from within", l, Number, r, Number)`;
  returns `jsnums.roughlyEquals(l, r, delta)` — absolute: `|l-r| <= delta` after
  converting roughnums to rationals. Negative delta at compare time → message
  `"negative tolerance " + delta`.
- **num-within-rel(relTol)**: arity name `["within-rel"]`, 1;
  `checkArgsInternal1("Numbers", "within-rel", relTol, Number)`.
  Inner fn (name `"num-within-rel(...)"`): arity `["from within-rel"]`, 2;
  `checkArgsInternal2("Numbers", "from within-rel", l, Number, r, Number)`;
  returns `jsnums.roughlyEqualsRel(l, r, relTol, false)`.
- **num-within(relTol)**: arity name `["within"]`, 1;
  `checkArgsInternal1("Numbers", "within", relTol, Number)`.
  Inner fn (name `"num-within(...)"`): arity `["from within"]`, 2; same arg checks
  funName `"from within"`; returns `jsnums.roughlyEqualsRel(l, r, relTol, true)`
  (**smoothed**).

`roughlyEqualsRel(cv, tv, delta, smoothed)` (js-numbers.js:550): identical values →
true; `denom = min(|cv|,|tv|)` (+1 if smoothed); if `delta <= 1`:
`|cv-tv| <= delta * denom`; else `|cv-tv|/denom <= delta`. Negative delta →
`'negative relative tolerance ' + delta`.

### num-random / num-random-seed / random (runtime.js:5090–5106, 5460)

`var rng = seedrandom("ahoy, world!");` — the default seed string is literally
`"ahoy, world!"`, so unseeded sequences are deterministic per runtime.

- **num-random(max)**: arity `["num-random"]`, 1;
  `checkArgsInternal1("Numbers", "num-random", max, Number)`;
  returns `makeNumber(Math.floor(jsnums.toFixnum(max) * rng()))` — an exact integer in
  `[0, max)` for positive integer max; negative max produces negative results;
  no integer check on max.
- **num-random-seed(seed)**: arity `["num-random-seed"]`, 1;
  `checkArgsInternal1("Numbers", "num-random-seed", seed, Number)`;
  `rng = seedrandom(String(seed))`; returns `nothing`.
- **random(max)**: arity `["random"]`, 1;
  `checkArgsInternal1("Numbers", "random", max, Number)`; then delegates to
  `num_random(max)` (whose checks re-run).

### time-now (runtime.js:5467)
Arity `["time-now"]`, 0 args, no other checks. Returns `new Date().getTime()`
(JS integer milliseconds — a fixnum).

---

## 3. Raw arrays

Pyret raw arrays are plain JS arrays. Exported at runtime.js:6031–6051.

### Shared: `checkArrayIndex(methodName, arr, ix)` (runtime.js:4152)

Raises `ffi.throwInvalidArrayIndex(methodName, arr, ix, reason)` →
`invalid-array-index(methodName, array, index, reason)` where `reason` is one of, tested
**in this order** (note: too-large before negative before integer):

1. `ix >= arr.length` → `"is too large; the array length is " + arr.length`
2. `ix < 0` → `"is a negative number."`
3. `!num_is_integer(ix)` → `"is not an integer."`

(So `ix = 1.5` on a 3-element array → "is not an integer.", but `ix = 5.5` →
"is too large; ..." and `ix = -1.5` → "is a negative number.")

### Shared: `check_array_size(name, size)` (runtime.js:4167)

1. `checkNumInteger(size)` → generic-type-mismatch `(size, "NumInteger")` (§0.3).
2. `checkNumNonNegative(size)` → generic-type-mismatch `(size, "NumNonNegative")`.
3. `jsnums.greaterThan(size, 4294967295)` → calls
   `thisRuntime.throwMessageException(name + ": cannot create array larger than 4294967295")`
   — **`throwMessageException` is not actually installed on `thisRuntime`**, so this
   path crashes with a JS `TypeError` rather than a Pyret error. (Faithful ports should
   reproduce "some internal crash", or at least never rely on this path being a clean
   Pyret error.)

### raw-array-get — `raw_array_get` (4319)
1. Arity `["raw-array-get"]`, 2.
2. `checkArgsInternal2("RawArrays", "raw-array-get", arr, RawArray, ix, Number)`.
3. `checkArrayIndex("raw-array-get", arr, ix)`.
4. Returns `arr[ix]` (ix used raw as JS index).

### raw-array-set — `raw_array_set` (4366)
1. Arity `["raw-array-set"]`, 3.
2. `checkArgsInternal2("RawArrays", "raw-array-set", arr, RawArray, ix, Number)`
   (newVal unchecked).
3. `checkArrayIndex("raw-array-set", arr, ix)`.
4. Mutates `arr[ix] = newVal`; returns **the array** (not nothing).

### raw-array-of — `raw_array_of` (4185)
1. Arity `["raw-array-of"]`, 2. Args are `(val, len)`.
2. `checkArgsInternal1("RawArrays", "raw-array-of", len, Number)` — only `len` checked,
   and its failure-at-arg index is 0 (with a 1-element args list `[len]`).
3. `check_array_size("raw-array-of", len)`.
4. `new Array(len)` filled with the same `val` reference; returns it.

### raw-array-build — `raw_array_build` (4198)
Stack-safe trampoline (activation-record re-entry).
1. Arity `["raw-array-build"]`, 2.
2. `checkArgsInternal2("RawArrays", "raw-array-build", f, Function, len, Number)`.
3. `check_array_size("raw-array-build", len)` (runs after the GAS decrement, and again
   on every resume).
4. Calls `f.app(curIdx)` for `curIdx` 0..len-1 (JS `<` against the number), pushing each
   result; returns the built array. Result values are unchecked.

### raw-array-build-opt — `raw_array_build_opt` (4258)
Same as raw-array-build (arity name `["raw-array-build-opt"]`, contract name
`"raw-array-build-opt"`, `check_array_size("raw-array-build-opt", len)`), except each
`f.app(i)` result is tested with `ffi.isSome(ans)`; `some(v)`'s `value` field is pushed,
`none` results are skipped. Non-Option results are silently skipped too (only `isSome`
is consulted). Returns the (possibly shorter) array.

### raw-array-length — `raw_array_length` (4375)
1. Arity `["raw-array-length"]`, 1.
2. `checkArgsInternal1("RawArrays", "raw-array-length", arr, RawArray)`.
3. Returns `makeNumber(arr.length)`.

### raw-array-to-list — `raw_array_to_list` (4382)
1. Arity `["raw-array-to-list"]`, 1.
2. `checkArgsInternal1("RawArrays", "raw-array-to-list", arr, RawArray)`.
3. Returns `ffi.makeList(arr)` (fresh list; array not shared structurally).

### raw-array-from-list — `raw_array_from_list` (4179)
1. Arity `["raw-array-from-list"]`, 1.
2. `checkArgsInternal1("RawArrays", "raw-array-from-list", lst, List)`.
3. Returns `ffi.toArray(lst)`.

### raw-array-concat — `raw_array_concat` (4396)
1. Arity `["raw-array-concat"]`, 2.
2. `checkArgsInternal2("RawArrays", "raw-array-concat", arr, RawArray, other, RawArray)`.
3. Returns `arr.concat(other)` (fresh array).

### raw-array-duplicate — `raw_array_duplicate` (4403)
1. Arity guard `throwArityErrorC(["raw-array-duplicate"], 1, $a)` — note the `isMethod`
   argument is **omitted** (undefined), so the arity path itself trips
   `runtime.checkBoolean(undefined)` inside ffi and surfaces as a
   generic-type-mismatch on a non-Pyret value instead of a clean arity error.
2. `thisRuntime.checkArray(arr)` — §0.3 mechanism: generic-type-mismatch
   `(arr, "RawArray")`, *not* a contract failure.
3. Returns `[].concat(arr)` (shallow copy).

### raw-array-filter — `raw_array_filter` (4768)
1. Arity `["raw-array-filter"]`, 2. Args `(f, arr)`.
2. `checkArgsInternal2("RawArrays", "raw-array-filter", f, Function, arr, RawArray)`.
3. For each element in order: `res = f.app(elt)`. If `res` is not a JS boolean:
   `ffi.throwNonBooleanCondition(["raw-array-filter"], "Boolean", res)` →
   `non-boolean-condition(builtin("raw-array-filter"), "Boolean", res)`.
   `true` keeps the element (same reference).
4. Returns a fresh array. Stack-safe. (On trampoline resume the answer is only
   truthiness-tested, not re-checked for booleanness.)

### raw-array-map — `raw_array_map` (4496)
1. Arity `["raw-array-map"]`, 2. Args `(f, arr)`.
2. `checkArgsInternal2("RawArrays", "raw-array-map", f, Function, arr, RawArray)`.
3. Fresh `new Array(length)`; `newArray[i] = f.app(arr[i])` in order; results
   unchecked. Stack-safe. Returns the new array.

### raw-array-map-1 — `raw_array_map1` (4685)
1. Arity `["raw-array-map1"]`, 3. Args `(f1, f, arr)`.
2. `checkArgsInternal3("RawArrays", "raw-array-map1", f1, Function, f, Function, arr, RawArray)`.
3. Same as map but index 0 uses `f1`, the rest use `f`.

### raw-array-fold — `raw_array_fold` (4419)
1. Arity `["raw-array-fold"]`, 4. Args `(f, init, arr, start)`.
2. `checkArgsInternalInline("RawArrays", "raw-array-fold", f, Function, init, Any, arr, RawArray, start, Number)`.
3. Left fold; the callback is called as `f.app(acc, arr[i], i + start)` — i.e. `start`
   is an **offset added to the reported index**, not a starting position; the whole
   array is always folded. Stack-safe. Returns the final accumulator.

### raw-array-and-mapi / raw-array-or-mapi — `raw_array_bool_mapper` (4457–4493)
Generated by `raw_array_bool_mapper(name, good, bad)` with
(`"raw-array-and-mapi"`, good=`true`, bad=`false`) and
(`"raw-array-or-mapi"`, good=`false`, bad=`true`).
1. Arity `[name]`, 3. Args `(f, arr, start)`.
2. `checkArgsInternal3("RawArrays", name, f, Function, arr, RawArray, start, Number)`.
3. Iterates `currentIndex` from `start` to `length-1` (here `start` IS the starting
   index), calling `f.app(arr[i], i)`. If the result `=== bad` it returns `bad`
   immediately (short-circuit); **any other value** (including non-booleans) continues;
   if the loop completes, returns `good`. So and-mapi → true iff no callback returned
   exactly `false`; or-mapi → true iff some callback returned exactly `true`.
   Stack-safe.

### raw-array-sort-nums — `raw_array_sort_nums` (4327)
1. Arity **`["raw-array-from-list"]`** (verbatim stale name), 2. Args `(arr, asc)`.
2. `checkArgsInternal2("RawArrays", "raw-array-sort-nums", arr, RawArray, asc, Boolean)`.
3. Sorts **in place** with comparator: asc →
   `lessThan(x,y) ? -1 : roughlyEquals(x,y,0) ? 0 : 1`; desc → `greaterThan` variant.
   Returns the same array.

### raw-array-sort-by — `raw_array_sort_by` (4336)
1. Arity **`["raw-array-from-list"]`** (verbatim), 3. Args `(arr, comp, asc)`.
2. `checkArgsInternal3("RawArrays", "raw-array-sort-by", arr, RawArray, comp, Function, asc, Boolean)`.
3. `raw_array_map(comp, arr)` to compute keys (so comp's own errors surface as
   raw-array-map's would), zips `[v, key]`, sorts the zipped copy by key with the same
   -1/0/1 comparators on keys, returns a **new** array of the values (input not
   mutated). Contains two literal `debugger` statements. Stack-safe via safeCall.

### raw-each-loop — `eachLoop` (3492)
Exported as `'raw-each-loop': makeFunction(eachLoop, "raw-each-loop")` (both in
`builtins` and the namespace). **No arity guard and no type checks.**
`eachLoop(fun, start, stop)`: calls `fun.app(i)` for `i = start; i < stop; i++`
(JS numbers), ignoring results (except continuations, for stack-safety); returns
Pyret `nothing`. If `start >= stop` it returns `nothing` immediately.

---

## 4. `not`, torepr/tostring, cyclic naming, string escaping

### not — `bool_not` (5083)
1. Arity `["not"]`, 1.
2. `checkArgsInternal1("Booleans", "not", l, Boolean)`.
3. Returns `makeBoolean(!l)`.

### torepr / tostring top-level (runtime.js:1754–1770)

```js
torepr:  arity ["torepr"], 1  → toReprJS(val, ReprMethods._torepr)
tostring: arity ["tostring"], 1 → isString(val) ? val : toReprJS(val, ReprMethods._tostring)
```

`toReprJS` fast paths: numbers → `reprMethods["number"](val)` = `String(val)` (§0.6);
booleans → `String` (`"true"`/`"false"`); strings → the `string` method; everything else
→ `toReprLoop` (worklist).

`ReprMethods` (runtime.js:323–449):

- `_tostring` = DefaultReprMethods unchanged.
- `_torepr` = DefaultReprMethods except
  `string: '"' + replaceUnprintableStringChars(String(str)) + '"'`.
- `$cli` = DefaultReprMethods except
  `function: "<function:" + val.name + ">"`, `method: "<method:" + val.name + ">"`.

DefaultReprMethods rendering, exact conventions:

| Kind | Output |
|---|---|
| number | `String(n)` (fixnum digits; `"a/b"` for rationals; `"~x"` for roughnums) |
| boolean | `"true"` / `"false"` |
| string (tostring) | the string itself, unquoted |
| string (torepr) | `'"' + escaped + '"'` (see escaping below) |
| nothing | `nothing` |
| function | `<function>` |
| method | `<method>` |
| opaque | `<internal value>` |
| tuple | `{ v0; v1; ... }` — literally `"{ "` + items joined by `"; "` + `" }"`. A 0-length tuple would render `"{  }"` (two spaces). |
| object (record) | `{k1: v1, k2: v2}` — `"{"` + `key + ": " + val` joined by `", "` + `"}"`; **no** spaces inside the braces. Empty: `{}`. |
| raw array | `[raw-array: v0, v1]` — `"[raw-array: "` + items joined `", "` + `"]"`. Empty: `[raw-array: ]` (note trailing space before `]`). |
| ref (explicit) | `ref(v)` |
| ref (implicit, i.e. a data value's mutable field) | just `v` (no wrapper) |
| unset/graphable ref | `<uninitialized-ref>` |
| data value, arity ≠ -1 | `Name(f1, f2, ...)` — constructor-declared field order (`$constructor.$fieldNames`) |
| data value, singleton (`$arity === -1`) | `Name` (no parens) |
| unknown JS value | logged via `CONSOLE.log("UNKNOWN VALUE: ", next)` + `console.trace()`; rendered through the `string` method with the text `<Unknown value: details logged to console>` (so torepr quotes it) |

**Record field order**: `for (var field in val.dict)` — JS for-in order over the dict,
i.e. **insertion order** of the underlying dict object (own properties first, then any
prototype-chain properties for objects built with `extendWith`, which uses
`Object.create(oldDict)` and shadows updated keys). **Not sorted.**

**Data values with `_output`**: if `next.dict["_output"]` exists and is a method, it is
invoked (`full_meth(next)`), the result must be a `ValueSkeleton`, and rendering goes
through `renderValueSkeleton` (runtime.js:219):

- `vs-value` → the recursively rendered value.
- `vs-str(s)` → the raw string `s`, unquoted.
- `vs-collection(name, items)` → `"[" + name + ": "` + items joined `", "` + `"]"`
  (empty → `[name: ]` with the trailing space). This is how lists print:
  `[list: 1, 2, 3]`.
- `vs-constr(name, args)` → `name(` + args joined `", "` + `)`.
- `vs-seq(items)` → plain concatenation, no separators.
- `vs-row` → in browser: `[row: "hdr" => val, ...]` (headers `JSON.stringify`'d);
  on Node: an ascii-table rendering.
- `vs-table` → `"<table>"` in browser; ascii-table on Node (cell strings longer than 40
  chars truncated to `substr(0,35) + "[...]"`); truncated tables append
  `` `\n[rendered ${rows.length} of ${total-rows} rows]` ``.
- `vs-matrix` → `"[" + rows.join(", ") + "]"` where each row is `"[" + cells joined ", " + "]"`.

### Cyclic-value naming (`toReprLoop`, runtime.js:1522–1746)

Three caches are created **per top-level `toReprLoop` invocation** (i.e. per
torepr/tostring call), one each for type strings `"array"`, `"ref"`, `"object"`, each
with its own `cyclicCounter` starting at **1**. The "seen" set threaded through the
worklist frames is the chain of ancestors along the **current render path** (each frame
extends its parent's chain), so only true cycles get names — DAG sharing does not.
When a value already on the path is re-encountered, it is rendered as its cache entry's
name; the name is created lazily on first re-encounter as:

```
"<cyclic-" + type + "-" + cyclicCounter++ + ">"
```

giving `<cyclic-object-1>`, `<cyclic-array-1>`, `<cyclic-ref-1>`, then `-2`, etc. The
counter increments once per *distinct cyclic value* of that type (the name is cached on
the entry, so hitting the same value again reuses the same name). Order of numbering is
the order in which cycles are first detected during the depth-first render. Data values
and records share the `"object"` counter; refs use `"ref"`; raw arrays use `"array"`.
Unset refs render `<uninitialized-ref>` without consuming a counter.

### String escaping for torepr — `replaceUnprintableStringChars` (runtime.js:1491)

Per UTF-16 code unit:

- `\t` (9), `\n` (10), `\r` (13), `\"` (34), `\\` (92) → two-char escapes as shown.
- code 32–126 inclusive → the character itself.
- everything else → backslash-`u` + the **uppercase** hex of the code unit,
  left-zero-padded to at least 4 digits (code unit 0xE9 renders as `\u00E9`,
  code unit 0 as `\u0000`).

`escapeString(s)` = `'"' + replaceUnprintableStringChars(s) + '"'`, and
`_torepr`'s string method is the same expression.

---

## 5. Spy statements (runtime.js:5875–5896)

`spy(loc, message, locs, names, vals)`. If a runtime param `"onSpy"` is set to a JS
function, it is called with the raw arguments and nothing is printed. Otherwise the
output goes to **`theOutsideWorld.stdout`** (not stderr):

1. All of `[message, ...vals]` are rendered with **torepr** (`raw_array_map(torepr, ...)`).
2. `prologue = "Spying"`. If the rendered message is not exactly the two-character
   string `""` (i.e. torepr of the empty string, source check
   `rendered[0] !== "\"\""`), then `prologue += " " + rendered[0]` — so a string
   message appears **with its quotes**, e.g. `Spying "checkpoint 1"`.
3. `prologue += " (at " + <srcloc>.format(true) + ")"` where `<srcloc>` is
   `makeSrcloc(loc)` — `format(true)` is srcloc's full format,
   `"uri: line l, column c"`-style per `srcloc.arr`'s `format` method with
   `show-file = true` (for a `srcloc` it is
   `source + ":" + start-line + ":" + start-column`-ish as defined in
   `src/arr/base/srcloc.arr`; the runtime just calls `.format(true)`).
4. Emit `prologue + "\n"`.
5. For each value i (1-based over rendered): emit
   `"  " + names[i - 1] + ": " + rendered[i] + "\n"` — two leading spaces, the
   expression name, `": "`, the torepr of the value.

Example:

```
Spying "my label" (at file.arr:3:2-3:20)
  x: 5
  s: "hello"
```

---

## 6. within / roughly-equal tolerance defaults (runtime.js:2266–2476)

Flags: `EQUAL_ALWAYS=true`, `EQUAL_NOW=false`; tolerance kinds `TOL_IS_ABS="abs"`,
`TOL_IS_REL="rel"`, `TOL_IS_SMOOTH="smooth"`; `FROM_WITHIN=true`.

`equal3(l, r, alwaysFlag, tol, rel, fromWithin)` numeric leaf behavior:

- `tol` provided (any within/roughly variant): abs → `jsnums.roughlyEquals(l, r, tol)`;
  rel → `roughlyEqualsRel(l, r, tol, false)`; smooth → `roughlyEqualsRel(l, r, tol, true)`
  (see §2 for formulas). Failure → `notEqual(path, l, r)`.
- `tol === undefined` or falsy (plain equal-always/now pass `0`): roughnum on either
  side → `unknown(reason, l, r)` with reason `"RoughnumZeroTolerances"` when
  `fromWithin` is true, else `"Roughnums"`; otherwise `jsnums.equals`.

Boolean-returning wrappers convert via `equalityToBool` (2337): Equal → true,
NotEqual → false, Unknown → `ffi.throwEqualityException(reason, value1, value2)`.

**Defaults:**

- `ROUGH_TOL = jsnums.fromFixnum(0.000001)` (runtime.js:2447) — because `fromFixnum`
  goes through `fromString(String(0.000001))`, this is the **exact rational
  1/1000000**, not a float.
- `roughly-equal` and `roughly-equal-always` = `roughlyEqualAlways`:
  `equal3(v1, v2, EQUAL_ALWAYS, ROUGH_TOL, TOL_IS_SMOOTH, false)` — i.e. smoothed
  relative tolerance of 1/1000000: equal iff `|v1-v2| <= (min(|v1|,|v2|) + 1) / 1000000`.
  **Fast path quirk**: if both args are primitive (`typeof` number/string/boolean) it
  returns `v1 === v2` *without any tolerance* — so two distinct fixnums (JS-number
  integers) are never roughly-equal even when within tolerance
  (e.g. `roughly-equal(1000000, 1000001)` is `false`).
  `equalAlways` has the same fast path (harmless there).
- `roughly-equal-now`/`roughly-equal-now3` — same with `EQUAL_NOW`; the `-now` boolean
  version has **no** primitive fast path.
- Arity-guard names (verbatim, stale): `roughlyEqualAlways3` → `["equal-always3"]`,
  `roughlyEqualAlways` → `["equal-always"]`, `roughlyEqualNow3` → `["equal-now3"]`,
  `roughlyEqualNow` → `["equal-now"]`. safeCall stack-frame labels are
  `"roughly-equal-always"` / `"roughly-equal-now"`.
- `within(tol)` family: each checks its tolerance with
  `checkArgsInternal1("equality", <name>, tol, ann)` and returns a 2-arg function whose
  arity name is `["<name>(...)"]`. Tolerance annotation is **NumNonNegative** for
  `within-abs-now3`, `within-abs3`, `within-abs-now`; **Number** for everything else
  (including `within-abs` — verbatim inconsistency). Kinds:
  `within`/`within-now`/`within3`/`within-now3` → SMOOTH; `within-rel*` → REL;
  `within-abs*` → ABS; `-now` variants use EQUAL_NOW, others EQUAL_ALWAYS; all pass
  `FROM_WITHIN=true` (so zero-tolerance roughnum comparisons report reason
  `"RoughnumZeroTolerances"`).
- There is **no default tolerance** for `within` — the only default tolerance in the
  runtime is `ROUGH_TOL` (1/1000000, smooth, used by `roughly-equal*` and by checker
  `is-roughly` through them).

Non-numeric equality with tolerance walks structures as usual (tuples:
path `is-tuple{ path; i }`; arrays (equal-now only): path `raw-array-get(path, i)`;
objects/data: path `path.field`; refs (equal-now): `deref(path)`/`!field`).
