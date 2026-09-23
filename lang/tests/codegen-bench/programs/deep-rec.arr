fun sum-to(n):
  if n == 0: 0 else: n + sum-to(n - 1) end
end

fun build(n):
  if n == 0: empty else: link(n, build(n - 1)) end
end

fun len(l):
  cases(List) l:
    | empty => 0
    | link(_, r) => 1 + len(r)
  end
end

fun sum-list(l):
  cases(List) l:
    | empty => 0
    | link(f, r) => f + sum-list(r)
  end
end

var total = 0
for each(i from range(0, 20)):
  total := total + sum-to(100000)
end
big = build(200000)
total := total + len(big) + sum-list(big)
print("checksum: " + num-to-string(total) + "\n")
