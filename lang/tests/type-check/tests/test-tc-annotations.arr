import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err

check "basic annotations":
  msgs("x :: Number = 5") is empty
  msgs("x :: String = 'a'") is empty
  msgs("x :: Boolean = true") is empty
  msgs("x :: Any = 5") is empty
  msgs("x :: Nothing = nothing") is empty
  "x :: Number = 'a'" is%(tc-err) CS.is-type-mismatch
  "x :: Nothing = 5" is%(tc-err) CS.is-type-mismatch
end

check "annotations flow through let bindings":
  msgs("x :: Number = 5\ny :: Number = x") is empty
  "x = 5\ny :: String = x" is%(tc-err) CS.is-type-mismatch
end

check "Any is a distinct static type, but let bindings keep the precise type":
  msgs("x :: Any = 5\ny :: Number = x") is empty
  "x :: Any = 'a'\ny :: Number = x" is%(tc-err) CS.is-type-mismatch
  "fun f(x :: Any) -> Number: x end" is%(tc-err) CS.is-type-mismatch
  msgs("fun f(x :: Any) -> Any: x end\nf(5)") is empty
end

check "type aliases":
  msgs("type N = Number\nx :: N = 5") is empty
  msgs("type Pair = {Number; Number}\np :: Pair = {1; 2}") is empty
  "type N = Number\nx :: N = 'a'" is%(tc-err) CS.is-type-mismatch
end

check "parameterized type aliases":
  msgs("type MyList<A> = List<A>\nl :: MyList<Number> = [list: 1]") is empty
  msgs("type Pairs<A> = List<{A; A}>\np :: Pairs<Number> = [list: {1; 2}]") is empty
  "type MyList<A> = List<A>\nl :: MyList<Number> = [list: 'a']" is%(tc-err) CS.is-type-mismatch
  msgs("type MyList<A> = List<A>\nl :: MyList = [list: 1]") is empty
  "l :: List = [list: 1]" is%(tc-err) CS.is-type-mismatch
end

check "predicate refinements":
  msgs("fun is-small(n :: Number) -> Boolean: n < 10 end\nx :: Number%(is-small) = 5") is empty
  msgs("fun is-small(n :: Number) -> Boolean: n < 10 end\nfun f(x :: Number%(is-small)) -> Number: x + 1 end\nf(3)") is empty
  "fun is-yes(s :: String) -> Boolean: s == 'yes' end\nx :: Number%(is-yes) = 5" is%(tc-err) CS.is-type-mismatch
  "not-a-pred = 5\nx :: Number%(not-a-pred) = 5" is%(tc-err) CS.is-type-mismatch
end

check "unbound type names":
  "x :: Wat = 5" is%(tc-err) CS.is-unbound-type-id
  "fun f(x :: Wat) -> Number: 5 end" is%(tc-err) CS.is-unbound-type-id
end

check "arrow annotations":
  msgs("f :: (Number, Number -> Number) = lam(x, y): x + y end") is empty
  msgs("f :: ( -> Number) = lam(): 5 end\nn :: Number = f()") is empty
  "f :: ( -> Number) = lam(): 'a' end" is%(tc-err) CS.is-type-mismatch
  "f :: (Number -> Number) = 5" is%(tc-err) CS.is-type-mismatch
end
