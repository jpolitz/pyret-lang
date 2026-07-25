t = table: a :: Number
  row: 1
end
u = extend t using a: b: "s" end
x :: List<Number> = u.column("b")
