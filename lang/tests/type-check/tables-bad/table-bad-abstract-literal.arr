# a literal column name cannot be verified against an abstract schema
fun bad<S>(t :: Table<S>) -> Number:
  t.get-column("age").length()
end
