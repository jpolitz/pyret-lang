# A column name of one schema cannot be used on a table with a different
# schema unless that schema really has the column.
fun cross<S1, S2, C, T>(t2 :: Table<S2>, c :: Column<S1, C, T>) -> List<T>:
  t2.column(c)
end
