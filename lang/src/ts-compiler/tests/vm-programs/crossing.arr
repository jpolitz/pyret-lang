# The JS-land boundary: interpreted code calling a builtin that calls back
# into interpreted code, in both directions and several layers deep. Every
# one of these crossings is where the machine has to be able to hand its
# stack to the runtime's trampoline and get it back.

fun compose(f, g): lam(x): f(g(x)) end end

fun apply-n(f, n, x):
  if n == 0: x else: apply-n(f, n - 1, f(x)) end
end

l = range(0, 2000)

# fold/map/filter are builtins; the lambdas are interpreted.
doubled = map(lam(x): x * 2 end, l)
evens = filter(lam(x): num-modulo(x, 4) == 0 end, doubled)
total = fold(lam(acc, x): acc + x end, 0, evens)

# Sorting calls an interpreted comparator from JS.
sorted = range(0, 200).sort-by(lam(a, b): a > b end, lam(a, b): a == b end)

print(total)
print("\n")
print(sorted.first)
print("\n")
print(apply-n(compose(lam(x): x + 1 end, lam(x): x * 2 end), 10, 1))
print("\n")

check "crossing the boundary":
  fold(lam(acc, x): acc + x end, 0, [list: 1, 2, 3]) is 6
  map(lam(x): x end, empty) is empty
  apply-n(lam(x): x + 1 end, 100, 0) is 100
  [list: 3, 1, 2].sort() is [list: 1, 2, 3]
  [list: 1, 2, 3].sort-by(lam(a, b): a > b end, lam(a, b): a == b end)
    is [list: 3, 2, 1]
end
