import tables as T
t = table: name :: String
  row: "Bob"
end
x = extend t using name:
  total: T.running-sum of name
end
