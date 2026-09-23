fun grow(p, n): if n == 0: p else: grow(p * 1.05, n - 1) end end
print(string-length(num-to-string(grow(1000, 600))))
