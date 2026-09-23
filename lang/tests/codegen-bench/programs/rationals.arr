fun harmonic(n):
  for fold(acc from 0, i from range(1, n + 1)): acc + (1 / i) end
end

fun leibniz(n):
  for fold(acc from 0, i from range(0, n)):
    term = 1 / ((2 * i) + 1)
    if num-modulo(i, 2) == 0: acc + term else: acc - term end
  end
end

h = harmonic(2000)
l = leibniz(1500)
fun digits(n): string-length(num-to-string(n)) end
total = digits(h) + digits(l)
  + num-floor(h * 1000) + num-floor(l * 1000)
print("checksum: " + num-to-string(total) + "\n")
