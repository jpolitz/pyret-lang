import lists as L

xs = range(0, 50000)
var total = 0
for each(k from range(0, 20)):
  ys = map(lam(x): (x * 3) + k end, xs)
  zs = filter(lam(x): num-modulo(x, 2) == 0 end, ys)
  s = fold(lam(acc, x): acc + x end, 0, zs)
  m = for fold(acc from 0, x from zs): num-max(acc, x) end
  total := total + s + m + zs.length()
end
ws = L.foldl(lam(acc, x): acc + x end, 0, map2(lam(a, b): a * b end, xs, xs))
print("checksum: " + num-to-string(total + ws) + "\n")
