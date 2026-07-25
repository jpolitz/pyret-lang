#:expect already has a column named
t = table: name :: String, age :: Number
  row: "Bob", 12
end
x = t.build-column("age", lam(r): 0 end)
