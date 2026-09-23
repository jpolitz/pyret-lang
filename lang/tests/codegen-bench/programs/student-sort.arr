# Student-style: several sorting algorithms over lists, checked against each other.

fun insert-sorted(x :: Number, l :: List<Number>) -> List<Number>:
  cases(List) l:
    | empty => [list: x]
    | link(f, r) =>
      if x <= f: link(x, l)
      else: link(f, insert-sorted(x, r))
      end
  end
end

fun insertion-sort(l :: List<Number>) -> List<Number>:
  cases(List) l:
    | empty => empty
    | link(f, r) => insert-sorted(f, insertion-sort(r))
  end
end

fun merge(a :: List<Number>, b :: List<Number>) -> List<Number>:
  cases(List) a:
    | empty => b
    | link(fa, ra) =>
      cases(List) b:
        | empty => a
        | link(fb, rb) =>
          if fa <= fb: link(fa, merge(ra, b))
          else: link(fb, merge(a, rb))
          end
      end
  end
end

fun merge-sort(l :: List<Number>) -> List<Number>:
  n = l.length()
  if n <= 1: l
  else:
    half = num-floor(n / 2)
    merge(merge-sort(l.take(half)), merge-sort(l.drop(half)))
  end
end

fun quick-sort(l :: List<Number>) -> List<Number>:
  cases(List) l:
    | empty => empty
    | link(pivot, r) =>
      smaller = r.filter(lam(x): x < pivot end)
      larger = r.filter(lam(x): x >= pivot end)
      quick-sort(smaller).append([list: pivot]).append(quick-sort(larger))
  end
end

fun pseudo-random(n :: Number) -> List<Number>:
  for map(i from range(0, n)):
    num-modulo((i * 1103515245) + 12345, 65536)
  end
end

fun weighted(l :: List<Number>) -> Number:
  for fold2(acc from 0, x from l, i from range(0, l.length())):
    num-modulo(acc + (x * (i + 1)), 1000000007)
  end
end

data1 = pseudo-random(1500)
data2 = pseudo-random(20000)
a = insertion-sort(data1)
b = merge-sort(data2)
c = quick-sort(data2)
when not(b == c): raise("sorts disagree") end
print("checksum: " + num-to-string(weighted(a) + weighted(b) + weighted(c) + weighted(data2.sort())) + "\n")
