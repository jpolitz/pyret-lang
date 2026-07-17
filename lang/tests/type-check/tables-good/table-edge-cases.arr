import lists as L

# abstract-schema generic helpers
fun col-count<S>(t :: Table<S>) -> Number:
  t.column-names().length()
end
fun first-col<S>(t :: Table<S>) -> Col<S>:
  t.column-names().get(0)
end

# checking mode: literal against an annotated return type
fun make-t() -> Table<{a :: Number, b :: String}>:
  table: a, b
    row: 1, "x"
  end
end

t = make-t()

# sieve with no using clause
all-rows = sieve t: true end

# transform where the using-bound column differs from the updated one
swapped = transform t using a:
  b: num-to-string(a)
end

check:
  col-count(t) is 2
  first-col(t) is "a"
  all-rows.length() is 1
  swapped.get-column("b") is [list: "1"]
end
