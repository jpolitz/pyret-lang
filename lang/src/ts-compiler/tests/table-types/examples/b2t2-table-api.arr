#|
   b2t2 Table API (section 5), expressed with Pyret's built-in table
   operations and checked with the new table types.

   The point of this file is that the api's *requires* / *ensures* clauses
   show up in the types:

     addColumn / buildColumn   requires "c is not in header(t1)"
                               ensures  "header(t2) = header(t1) ++ [c]"
       -> the argument type is NewColumn<S, C>, and the result type is
          Table<S, {C; Sort}>: a schema with one more column on the right.

     getColumn / selectColumns requires "c is in header(t)"
                               ensures  "the sort is schema(t)[c]"
       -> Column<S, C, Sort>, plus the `select` form, which computes the
          result schema exactly.

     tsort / head / selectRows ensures  "header(t2) = header(t1)"
       -> the result type is literally Table<S> again.
|#

import lists as L

type Students = Table<{name :: String, age :: Number, favorite-color :: String}>

students :: Students =
  table: name :: String, age :: Number, favorite-color :: String
    row: "Bob", 12, "blue"
    row: "Alice", 17, "green"
    row: "Eve", 13, "red"
  end

# --- addColumn -------------------------------------------------------------
# addColumn :: t1:Table * c:ColName * vs:Seq<Value> -> t2:Table
hair-color = [list: "brown", "red", "blonde"]

with-hair :: Table<Students, {hair-color :: String}> =
  students.add-column("hair-color", hair-color)

hairs :: List<String> = with-hair.column("hair-color")
still-names :: List<String> = with-hair.column("name")

# --- buildColumn -----------------------------------------------------------
# buildColumn :: t1:Table * c:ColName * f:(r:Row -> v:Value) -> t2:Table
is-teenager :: Table<Students, {is-teenager :: Boolean}> =
  students.build-column("is-teenager", lam(r :: Row<Students>) -> Boolean:
      (r["age"] >= 13) and (r["age"] <= 19)
    end)

teens :: List<Boolean> = is-teenager.column("is-teenager")

# --- getColumn -------------------------------------------------------------
ages :: List<Number> = students.get-column("age")

# --- selectColumns ---------------------------------------------------------
# Pyret's `select` form knows the names statically, so the result schema is
# computed exactly (rather than the sound-but-opaque `Table` that
# `.select-columns(a-list-of-strings)` has to return).
name-and-age :: Table<{name :: String, age :: Number}> =
  select name, age from students end

# --- dropColumns -----------------------------------------------------------
# `.drop` is given its precise result when the column name is a literal.
without-color :: Table<{name :: String, age :: Number}> = students.drop("favorite-color")

# --- renameColumns ---------------------------------------------------------
renamed :: Table<{name :: String, age :: Number, colour :: String}> =
  students.rename-column("favorite-color", "colour")

# --- tsort / orderBy -------------------------------------------------------
by-age :: Students = students.order-by("age", true)
by-age-syntax :: Students = order students: age ascending end

# --- selectRows / filter ---------------------------------------------------
adults :: Students = students.filter(lam(r :: Row<Students>) -> Boolean: r["age"] > 15 end)
adults2 :: Students = sieve students using age: age > 15 end

# --- update ----------------------------------------------------------------
older :: Students = transform students using age: age: age + 1 end

# --- head / nrows / header -------------------------------------------------
n-rows :: Number = students.length()
header :: List<String> = students.column-names()
first :: Row<Students> = students.row-n(0)
first-name :: String = first["name"]

# --- vcat (stack) ----------------------------------------------------------
doubled :: Students = students.stack(students)

# --- addRows ---------------------------------------------------------------
one-more :: Students = students.add-row(students.row-n(0))

# --- empty -----------------------------------------------------------------
nothing-yet :: Students = students.empty()

# --- selectColumns with a computed list -------------------------------------
# `.select-columns` takes a `List<String>`; when that list is written out
# literally the checker still computes the exact result schema, including the
# case where the element is a column-name *variable* (see b2t2-group-by.arr).
just-name :: Table<{name :: String}> = students.select-columns([list: "name"])
