#:expect already has a column named
t = table: name :: String, age :: Number
  row: "Bob", 12
end
x = extend t using age:
  age: age + 1
end
