import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err
errs = TC.errs

check "equality operators work across types":
  msgs("b :: Boolean = 1 == 'a'") is empty
  msgs("b :: Boolean = {x: 1} == {y: 2}") is empty
  msgs("b :: Boolean = 1 <> 2") is empty
  "n :: Number = 1 == 2" is%(tc-err) CS.is-type-mismatch
end

check "raise and error paths accept any payload":
  msgs("fun f(n :: Number) -> Number: if n > 0: n else: raise('bad') end end") is empty
  msgs("fun f(n :: Number) -> Number: if n > 0: n else: raise({code: 12}) end end") is empty
end

check "spy is checked":
  msgs("x = 5\nspy: x end\nx") is empty
  "spy: missing end" is%(tc-err) CS.is-unbound-id
end

check "checking stops at the first error in a block":
  errs("a :: Boolean = 5\nb :: String = true\nc :: Number = 'hello'").length() is 1
end

check "torepr and tostring":
  msgs("s :: String = torepr({x: 5})") is empty
  msgs("s :: String = tostring([list: 1])") is empty
  "n :: Number = torepr(5)" is%(tc-err) CS.is-type-mismatch
end

check "check and where blocks are type-checked too":
  msgs("check: 1 + 1 is 2 end") is empty
  "check: 1 + 'a' is 'wat' end" is%(tc-err) CS.is-type-mismatch
  "fun f(x :: Number) -> Number: x where: f('a') is 'b' end" is%(tc-err) CS.is-type-mismatch
end
