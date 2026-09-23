fun fib(n):
  for fold(acc from {0; 1}, i from range(0, n)): {acc.{1}; acc.{0} + acc.{1}} end.{0}
end
for each(i from range(0, 5)): fib(20000) end
print(string-length(num-to-string(fib(20000))))
