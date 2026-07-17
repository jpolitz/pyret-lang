# Empty table literals get existential column sorts, solved from context
import lists as L
t :: Table<{a :: Number, b :: String}> = table: a, b end
t2 = table: a, b end.add-row(table: a, b row: 1, "x" end.row-n(0))
xs :: List<Number> = t2.get-column("a")

# rows carry their schema through lists
rows :: List<Row<{a :: Number, b :: String}>> = t2.all-rows()
firsts = L.map(lam(r :: Row<{a :: Number, b :: String}>): r["a"] end, rows)

check:
  t.length() is 0
  xs is [list: 1]
  firsts is [list: 1]
end
