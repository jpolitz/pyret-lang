# Table literals synthesize precise schemas; annotations check them;
# schema types can be forgotten to the opaque Table.
students :: Table<{name :: String, age :: Number, favorite-color :: String}> =
  table: name, age, favorite-color
    row: "Bob", 12, "blue"
    row: "Alice", 17, "green"
    row: "Eve", 13, "red"
  end

# header annotations participate (cells are checked against them)
quizzes = table: label :: String, score :: Number
  row: "q1", 8
  row: "q2", 9
end

# a schema-typed table is still a Table
opaque :: Table = students

# row access: dot methods and bracket syntax
r = students.row-n(0)
r2 :: Row<{name :: String, age :: Number, favorite-color :: String}> = r
nm :: String = r["name"]
ag :: Number = r.get-value("age")

names :: List<String> = students.get-column("name")
n :: Number = students.length()

# type alias for a table type
type Students = Table<{name :: String, age :: Number, favorite-color :: String}>
also-students :: Students = students

check:
  nm is "Bob"
  ag is 12
  names.length() is 3
  n is 3
  quizzes.get-column("score") is [list: 8, 9]
end
