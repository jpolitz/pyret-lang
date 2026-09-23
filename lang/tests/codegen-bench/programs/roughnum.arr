fun integrate(f, a, b, n):
  h = (b - a) / n
  for fold(acc from ~0, i from range(0, n)):
    x = a + ((i + 0.5) * h)
    acc + (f(x) * h)
  end
end

fun newton-sqrt(x):
  fun go(g, k):
    if k == 0: g else: go((g + (x / g)) / 2, k - 1) end
  end
  go(~1, 30)
end

var total = ~0
for each(k from range(0, 12)) block:
  total := total + integrate(lam(x): num-sin(x) * num-exp(num-sqrt(x)) end, ~0, ~3, 40000)
  total := total + newton-sqrt(num-to-roughnum(k + 2))
end
print("checksum: " + num-to-string-digits(total, 6) + "\n")
