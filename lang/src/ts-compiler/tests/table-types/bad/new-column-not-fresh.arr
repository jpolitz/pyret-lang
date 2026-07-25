#:expect already has a column named
fun add-flag<S, C>(t :: Table<S>, c :: NewColumn<S, C>) -> Table<S, {C; Boolean}>:
  t.build-column(c, lam(r): true end)
end
t = table: name :: String, age :: Number
  row: "Bob", 12
end
x = add-flag(t, "age")
