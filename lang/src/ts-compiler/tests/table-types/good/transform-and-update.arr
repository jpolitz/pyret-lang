t = table: name :: String, age :: Number
  row: "Bob", 12
end

# `transform` may change a column's sort
as-string :: Table<{name :: String, age :: String}> =
  transform t using age: age: tostring(age) end

# the method version keeps the sort
older :: Table<{name :: String, age :: Number}> =
  t.transform-column("age", lam(n :: Number) -> Number: n + 1 end)

s :: List<String> = as-string.column("age")
