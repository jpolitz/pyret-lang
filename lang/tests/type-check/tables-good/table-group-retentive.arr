# B2T2 groupByRetentive and count as typed user functions; count's result
# schema {value :: T, count :: Number} is computed by the checker
import lists as L
import sets as Sets

fun group-by-retentive<S, T>(t :: Table<S>, c :: Col<S, T>) -> Table<{key :: T, groups :: Table<S>}>:
  keys = Sets.list-to-list-set(t.get-column(c)).to-list()
  for L.fold(acc from table: key, groups end, k from keys):
    acc.add-row(acc.row(k, t.filter-by(c, lam(v): v == k end)))
  end
end

fun count<S, T>(t :: Table<S>, c :: Col<S, T>) -> Table<{value :: T, count :: Number}>:
  g = group-by-retentive(t, c)
  g.build-column("count", lam(r): r["groups"].length() end)
    .drop("groups")
    .rename-column("key", "value")
end

jelly = table: get-acne, red
  row: true, false
  row: true, false
  row: false, true
end

cnt = count(jelly, "get-acne")
vals :: List<Boolean> = cnt.get-column("value")
ns :: List<Number> = cnt.get-column("count")

check:
  cnt.length() is 2
  L.fold(lam(a :: Number, b :: Number): a + b end, 0, ns) is 3
  cnt.column-names() is [list: "value", "count"]
end
