#|
   b2t2 "Example Tables" (section 4 of the paper), written as Pyret table
   literals with explicit schemas.

   Column names that the paper writes with a space ("favorite color") become
   Pyret identifiers ("favorite-color"), which is the only shape Pyret's
   `table:` syntax allows.

   Missing cells (gradebookMissing) are written with Option, which is the
   choice the paper leaves to the implementor: the *sort* of such a column is
   `Option<Number>`, and the type system then forces every use to go through
   `cases`.

   A named schema is written as a table type -- `type Students = Table<{...}>`
   -- and then reused as `Table<Students>` / `Row<Students>`.
|#

provide *

import option as O

type Students = Table<{name :: String, age :: Number, favorite-color :: String}>

students :: Students =
  table: name :: String, age :: Number, favorite-color :: String
    row: "Bob", 12, "blue"
    row: "Alice", 17, "green"
    row: "Eve", 13, "red"
  end

type Gradebook = Table<{
  name :: String, age :: Number,
  quiz1 :: Number, quiz2 :: Number, midterm :: Number,
  quiz3 :: Number, quiz4 :: Number, final :: Number
}>

gradebook :: Gradebook =
  table: name :: String, age :: Number, quiz1 :: Number, quiz2 :: Number,
         midterm :: Number, quiz3 :: Number, quiz4 :: Number, final :: Number
    row: "Bob", 12, 8, 9, 77, 7, 9, 87
    row: "Alice", 17, 6, 8, 88, 8, 7, 85
    row: "Eve", 13, 7, 9, 84, 8, 8, 77
  end

# Empty cells become `none`, so those columns have an Option sort.
type GradebookMissing = Table<{
  name :: String, age :: Number,
  quiz1 :: Option<Number>, quiz2 :: Number, midterm :: Number,
  quiz3 :: Option<Number>, quiz4 :: Number, final :: Number
}>

gradebook-missing :: GradebookMissing =
  table: name :: String, age :: Number,
         quiz1 :: Option<Number>, quiz2 :: Number, midterm :: Number,
         quiz3 :: Option<Number>, quiz4 :: Number, final :: Number
    row: "Bob", 12, some(8), 9, 77, some(7), 9, 87
    row: "Alice", 17, some(6), 8, 88, none, 7, 85
    row: "Eve", 13, none, 9, 84, some(8), 8, 77
  end

# All-boolean, for the column-iterating examples.
type JellyAnon = Table<{
  get-acne :: Boolean, red :: Boolean, black :: Boolean, white :: Boolean,
  green :: Boolean, yellow :: Boolean, brown :: Boolean, orange :: Boolean,
  pink :: Boolean, purple :: Boolean
}>

jelly-anon :: JellyAnon =
  table: get-acne :: Boolean, red :: Boolean, black :: Boolean, white :: Boolean,
         green :: Boolean, yellow :: Boolean, brown :: Boolean, orange :: Boolean,
         pink :: Boolean, purple :: Boolean
    row: true,  false, false, false, true,  false, false, true,  false, false
    row: true,  false, true,  false, true,  true,  false, false, false, false
    row: false, false, false, false, true,  false, false, false, true,  false
  end

type JellyNamed = Table<{
  name :: String, get-acne :: Boolean, red :: Boolean, black :: Boolean,
  white :: Boolean, green :: Boolean
}>

jelly-named :: JellyNamed =
  table: name :: String, get-acne :: Boolean, red :: Boolean, black :: Boolean,
         white :: Boolean, green :: Boolean
    row: "Emily", true,  false, false, false, true
    row: "Jacob", true,  false, true,  false, true
    row: "Emma",  false, false, false, false, true
  end

type Employees = Table<{last-name :: String, department-id :: Number}>

employees :: Employees =
  table: last-name :: String, department-id :: Number
    row: "Rafferty", 31
    row: "Jones", 32
    row: "Heisenberg", 33
    row: "Robinson", 34
    row: "Smith", 34
  end

type Departments = Table<{department-id :: Number, department-name :: String}>

departments :: Departments =
  table: department-id :: Number, department-name :: String
    row: 31, "Sales"
    row: 33, "Engineering"
    row: 34, "Clerical"
    row: 35, "Marketing"
  end

# Reading a column gives back exactly the sort declared in the schema.
names :: List<String> = students.column("name")
ages :: List<Number> = students.column("age")
finals :: List<Number> = gradebook.column("final")
acne :: List<Boolean> = jelly-anon.column("get-acne")
dept-names :: List<String> = departments.column("department-name")

# A column with empty cells has an Option sort, so the missing case has to be
# handled before the number can be used.
fun quiz1-or-zero(r :: Row<GradebookMissing>) -> Number:
  cases(Option) r["quiz1"]:
    | none => 0
    | some(n) => n
  end
end

scored :: List<Number> =
  gradebook-missing.build-column("quiz1-score", quiz1-or-zero).column("quiz1-score")

# Every table type is a subtype of the bare `Table` annotation, which is the
# table whose columns are entirely unknown.
some-table :: Table = students
some-row :: Row = students.row-n(0)
