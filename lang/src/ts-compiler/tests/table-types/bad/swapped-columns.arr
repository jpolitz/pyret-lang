# b2t2 Errors: "swappedColumns". The rows disagree with the schema on the
# ordering of the first two columns.
t = table: name :: String, age :: Number, favorite-color :: String
  row: 12, "Bob", "blue"
  row: 17, "Alice", "green"
end
