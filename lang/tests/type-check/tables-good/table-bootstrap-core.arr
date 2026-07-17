# Typed versions of the table functions from the Bootstrap starter-files
# core.arr library (https://github.com/bootstrapworld/starter-files), with
# type annotations added. Functions whose types cannot be expressed (e.g.
# core.arr's count(), which renames a column to a *dynamic* name) are
# discussed in TYPED-TABLES.md.
import lists as L
import sets as Sets

fun sum(l :: List<Number>) -> Number:
  L.fold(lam(a :: Number, b :: Number): a + b end, 0, l)
end

# core.arr: shadow filter = lam(t, fn): t.filter(fn) end
fun filter-rows<S>(t :: Table<S>, fn :: (Row<S> -> Boolean)) -> Table<S>:
  t.filter(fn)
end

# core.arr: row-n
fun row-n<S>(t :: Table<S>, n :: Number) -> Row<S>:
  t.row-n(n)
end

# core.arr: stack-table / stack-tables
fun stack-table<S>(t1 :: Table<S>, t2 :: Table<S>) -> Table<S>:
  t1.stack(t2)
end
fun stack-tables<S>(ts :: List<Table<S>>) -> Table<S>:
  cases(List<Table<S>>) ts:
    | empty => raise("stack-tables: no tables")
    | link(f, r) =>
      L.fold(lam(base :: Table<S>, t :: Table<S>): base.stack(t) end, f, r)
  end
end

# core.arr: minimum / maximum / mean over a numeric column. In core.arr the
# "is this column numeric" test is dynamic (check-integrity); here it is the
# static Col<S, Number> requirement.
fun minimum<S>(t :: Table<S>, col :: Col<S, Number>) -> Number:
  vals = t.get-column(col)
  L.fold(num-min, vals.get(0), vals)
end
fun maximum<S>(t :: Table<S>, col :: Col<S, Number>) -> Number:
  vals = t.get-column(col)
  L.fold(num-max, vals.get(0), vals)
end
fun mean<S>(t :: Table<S>, col :: Col<S, Number>) -> Number:
  vals = t.get-column(col)
  sum(vals) / vals.length()
end

# core.arr: group(tab, col) — builds a table of sub-tables
fun group<S, T>(tab :: Table<S>, col :: Col<S, T>) -> Table<{value :: T, subtable :: Table<S>}>:
  values = Sets.list-to-list-set(tab.get-column(col)).to-list()
  for L.fold(grouped from table: value, subtable end, v from values):
    grouped.stack(table: value, subtable
        row: v, tab.filter-by(col, lam(val): val == v end)
      end)
  end
end

# B2T2-style count (fixed output column names; core.arr's dynamic
# rename-column variant is untypable — see the report)
fun count<S, T>(tab :: Table<S>, col :: Col<S, T>) -> Table<{value :: T, frequency :: Number}>:
  group(tab, col)
    .build-column("frequency", lam(r): r["subtable"].length() end)
    .drop("subtable")
end

animals = table: name, species, legs
  row: "Sasha", "cat", 4
  row: "Rex", "dog", 4
  row: "Tweety", "bird", 2
  row: "Milo", "cat", 4
end

cats = filter-rows(animals, lam(r): r["species"] == "cat" end)
counted = count(animals, "species")
freqs :: List<Number> = counted.get-column("frequency")
both = stack-tables([list: cats, filter-rows(animals, lam(r): r["legs"] == 2 end)])

check:
  cats.length() is 2
  row-n(animals, 0)["name"] is "Sasha"
  minimum(animals, "legs") is 2
  maximum(animals, "legs") is 4
  mean(animals, "legs") is 3.5
  counted.length() is 3
  sum(freqs) is 4
  both.length() is 3
  stack-table(cats, cats).length() is 4
end
