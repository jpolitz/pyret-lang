# Nothing is known about the columns of a bare `Table`, so its cells are Any.
fun f(t :: Table, c :: String) -> List<Number>:
  t.column(c)
end
