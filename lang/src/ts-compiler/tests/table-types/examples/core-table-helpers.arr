#|
   More functions adapted from /app/core.arr.  These are the ones the task
   singles out: "things like group() that take column names as arguments, or
   functions that append column names".

   core.arr's originals, and the types they now get:

     distinct-colors :: (t :: Table, col :: String) -> Table
       fun distinct-colors(t, col): t.build-column("_color", lam(r): ... end) end
       -->  <S, C, T> (Table<S>, Column<S, C, T>) -> Table<S, {_color; Color}>
       the result really is the input schema with one more column called
       "_color", and the type says so.

     sort :: (t :: Table, col :: String, asc :: Boolean) -> Table
       builds a temporary column, orders by it, and drops it again; the
       result must be the *original* schema, which the checker verifies by
       computing `S (+) tmp` and then `- tmp` back to `S`.

     build-column / transform-column
       -->  the "column must be fresh" and "column must exist" requirements
       become NewColumn<S, C> and Column<S, C, T>.

     find-by-id :: (t :: Table, id) -> Row
       looks up by the first column, whose name is not statically known --
       the honest type there uses the bare `Table`/`Row` and `Any`.

     predict-col :: (t, target-col, predictor) -> Table
       appends a "predicted" column computed from a whole row.
|#

import lists as L

# core.arr keeps a colour per distinct value; the colour itself is just a
# string here so the example does not need the image library.
type Color = String

fun distinct-colors<S, C, T>(t :: Table<S>, col :: Column<S, C, T>)
  -> Table<S, {_color :: Color}>:
  t.build-column("_color", lam(r :: Row<S>) -> Color:
      if r.get-value(col) == r.get-value(col): "blue" else: "red" end
    end)
end

# core.arr's `sort`, which sorts case-insensitively through a temporary
# column and then drops it.  The result type is the *input* schema: the
# checker follows `S` -> `S (+) tmp` -> `S`.
fun sort-by-string<S, C>(t :: Table<S>, col :: Column<S, C, String>, asc :: Boolean)
  -> Table<S>:
  t.build-column("tmp", lam(r :: Row<S>) -> String: string-to-lower(r.get-value(col)) end)
    .order-by("tmp", asc)
    .drop("tmp")
end

# core.arr's `build-column` / `transform-column` wrappers.
fun build-column<S, C, V>(t :: Table<S>, col :: NewColumn<S, C>, f :: (Row<S> -> V))
  -> Table<S, {C; V}>:
  t.build-column(col, f)
end

fun transform-column<S, C, V>(t :: Table<S>, col :: Column<S, C, V>, f :: (V -> V))
  -> Table<S>:
  t.transform-column(col, f)
end

# core.arr's `predict-col`: put the model's output next to the target column.
fun predict-col<S, C>(t :: Table<S>, target :: Column<S, C, Number>,
    predictor :: (Row<S> -> Number))
  -> Table<S, {predicted :: Number}, {error :: Number}>:
  with-prediction = t.build-column("predicted", predictor)
  with-prediction.build-column("error",
    lam(r :: Row<Table<S, {predicted :: Number}>>) -> Number:
      r["predicted"] - r.get-value(target)
    end)
end

# core.arr's `find-by-id` uses `t.column-names().get(0)`, a name that is only
# known at run time.  The type system says so: the row is a `Row` with
# unknown columns, and its cells are `Any`.
fun find-by-id(t :: Table, id :: Any) -> Row:
  id-col = t.column-names().get(0)
  t.filter(lam(r :: Row) -> Boolean: r[id-col] == id end).row-n(0)
end

# core.arr's `check-integrity`, unchanged in spirit: it works on any table.
fun check-integrity(t :: Table, cols :: List<String>) -> Boolean:
  t-cols = t.column-names()
  L.all(lam(c :: String) -> Boolean: L.member(t-cols, c) end, cols)
    and (t.length() > 0)
end

fun stack-tables<S>(ts :: List<Table<S>>) -> Table<S>:
  cases(List) ts:
    | empty => raise("stack-tables: no tables to stack")
    | link(f, r) =>
      L.fold(lam(base :: Table<S>, t :: Table<S>) -> Table<S>: base.stack(t) end, f, r)
  end
end

# --- using them ------------------------------------------------------------

type Pets = Table<{name :: String, age :: Number, weight :: Number}>

pets :: Pets =
  table: name :: String, age :: Number, weight :: Number
    row: "Sasha", 3, 45
    row: "Mia", 2, 8
    row: "Nori", 5, 22
  end

colored :: Table<Pets, {_color :: Color}> = distinct-colors(pets, "name")
colors :: List<Color> = colored.column("_color")

sorted :: Pets = sort-by-string(pets, "name", true)
sorted-names :: List<String> = sorted.column("name")

flagged :: Table<Pets, {heavy :: Boolean}> =
  build-column(pets, "heavy", lam(r :: Row<Pets>) -> Boolean: r["weight"] > 20 end)

doubled :: Pets = transform-column(pets, "weight", lam(w :: Number) -> Number: w * 2 end)

predicted :: Table<Pets, {predicted :: Number}, {error :: Number}> =
  predict-col(pets, "weight", lam(r :: Row<Pets>) -> Number: r["age"] * 9 end)

errors :: List<Number> = predicted.column("error")

row-with-id :: Row = find-by-id(pets, "Mia")
ok :: Boolean = check-integrity(pets, [list: "name", "age"])
all-pets :: Pets = stack-tables([list: pets, pets])
