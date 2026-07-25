#|
   b2t2 example programs: pHackingHomogeneous and pHackingHeterogeneous.

   The paper's program iterates over `header(jellyAnon)` and calls
   `getColumn(t, c)` for each name.  Names computed at run time carry no
   static information, so `t.get-column(c)` for `c :: String` can only be
   given `List<Any>` (see DESIGN.md).  What *is* typable, and is the point of
   the two examples, is the homogeneity of the table:

     * pHackingHomogeneous: every column of jellyAnon is a Boolean, so
       `t.all-columns()` has type `List<List<Boolean>>` and the loop is fully
       typed without naming any column.

     * pHackingHeterogeneous: jellyNamed mixes a String column in, so
       `all-columns()` is only `List<List<Any>>`.  Narrowing with `select`
       first recovers a homogeneous table -- and the checker knows it.
|#

import lists as L

type JellyAnon = Table<{
  get-acne :: Boolean, red :: Boolean, black :: Boolean, white :: Boolean,
  green :: Boolean, yellow :: Boolean, brown :: Boolean, orange :: Boolean,
  pink :: Boolean, purple :: Boolean
}>

jelly-anon :: JellyAnon =
  table: get-acne :: Boolean, red :: Boolean, black :: Boolean, white :: Boolean,
         green :: Boolean, yellow :: Boolean, brown :: Boolean, orange :: Boolean,
         pink :: Boolean, purple :: Boolean
    row: true,  false, false, false, true,  false, false, true,  false, false
    row: true,  false, true,  false, true,  true,  false, false, false, false
    row: false, false, false, false, true,  false, false, false, true,  false
  end

# Stand-in for the paper's fisherTest: it only has to insist on two Boolean
# columns of the same length.
fun fisher-test(xs :: List<Boolean>, ys :: List<Boolean>) -> Number:
  agree = L.length(L.filter(lam(b :: Boolean) -> Boolean: b end,
      L.map2(lam(x :: Boolean, y :: Boolean) -> Boolean: x == y end, xs, ys)))
  1 - (agree / (L.length(xs) + 1))
end

# --- pHackingHomogeneous ---------------------------------------------------
# Every column is a Boolean, so `all-columns()` is List<List<Boolean>> and no
# column name (and no Any) appears anywhere.
fun p-hacking-homogeneous(t :: JellyAnon) -> List<Number>:
  col-acne :: List<Boolean> = t.column("get-acne")
  rest :: List<List<Boolean>> = t.drop("get-acne").all-columns()
  L.filter(lam(p :: Number) -> Boolean: p < 0.05 end,
    L.map(lam(col-jb :: List<Boolean>) -> Number: fisher-test(col-acne, col-jb) end, rest))
end

hits :: List<Number> = p-hacking-homogeneous(jelly-anon)

# --- pHackingHeterogeneous -------------------------------------------------
type JellyNamed = Table<{
  name :: String, get-acne :: Boolean, red :: Boolean, black :: Boolean,
  white :: Boolean, green :: Boolean
}>

jelly-named :: JellyNamed =
  table: name :: String, get-acne :: Boolean, red :: Boolean, black :: Boolean,
         white :: Boolean, green :: Boolean
    row: "Emily", true,  false, false, false, true
    row: "Jacob", true,  false, true,  false, true
    row: "Emma",  false, false, false, false, true
  end

# The name column has to be projected away first.  `select` computes the
# result schema exactly, so the checker can see that what is left is all
# Booleans.
fun p-hacking-heterogeneous(t :: JellyNamed) -> List<Number>:
  col-acne :: List<Boolean> = t.column("get-acne")
  booleans :: Table<{red :: Boolean, black :: Boolean, white :: Boolean, green :: Boolean}> =
    select red, black, white, green from t end
  rest :: List<List<Boolean>> = booleans.all-columns()
  L.map(lam(col-jb :: List<Boolean>) -> Number: fisher-test(col-acne, col-jb) end, rest)
end

hits2 :: List<Number> = p-hacking-heterogeneous(jelly-named)

# The heterogeneous table itself really is heterogeneous, and the checker
# says so: all-columns() there is only List<List<Any>>.
mixed :: List<List<Any>> = jelly-named.all-columns()
