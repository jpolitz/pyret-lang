import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err

check "annotated functions":
  msgs("fun f(x :: Number) -> Number: x + 1 end\nf(41)") is empty
  msgs("fun f(x :: Number, y :: String) -> String: tostring(x) + y end\nf(1, 'a')") is empty
  "fun f(x :: Number) -> Number: x + 1 end\nf('a')" is%(tc-err) CS.is-type-mismatch
  "fun f(x :: Number) -> String: x + 1 end" is%(tc-err) CS.is-type-mismatch
  "fun f(x :: Number) -> Number: x end\nx :: String = f(1)" is%(tc-err) CS.is-type-mismatch
end

check "arity":
  "fun f(x :: Number) -> Number: x end\nf(1, 2)" is%(tc-err) CS.is-incorrect-number-of-args
  "fun f(x :: Number, y :: Number) -> Number: x end\nf(1)" is%(tc-err) CS.is-incorrect-number-of-args
  "fun f() -> Number: 5 end\nf(1)" is%(tc-err) CS.is-incorrect-number-of-args
end

check "applying non-functions":
  "5(3)" is%(tc-err) CS.is-apply-non-function
  "'a'(3)" is%(tc-err) CS.is-apply-non-function
  "{x: 5}.x(3)" is%(tc-err) CS.is-apply-non-function
end

check "higher-order functions":
  msgs("fun twice(f :: (Number -> Number), x :: Number) -> Number: f(f(x)) end\ntwice(lam(n): n + 1 end, 5)") is empty
  msgs("fun compose(f :: (Number -> String), g :: (String -> Number)) -> (Number -> Number): lam(x): g(f(x)) end end") is empty
  "fun twice(f :: (Number -> Number), x :: Number) -> Number: f(f(x)) end\ntwice(lam(s :: String): s end, 5)" is%(tc-err) CS.is-type-mismatch
end

check "argument contravariance":
  msgs("fun call(f :: (Number -> Number)) -> Number: f(1) end\ncall(lam(x :: Any) -> Number: 0 end)") is empty
  "fun call(f :: (Any -> Number)) -> Number: f(1) end\ncall(lam(x :: Number) -> Number: x end)" is%(tc-err) CS.is-type-mismatch
  "fun call(f :: (Number -> Number)) -> Number: f(1) end\ncall(lam(x): 'a' end)" is%(tc-err) CS.is-type-mismatch
  "f :: (Any -> Number) = lam(x :: Number) -> Number: x end" is%(tc-err) CS.is-type-mismatch
  msgs("f :: (Number -> Number) = lam(x :: Any) -> Number: 0 end") is empty
end

check "lambdas check against expected argument types":
  msgs("f :: (Number -> Number) = lam(x): x + 1 end\nf(1)") is empty
  msgs("f :: (Number, String -> String) = lam(x, y): y end\nf(1, 'a')") is empty
  "f :: (Number -> Number) = lam(x): string-length(x) end" is%(tc-err) CS.is-type-mismatch
  "f :: (Number -> Number) = lam(x, y): x end" is%(tc-err) CS.is-incorrect-type
end

check "unannotated top-level functions need inference from examples":
  "fun f(x): x end\nf(5)" is%(tc-err) CS.is-toplevel-unann
  msgs("fun f(x): x + 1 where: f(1) is 2 end\nf(5)") is empty
end

check "recursion":
  msgs("fun fact(n :: Number) -> Number: if n <= 1: 1 else: n * fact(n - 1) end end\nfact(5)") is empty
  msgs(```
fun even(n :: Number) -> Boolean: if n == 0: true else: odd(n - 1) end end
fun odd(n :: Number) -> Boolean: if n == 0: false else: even(n - 1) end end
even(4)
```) is empty
  "fun fact(n :: Number) -> Number: if n <= 1: 'one' else: n * fact(n - 1) end end" is%(tc-err) CS.is-type-mismatch
end

check "shadowing keeps declared types":
  msgs("x = 5\nfun f(shadow x :: String) -> String: x end\nf('a')") is empty
  "x = 5\nfun f(shadow x :: String) -> String: x end\nf(x)" is%(tc-err) CS.is-type-mismatch
end
