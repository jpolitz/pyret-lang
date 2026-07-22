import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err

check "variable assignment":
  msgs("var x = 5\nx := 6") is empty
  msgs("var x :: Number = 5\nx := 6\nn :: Number = x") is empty
  "var x :: Number = 5\nx := 'a'" is%(tc-err) CS.is-type-mismatch
  "var x :: Number = 'a'" is%(tc-err) CS.is-type-mismatch
end

check "unannotated vars get their initializer's type":
  msgs("var x = 5\nn :: Number = x") is empty
  "var x = 5\nx := 'a'" is%(tc-err) CS.is-type-mismatch
end

check "vars inside functions":
  msgs(```
fun counter() -> ( -> Number) block:
  var n = 0
  lam() block:
    n := n + 1
    n
  end
end
counter()()
```) is empty
  ```
fun f() -> Number block:
  var n = 0
  n := 'a'
  n
end
``` is%(tc-err) CS.is-type-mismatch
end
