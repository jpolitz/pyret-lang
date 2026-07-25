# A function that appends a column, expressed once and used at several schemas.
fun with-index<S>(t :: Table<S>) -> Table<S, {idx :: Number}>:
  t.build-column("idx", lam(r :: Row<S>) -> Number: 0 end)
end

a = table: x :: Number row: 1 end
b = table: p :: String, q :: Boolean row: "s", true end

ai :: Table<{x :: Number}, {idx :: Number}> = with-index(a)
bi :: Table<{p :: String, q :: Boolean}, {idx :: Number}> = with-index(b)

xs :: List<Number> = ai.column("x")
idx :: List<Number> = bi.column("idx")

# ... and removed again
back :: Table<{x :: Number}> = with-index(a).drop("idx")
