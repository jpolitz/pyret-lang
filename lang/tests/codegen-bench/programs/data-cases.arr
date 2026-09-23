data Tree:
  | leaf
  | node(l :: Tree, v :: Number, r :: Tree)
end

fun insert(t, v):
  cases(Tree) t:
    | leaf => node(leaf, v, leaf)
    | node(l, x, r) =>
      if v < x: node(insert(l, v), x, r)
      else if v > x: node(l, x, insert(r, v))
      else: t
      end
  end
end

fun member(t, v):
  cases(Tree) t:
    | leaf => false
    | node(l, x, r) =>
      if v < x: member(l, v) else if v > x: member(r, v) else: true end
  end
end

fun tsum(t):
  cases(Tree) t:
    | leaf => 0
    | node(l, x, r) => tsum(l) + x + tsum(r)
  end
end

data Expr:
  | num-e(n)
  | add-e(a, b)
  | mul-e(a, b)
  | neg-e(a)
end

fun eval(e):
  cases(Expr) e:
    | num-e(n) => n
    | add-e(a, b) => eval(a) + eval(b)
    | mul-e(a, b) => num-modulo(eval(a) * eval(b), 1000003)
    | neg-e(a) => 0 - eval(a)
  end
end

fun mk(d, s):
  if d == 0: num-e(s)
  else if num-modulo(s, 3) == 0: add-e(mk(d - 1, s + 1), mk(d - 1, s + 2))
  else if num-modulo(s, 3) == 1: mul-e(mk(d - 1, s + 3), mk(d - 1, s * 2))
  else: neg-e(mk(d - 1, s + 5))
  end
end

var t = leaf
for each(i from range(0, 20000)):
  t := insert(t, num-modulo(i * 7919, 50021))
end
hits = for fold(acc from 0, i from range(0, 20000)):
  if member(t, i): acc + 1 else: acc end
end
e = mk(17, 1)
print("checksum: " + num-to-string(tsum(t) + hits + eval(e) + eval(e)) + "\n")
