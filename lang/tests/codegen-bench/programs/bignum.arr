fun fact(n): if n == 0: 1 else: n * fact(n - 1) end end

fun fib(n):
  fun help(i, a, b):
    if i == n: a else: help(i + 1, b, a + b) end
  end
  help(0, 0, 1)
end

fun digit-sum(n, acc):
  for fold(a from acc, c from string-to-code-points(num-to-string(n))): a + (c - 48) end
end

fun digit-sum-div(n, acc):
  if n == 0: acc else: digit-sum-div(num-floor(n / 10), acc + num-remainder(n, 10)) end
end

var total = 0
for each(k from range(0, 12)):
  total := total + digit-sum(fact(1500 + k), 0)
end
total := total + digit-sum-div(fact(200), 0)
total := total + digit-sum(fib(5000), 0)
total := total + num-modulo(num-expt(3, 4000), 1000000007)
print("checksum: " + num-to-string(total) + "\n")
