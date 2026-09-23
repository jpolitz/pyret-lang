fun sq(x): x * x end
fun rev(l): l.reverse() end

check "arith":
  for each(i from range(0, 3000)) block:
    sq(i) is i * i
    sq(i) + 1 is-not i * i
    (i * 2) / 2 is i
  end
end

check "lists":
  for each(i from range(0, 300)) block:
    rev(rev(range(0, i))) is range(0, i)
    range(0, i).length() is i
    map(lam(x): x + 1 end, range(0, i)) is range(1, i + 1)
  end
end

check "strings":
  for each(i from range(0, 2000)) block:
    string-length(string-repeat("a", i)) is i
    num-to-string(i) + "" is num-to-string(i)
  end
end
