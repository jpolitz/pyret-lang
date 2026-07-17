import tables as T

quizzes = table: score
  row: 3
  row: 9
  row: 6
end

# .reduce with a builtin reducer: result is the reducer's output sort
mx :: Number = quizzes.reduce("score", T.running-max)

# opaque tables: schema-typed tables can be forgotten, and loose methods
# still work (with loose types)
fun takes-any-table(t :: Table) -> Number:
  t.length()
end

n = takes-any-table(quizzes)
opaque :: Table = quizzes.drop("score")
r :: Row = quizzes.row-n(0)
v = r.get-value("score")   # Any on an opaque row

check:
  mx is 9
  n is 3
  quizzes.reduce("score", T.running-sum) is 18
end
