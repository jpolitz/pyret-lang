# B2T2 brownGetAcne: built column named inconsistently with later use
jelly = table: name, get-acne, brown
  row: "Emily", true, false
end
t2 = jelly.build-column("part2", lam(r): r["brown"] and r["get-acne"] end)
x = t2.get-column("brown and get acne")
