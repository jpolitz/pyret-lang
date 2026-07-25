# A plain String does not name a column, so it cannot appear in a result
# schema either.
fun bad<S>(t :: Table<S>, c :: String) -> Table<S, {n :: Number}>:
  t.build-column(c, lam(r): 1 end)
end
