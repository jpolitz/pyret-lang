#|
   b2t2 example program: dotProduct.

   "This function computes the dot product of two columns in a table.  A type
    system should ensure that the columns are in the table and that the sorts
    of these columns describe numbers."

   Both properties are carried by the argument annotations:

     t   :: Table<S>            -- some table, schema S
     c1  :: Column<S, Number>   -- a column *of S* whose sort is Number
     c2  :: Column<S, Number>

   `Column<S, Number>` is exactly the b2t2 requirement "c is in header(t) and
   schema(t)[c] is a number", written as a type.  At each call site the
   checker looks the literal name up in the caller's schema and checks its
   sort; inside the body the annotation is what licenses `t.column(c1)` to
   have type `List<Number>`.
|#

import lists as L

fun dot-product<S>(t :: Table<S>, c1 :: Column<S, Number>, c2 :: Column<S, Number>) -> Number:
  products = L.map2(lam(x :: Number, y :: Number) -> Number: x * y end,
    t.column(c1), t.column(c2))
  L.fold(lam(acc :: Number, n :: Number) -> Number: acc + n end, 0, products)
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

quiz-corr :: Number = dot-product(gradebook, "quiz1", "quiz2")
mid-final :: Number = dot-product(gradebook, "midterm", "final")

# The same function also works on a table whose schema is only partly known,
# as long as the named column is one of the ones that *are* known.
fun any-table-dot<S>(t :: Table<S, {x :: Number, y :: Number}>) -> Number:
  dot-product(t, "x", "y")
end

points = table: label :: String, x :: Number, y :: Number
  row: "a", 1, 2
  row: "b", 3, 4
end

p :: Number = any-table-dot(points)
