#|
   Adapted from /app/core.arr, the Bootstrap:Data Science "core" library.

   core.arr writes its statistics helpers as

     mean :: (t :: Table, col :: String) -> Number
     fun mean(t, col) block:
       check-integrity(t, [list: col])
       if not(is-number(t.column(col).get(0))): raise(...)
       else: Stats.mean(ensure-numbers(t.column(col)))
       end
     end

   i.e. the *requirements* "col is a column of t" and "that column holds
   numbers" are checked dynamically, and re-checked on every call.  Both are
   expressible as types:

     mean :: <S> (t :: Table<S>, col :: Column<S, Number>) -> Number

   `Column<S, Number>` says "a column name of the table whose schema is S,
   whose sort is Number".  At the call site the checker resolves the literal
   name against the caller's schema and rejects a name that is missing or has
   the wrong sort; inside the body it is the annotation that licenses
   `t.column(col)` to be a `List<Number>`, so no run-time re-check is needed
   for the type's sake.
|#

import lists as L

# (core.arr calls out to the `statistics` trove for these; that module is
# compiled without type checking, so its provided types are all `Any`.  They
# are spelled out here to keep the example self-contained -- the interesting
# part is the signatures, not the arithmetic.)
fun sum-of(l :: List<Number>) -> Number:
  L.fold(lam(acc :: Number, n :: Number) -> Number: acc + n end, 0, l)
end

fun mean-of(l :: List<Number>) -> Number:
  if L.length(l) == 0: 0 else: sum-of(l) / L.length(l) end
end

fun median-of(l :: List<Number>) -> Number:
  sorted = l.sort()
  n = L.length(sorted)
  if n == 0: 0
  else if num-modulo(n, 2) == 1: sorted.get(num-floor(n / 2))
  else: (sorted.get(n / 2) + sorted.get((n / 2) - 1)) / 2
  end
end

fun mean<S>(t :: Table<S>, col :: Column<S, Number>) -> Number:
  mean-of(t.column(col))
end

fun median<S>(t :: Table<S>, col :: Column<S, Number>) -> Number:
  median-of(t.column(col))
end

fun minimum<S>(t :: Table<S>, col :: Column<S, Number>) -> Number:
  vals = t.column(col)
  L.fold(lam(acc :: Number, n :: Number) -> Number: num-min(acc, n) end, vals.get(0), vals)
end

fun maximum<S>(t :: Table<S>, col :: Column<S, Number>) -> Number:
  vals = t.column(col)
  L.fold(lam(acc :: Number, n :: Number) -> Number: num-max(acc, n) end, vals.get(0), vals)
end

fun total<S>(t :: Table<S>, col :: Column<S, Number>) -> Number:
  sum-of(t.column(col))
end

# core.arr's `iqr`, without the dynamic column/sort checks.
fun iqr<S>(t :: Table<S>, col :: Column<S, Number>) -> Number:
  l = t.column(col).sort()
  first-half = l.split-at(num-floor(l.length() / 2)).prefix
  second-half = l.split-at(num-ceiling(l.length() / 2)).suffix
  median-of(second-half) - median-of(first-half)
end

# core.arr's `r-value` takes two column names; here, the r-squared of the
# correlation of two numeric columns.
fun r-value<S>(t :: Table<S>, xs :: Column<S, Number>, ys :: Column<S, Number>) -> Number:
  x-s = t.column(xs)
  y-s = t.column(ys)
  mx = mean-of(x-s)
  my = mean-of(y-s)
  cov = sum-of(L.map2(lam(x :: Number, y :: Number) -> Number: (x - mx) * (y - my) end, x-s, y-s))
  vx = sum-of(L.map(lam(x :: Number) -> Number: (x - mx) * (x - mx) end, x-s))
  vy = sum-of(L.map(lam(y :: Number) -> Number: (y - my) * (y - my) end, y-s))
  if (vx == 0) or (vy == 0): 0 else: cov / num-sqrt(vx * vy) end
end

# --- using them ------------------------------------------------------------

type Animals = Table<{name :: String, age :: Number, weight :: Number}>

animals :: Animals =
  table: name :: String, age :: Number, weight :: Number
    row: "Sasha", 3, 45
    row: "Mia", 2, 8
    row: "Nori", 5, 22
    row: "Toggle", 1, 12
  end

mean-age :: Number = mean(animals, "age")
median-weight :: Number = median(animals, "weight")
oldest :: Number = maximum(animals, "age")
lightest :: Number = minimum(animals, "weight")
total-weight :: Number = total(animals, "weight")
spread :: Number = iqr(animals, "weight")
corr :: Number = r-value(animals, "age", "weight")

# The same helpers also apply to a table whose schema is only partly known,
# as long as the column being named is one of the known ones.
fun mean-of-score<S>(t :: Table<S, {score :: Number}>) -> Number:
  mean(t, "score")
end

scored = table: player :: String, score :: Number
  row: "a", 10
  row: "b", 20
end

avg-score :: Number = mean-of-score(scored)
