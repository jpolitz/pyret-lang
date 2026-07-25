# The declared result schema has no room for the appended column.
fun bad<S>(t :: Table<S>) -> Table<S>:
  t.build-column("extra", lam(r): 1 end)
end
