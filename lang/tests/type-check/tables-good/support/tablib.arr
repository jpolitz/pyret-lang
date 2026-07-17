provide: col-mean, gradebook, type GB end
import lists as L

type GB = {name :: String, age :: Number}

fun col-mean<S>(t :: Table<S>, col :: Col<S, Number>) -> Number:
  vals = t.get-column(col)
  L.fold(lam(a :: Number, b :: Number): a + b end, 0, vals) / vals.length()
end

gradebook :: Table<GB> = table: name, age
  row: "Bob", 12
  row: "Alice", 16
end
