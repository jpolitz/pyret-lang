import tables as T

gradebook = table: name, age, quiz1, quiz2
  row: "Bob", 12, 8, 9
  row: "Alice", 17, 6, 8
  row: "Eve", 13, 7, 9
end

# extend: computed columns get their expression's type appended
with-total = extend gradebook using quiz1, quiz2:
  total: quiz1 + quiz2
end
tot :: List<Number> = with-total.get-column("total")
wt :: Table<{name :: String, age :: Number, quiz1 :: Number, quiz2 :: Number, total :: Number}> =
  with-total

# extend with a reducer: the reducer's output sort is the new column's sort
with-run = extend gradebook using quiz1:
  running :: Number: T.running-sum of quiz1
end

# sieve: binds columns at their sorts, predicate must be Boolean
teens = sieve gradebook using age: age > 12 end
teens2 :: Table<{name :: String, age :: Number, quiz1 :: Number, quiz2 :: Number}> = teens

# order: column must exist; schema preserved
by-age = order gradebook: age descending end

# extract: List of the column's sort
names :: List<String> = extract name from gradebook end

# select: sub-schema in the selected order
small = select name, quiz2 from gradebook end
small2 :: Table<{name :: String, quiz2 :: Number}> = small

# transform: updated column takes the expression's type
aged = transform gradebook using age:
  age: num-to-string(age)
end
aged2 :: Table<{name :: String, age :: String, quiz1 :: Number, quiz2 :: Number}> = aged

check:
  tot is [list: 17, 14, 16]
  with-run.get-column("running") is [list: 8, 14, 21]
  teens.length() is 2
  by-age.row-n(0)["name"] is "Alice"
  names is [list: "Bob", "Alice", "Eve"]
  small.column-names() is [list: "name", "quiz2"]
  aged.get-column("age") is [list: "12", "17", "13"]
end
