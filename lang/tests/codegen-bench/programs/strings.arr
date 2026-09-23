fun build-string(n, acc):
  if n == 0: acc
  else: build-string(n - 1, acc + num-to-string(num-modulo(n, 10)))
  end
end

fun checksum(s):
  for fold(acc from 0, c from string-to-code-points(s)):
    num-modulo((acc * 31) + c, 1000000007)
  end
end

var total = 0
for each(k from range(0, 25)):
  s = build-string(20000, "")
  parts = string-split-all(string-repeat("abc,def,", 5000), ",")
  joined = parts.join-str("|")
  up = string-to-upper(joined)
  total := total + checksum(s) + string-length(up) + string-index-of(up, "DEF|ABC")
end
words = for map(i from range(0, 20000)): "w" + num-to-string(i) end
total := total + checksum(words.join-str(" "))
print("checksum: " + num-to-string(total) + "\n")
