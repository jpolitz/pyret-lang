# Upvalue capture. The machine copies free variables into a closure when it
# is built, which is only sound because every ANF binding is assigned once
# and Pyret's mutable bindings are cells. These are the cases that would
# break if that were wrong.

fun make-counter():
  var n = 0
  {
    method incr(self) block:
      n := n + 1
      n
    end,
    method get(self): n end
  }
end

fun make-adders(k):
  # Each lambda captures a different binding of i.
  map(lam(i): lam(x): x + i + k end end, range(0, 5))
end

# Mutual recursion: `fun` binds by letrec, so `f`'s closure is built before
# the cell holding `g` has been filled in. The machine captures cells, not
# their contents, which is what makes that work.
fun late-bound():
  fun f(x): if x == 0: 0 else: g(x - 1) end end
  fun g(x): f(x) + 1 end
  f(5)
end

c = make-counter()
c.incr()
c.incr()
c.incr()
print(c.get())
print("\n")
print(map(lam(f): f(10) end, make-adders(100)))
print("\n")
print(late-bound())
print("\n")

check "closures":
  c2 = make-counter()
  c2.get() is 0
  c2.incr() is 1
  c2.get() is 1
  map(lam(f): f(0) end, make-adders(0)) is [list: 0, 1, 2, 3, 4]
  late-bound() is 5
end
