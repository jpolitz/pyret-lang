# The result type claims the appended column is called "flag", but the name
# actually comes from the argument. Rejecting this is what keeps the
# name-carrying result types sound.
fun add-flag<S>(t :: Table<S>, c :: NewColumn<S>) -> Table<S, {flag :: Boolean}>:
  t.build-column(c, lam(r): true end)
end
