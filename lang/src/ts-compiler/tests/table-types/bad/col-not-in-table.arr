#:expect does not have a column named "agee"
t = table: name :: String, age :: Number
  row: "Bob", 12
end
x = t.column("agee")
