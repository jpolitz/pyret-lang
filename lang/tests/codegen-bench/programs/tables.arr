import tables as T

fun make-rows(n):
  for fold(t from table: id, x, name end, i from range(0, n)):
    t.add-row(t.row(i, num-modulo(i * 7919, 1000), "n" + num-to-string(num-modulo(i, 50))))
  end
end

var total = 0
for each(k from range(0, 6)) block:
  t = make-rows(3000)
  big = t.filter(lam(r): r["x"] > 500 end)
  sorted = big.order-by("x", true)
  xs = sorted.get-column("x")
  total := total + fold(lam(a, b): a + b end, 0, xs) + sorted.length()
  added = t.build-column("y", lam(r): r["x"] * 2 end)
  total := total + fold(lam(a, b): a + b end, 0, added.get-column("y"))
end
print("checksum: " + num-to-string(total) + "\n")
