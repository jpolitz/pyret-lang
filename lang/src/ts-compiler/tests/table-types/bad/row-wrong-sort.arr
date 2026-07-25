t = table: name :: String, age :: Number
  row: "Bob", 12
end
x = t.build-column("bad", lam(r :: Row<{name :: String, age :: Number}>) -> Number:
    r["name"] + 1
  end)
