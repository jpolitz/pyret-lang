import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err

check "argument types inferred from where-block examples":
  msgs(```
fun add(x, y):
  x + y
where:
  add(1, 2) is 3
end
n :: Number = add(1, 2)
```) is empty
  msgs(```
fun shout(s):
  s + '!'
where:
  shout('hey') is 'hey!'
end
s :: String = shout('ho')
```) is empty
  ```
fun add(x, y):
  x + y
where:
  add(1, 2) is 3
end
add('a', 'b')
``` is%(tc-err) CS.is-type-mismatch
end

check "examples at two types generalize to a polymorphic function":
  msgs(```
fun my-map(g, xs):
  cases(List) xs:
    | link(first, rest) => link(g(first), my-map(g, rest))
    | empty => empty
  end
where:
  my-map(lam(x :: Number): x + 1 end, [list: 1]) is [list: 2]
  my-map(lam(x :: String): x end, [list: 'a']) is [list: 'a']
end
l :: List<Number> = my-map(lam(x :: Number): x + 1 end, [list: 1])
l2 :: List<String> = my-map(lam(x :: String): x end, [list: 'b'])
```) is empty
end

check "examples contradicting the body are not caught (they fail at runtime instead)":
  msgs(```
fun add(x, y):
  x + y
where:
  add('a', 2) is 3
end
```) is empty
end

check "where-block examples must match declared types":
  "fun f() -> Number: 0 where: f() is false end" is%(tc-err) CS.is-type-mismatch
  "fun f() -> Number: 0 where: f(1) is 0 end" is%(tc-err) CS.is-incorrect-number-of-args
end

check "record shapes inferred from examples":
  msgs(```
fun get-a(o):
  o.a
where:
  get-a({a: 1}) is 1
end
n :: Number = get-a({a: 5, b: 6})
```) is empty
end

check "partial annotations leave the rest to examples":
  msgs(```
fun scale(factor :: Number, v):
  factor * v
where:
  scale(2, 3) is 6
end
n :: Number = scale(4, 5)
```) is empty
end
