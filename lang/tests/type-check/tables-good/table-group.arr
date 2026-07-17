# bootstrap core.arr group(), with type annotations added: builds a table
# whose second column contains sub-tables of the input
import lists as L
import sets as Sets

fun group<S, T>(tab :: Table<S>, col :: Col<S, T>) -> Table<{value :: T, subtable :: Table<S>}>:
  values = Sets.list-to-list-set(tab.get-column(col)).to-list()
  for L.fold(grouped from table: value, subtable end, v from values):
    grouped.stack(table: value, subtable
        row: v, tab.filter-by(col, lam(val): val == v end)
      end)
  end
end

jelly = table: get-acne, red, black
  row: true, false, false
  row: true, false, true
  row: false, false, true
end

g = group(jelly, "get-acne")
sub0 :: Table<{get-acne :: Boolean, red :: Boolean, black :: Boolean}> = g.row-n(0)["subtable"]
sub1 :: Table<{get-acne :: Boolean, red :: Boolean, black :: Boolean}> = g.row-n(1)["subtable"]
vals :: List<Boolean> = g.get-column("value")

check:
  g.length() is 2
  (sub0.length() + sub1.length()) is 3
  g.column-names() is [list: "value", "subtable"]
end
