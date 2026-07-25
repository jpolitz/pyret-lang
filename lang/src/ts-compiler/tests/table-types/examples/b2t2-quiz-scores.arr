#|
   b2t2 example programs: quizScoreSelect and quizScoreFilter.

   quizScoreSelect "appends the column name quiz to a few integer suffixes and
   selects these computed columns from the gradebook".  Manufactured names are
   the hard part: `"quiz" + num-to-string(i)` is just a `String`, and a
   `String` carries no information about which column it is.  So:

     * the *selection* is written with literal names, which the checker
       resolves exactly (this is quizScoreSelect with the name arithmetic
       unrolled -- the "variance" the benchmark asks implementations to
       document);

     * the version that really manufactures names still type checks, but
       every cell it reads has sort `Any`, which the program then has to
       narrow itself.  That is the honest answer: nothing is assumed.

   quizScoreFilter "iterates through all column names and filters the ones
   that begin with quiz".  Same story: the filtered names are Strings, so the
   typed version below narrows the table with `select` first and then works
   with a fully known schema.
|#

import lists as L

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

type Quizzes = Table<{quiz1 :: Number, quiz2 :: Number, quiz3 :: Number, quiz4 :: Number}>

fun average(l :: List<Number>) -> Number:
  if L.length(l) == 0: 0 else: L.fold(lam(a :: Number, b :: Number) -> Number: a + b end, 0, l) / L.length(l) end
end

# --- quizScoreSelect (names known statically) ------------------------------
quizzes :: Quizzes = select quiz1, quiz2, quiz3, quiz4 from gradebook end

# every quiz column is a Number, so the row-wise average needs no casts
quiz-averages :: Table<Gradebook, {quiz-average :: Number}> =
  gradebook.build-column("quiz-average", lam(r :: Row<Gradebook>) -> Number:
      average([list: r["quiz1"], r["quiz2"], r["quiz3"], r["quiz4"]])
    end)

averages :: List<Number> = quiz-averages.column("quiz-average")

# The same thing again with the `extend` form, which binds the columns it uses
# and checks that each one exists and has the sort the body assumes.
quiz-averages2 :: Table<Gradebook, {quiz-average :: Number}> =
  extend gradebook using quiz1, quiz2, quiz3, quiz4:
    quiz-average: average([list: quiz1, quiz2, quiz3, quiz4])
  end

# and column-wise, since the selected table is homogeneous
per-quiz-averages :: List<Number> = L.map(average, quizzes.all-columns())

# --- quizScoreFilter (names manufactured at run time) ----------------------
# `t.column(c)` for a computed `c :: String` is `List<Any>`: the checker knows
# nothing about a name it cannot see.  Everything downstream must therefore
# handle `Any` explicitly, which is exactly the loss of information the
# benchmark is probing for.
fun quiz-column-names(t :: Table) -> List<String>:
  L.filter(lam(c :: String) -> Boolean: string-index-of(c, "quiz") == 0 end,
    t.column-names())
end

manufactured :: List<String> = quiz-column-names(gradebook)

# The cells really are `Any` here, so any numeric use has to be recovered
# explicitly by the program; the type system will not do it silently.
dynamic-quiz-cells :: List<List<Any>> =
  L.map(lam(c :: String) -> List<Any>: gradebook.column(c) end, manufactured)

dynamic-quiz-sizes :: List<Number> =
  L.map(lam(col :: List<Any>) -> Number: L.length(col) end, dynamic-quiz-cells)
