# A `String` may be used as a column name; nothing is then known about the
# column, so its cells are `Any`. This is what keeps `core.arr`-style code
# (`col :: String`) type checking.
import lists as L

fun col-size(t :: Table, col :: String) -> Number:
  L.length(t.column(col))
end

t = table: name :: String, age :: Number
  row: "Bob", 12
end

n :: Number = col-size(t, "age")
cells :: List<Any> = t.column("name")

# the literal still gets checked when the schema is known
precise :: List<String> = t.column("name")
