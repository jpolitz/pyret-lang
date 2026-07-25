# Every table type is below the bare `Table`; schemas are covariant in their
# sorts (cells are immutable) and invariant in their names and order.
t :: Table<{a :: Number, b :: String}> =
  table: a :: Number, b :: String
    row: 1, "x"
  end

widened :: Table<{a :: Any, b :: Any}> = t
opaque :: Table = t
r :: Row<{a :: Number, b :: String}> = t.row-n(0)
opaque-row :: Row = r

fun takes-any-table(u :: Table) -> Number: u.length() end
n :: Number = takes-any-table(t)

# an opaque table still answers the questions that do not need a schema
cols :: List<String> = opaque.column-names()
rows :: Number = opaque.length()
cell :: Any = opaque.row-n(0)["a"]
