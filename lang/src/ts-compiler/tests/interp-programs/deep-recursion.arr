# Recursion depth: the machine's frames live on the heap, generated code's
# live on the runtime's segmented stack. Both must go equally deep.

fun sum-to(n):
  if n == 0: 0 else: n + sum-to(n - 1) end
end

fun count-down(n, acc):
  if n == 0: acc else: count-down(n - 1, acc + 1) end
end

# Mutual recursion in tail position: the machine reuses the frame here, so
# this is also a check that nothing observes the outgoing slots.
fun is-even(n): if n == 0: true else: is-odd(n - 1) end end
fun is-odd(n): if n == 0: false else: is-even(n - 1) end end

print(sum-to(100000))
print("\n")
print(count-down(1000000, 0))
print("\n")
print(is-even(500001))
print("\n")

check "deep recursion":
  sum-to(1000) is 500500
  count-down(1000, 0) is 1000
  is-odd(999) is true
end
