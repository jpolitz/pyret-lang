type Pet = Table<{name :: String, age :: Number}>
t :: Pet = table: name :: String, age :: Number
  row: "Mia", 2
end

r :: Row<Pet> = t.row-n(0)
n1 :: String = r["name"]
n2 :: String = r.get-value("name")
n3 :: Option<Number> = r.get("age")
names :: List<String> = r.get-column-names()

all :: List<Row<Pet>> = t.all-rows()
