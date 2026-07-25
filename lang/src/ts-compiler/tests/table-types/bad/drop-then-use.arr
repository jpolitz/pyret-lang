#:expect does not have a column named "age"
t = table: name :: String, age :: Number
  row: "Bob", 12
end
x = t.drop("age").column("age")
