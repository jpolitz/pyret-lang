#:expect There is no column named "nope"
t = table: name :: String, age :: Number
  row: "Bob", 12
end
x = t.select-columns([list: "name", "nope"])
