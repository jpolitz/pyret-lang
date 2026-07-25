#:expect There is no column named "nope"
t = table: name :: String, age :: Number
  row: "Bob", 12
end
x = transform t using age: nope: 1 end
