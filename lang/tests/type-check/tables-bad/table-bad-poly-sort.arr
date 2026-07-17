# passing a String column where a numeric column is required
import lists as L
fun col-mean<S>(t :: Table<S>, col :: Col<S, Number>) -> Number:
  vals = t.get-column(col)
  L.fold(lam(a :: Number, b :: Number): a + b end, 0, vals) / vals.length()
end
t = table: name, age row: "Bob", 12 end
x = col-mean(t, "name")
