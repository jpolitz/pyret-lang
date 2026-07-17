# The B2T2 API surface as methods: add-column, build-column,
# transform-column, drop, rename-column, select-columns, row/add-row, stack,
# filter, filter-by, order-by, empty
students = table: name, age, favorite-color
  row: "Bob", 12, "blue"
  row: "Alice", 17, "green"
  row: "Eve", 13, "red"
end

with-hair = students.add-column("hair-color", [list: "brown", "red", "blonde"])
hc :: List<String> = with-hair.get-column("hair-color")

with-old = students.build-column("age-in-5", lam(r): r["age"] + 5 end)
o :: List<Number> = with-old.get-column("age-in-5")

aged = students.transform-column("age", lam(a :: Number): num-to-string(a) end)
a2 :: List<String> = aged.get-column("age")

noage = students.drop("age")
n2 :: Table<{name :: String, favorite-color :: String}> = noage

renamed = students.rename-column("favorite-color", "color")
r2 :: List<String> = renamed.get-column("color")

sel = students.select-columns([list: "favorite-color", "name"])
s2 :: Table<{favorite-color :: String, name :: String}> = sel

grown = students.add-row(students.row("Ann", 21, "teal"))
stacked = students.stack(grown.empty())
kids = students.filter(lam(r): r["age"] < 15 end)
blues = students.filter-by("favorite-color", lam(c :: String): c == "blue" end)
by-age = students.order-by("age", true)

check:
  hc.length() is 3
  o is [list: 17, 22, 18]
  a2 is [list: "12", "17", "13"]
  noage.column-names() is [list: "name", "favorite-color"]
  r2 is [list: "blue", "green", "red"]
  sel.column-names() is [list: "favorite-color", "name"]
  grown.length() is 4
  stacked.length() is 3
  kids.length() is 2
  blues.length() is 1
  by-age.row-n(0)["name"] is "Bob"
end
