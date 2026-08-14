data MutCar:
  | mpair(ref car, cdr)
end

# _match hands its fields to the handler through the same applier cases uses,
# with the mutable fields as the mask -- so a visitor sees the contents of a
# ref field, not the ref.
data MutBox:
  | mbox(ref v) with:
    method visit(self, visitor):
      self._match(visitor, lam(): raise("no branch for mbox") end)
    end
end

fun slow(n :: Number) -> Number:
  if n <= 0: 0 else: slow(n - 1) end
end

# A branch whose body needs more steps than inline-case-body-limit is compiled
# as its own function rather than inlined into the cases, which used to skip
# dereferencing the ref fields (and the checks on `ref` in the bindings).
fun big-branch-ref(m :: MutCar) -> String:
  cases(MutCar) m:
    | mpair(ref car, cdr) =>
      a = slow(1)
      b = slow(a)
      c = slow(b)
      d = slow(c)
      e = slow(d)
      f = slow(e)
      car + cdr
  end
end

fun big-branch-no-ref(m :: MutCar) -> String:
  cases(MutCar) m:
    | mpair(car, cdr) =>
      a = slow(1)
      b = slow(a)
      c = slow(b)
      d = slow(c)
      e = slow(d)
      f = slow(e)
      car + cdr
  end
end

check:
  m1 = mpair("a", "b")

  cases(MutCar) m1:
    | mpair(car, cdr) => car + cdr
  end raises "ref field"

  cases(MutCar) m1:
    | mpair(ref car, cdr) => car + cdr
  end is "ab"

  cases(MutCar) m1:
    | mpair(car, ref cdr) => car + cdr
  end raises "ref field"

  cases(MutCar) m1:
    | mpair(ref car, ref cdr) => car + cdr
  end raises "non-ref field"

  big-branch-ref(m1) is "ab"

  big-branch-no-ref(m1) raises "ref field"

  mbox(5).visit({ mbox: lam(x): x + 1 end }) is 6

end
