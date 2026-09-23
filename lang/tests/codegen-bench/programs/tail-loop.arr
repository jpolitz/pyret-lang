fun loop(i, n, acc):
  if i == n: acc
  else: loop(i + 1, n, acc + (i * i))
  end
end

fun count-down(n, acc):
  if n <= 0: acc else: count-down(n - 1, acc + 3) end
end

var total = 0
for each(k from range(0, 10)):
  total := total + loop(0, 300000, k)
end
total := total + count-down(2000000, 0)
print("checksum: " + num-to-string(total) + "\n")
