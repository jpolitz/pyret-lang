# Student-style: count N-queens solutions with lists.

fun safe(q :: Number, qs :: List<Number>, d :: Number) -> Boolean:
  cases(List) qs:
    | empty => true
    | link(f, r) =>
      (f <> q) and (num-abs(f - q) <> d) and safe(q, r, d + 1)
  end
end

fun place(n :: Number, k :: Number, qs :: List<Number>) -> Number:
  if k == n: 1
  else:
    for fold(acc from 0, q from range(0, n)):
      if safe(q, qs, 1): acc + place(n, k + 1, link(q, qs))
      else: acc
      end
    end
  end
end

results = for map(n from range(4, 11)): place(n, 0, empty) end
print("checksum: " + num-to-string(fold(lam(a, b): (a * 1000) + b end, 0, results)) + "\n")
