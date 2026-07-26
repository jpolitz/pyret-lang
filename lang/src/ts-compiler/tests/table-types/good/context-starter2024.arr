use context starter2024

# Regression: under `use context ...` the table type names arrive as
# context-bound aliases rather than as the builtin globals, so a schema-carrying
# annotation used to be rejected with "Table expected 0 type arguments, but it
# received 1".  `core.arr`-style code is exactly the code that runs under a
# context, so every table annotation form is exercised here.

fun mk<S, C>(t :: Table<S>, c :: NewColumn<S, C>) -> Table<S, {C; Number}>:
  t.build-column(c, lam(_ :: Row<S>) -> Number: 7 end)
end

fun mean-of<S>(t :: Table<S>, col :: Column<S, Number>) -> Number:
  nums = t.get-column(col)
  cases(List) nums:
    | empty => 0
    | link(_, _) => nums.foldl(lam(n, acc): n + acc end, 0) / nums.length()
  end
end

fun first-name<S>(r :: Row<S>, col :: Column<S, String>) -> String:
  r.get-value(col)
end

animals = table: name :: String, age :: Number
  row: "Sasha", 3
  row: "Cricket", 5
end

extended = mk(animals, "z")
avg = mean-of(animals, "age")
nm = first-name(animals.row-n(0), "name")
