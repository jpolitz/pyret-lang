#:expect does not have a column named "nope"
fun col-sum<S>(t :: Table<S>, col :: Column<S, Number>) -> List<Number>:
  t.column(col)
end
t = table: name :: String, age :: Number
  row: "Bob", 12
end
x = col-sum(t, "nope")
