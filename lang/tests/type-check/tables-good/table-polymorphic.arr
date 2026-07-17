import lists as L

fun sum(l :: List<Number>) -> Number:
  L.fold(lam(a :: Number, b :: Number): a + b end, 0, l)
end

# B2T2 dotProduct: the type system enforces that both columns are numeric
# columns of t
fun dot-product<S>(t :: Table<S>, c1 :: Col<S, Number>, c2 :: Col<S, Number>) -> Number:
  ns = t.get-column(c1)
  ms = t.get-column(c2)
  sum(L.map2(lam(a :: Number, b :: Number): a * b end, ns, ms))
end

# bootstrap core.arr mean
fun col-mean<S>(t :: Table<S>, col :: Col<S, Number>) -> Number:
  vals = t.get-column(col)
  sum(vals) / vals.length()
end

# a Col-typed binding: the literal is checked against the schema here
type GB = {name :: String, age :: Number, quiz1 :: Number, quiz2 :: Number}
age-col :: Col<GB, Number> = "age"

# column names are strings
fun describe<S>(c :: Col<S>) -> String: "column " + c end

gradebook :: Table<GB> = table: name, age, quiz1, quiz2
  row: "Bob", 12, 8, 9
  row: "Alice", 17, 6, 8
  row: "Eve", 13, 7, 9
end

check:
  dot-product(gradebook, "quiz1", "quiz2") is ((8 * 9) + (6 * 8)) + (7 * 9)
  col-mean(gradebook, age-col) is 14
  describe(age-col) is "column age"
end
