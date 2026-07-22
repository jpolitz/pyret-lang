import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err

check "polymorphic functions":
  msgs("fun id<A>(x :: A) -> A: x end\nn :: Number = id(5)\ns :: String = id('a')") is empty
  msgs("fun fst<A, B>(x :: A, y :: B) -> A: x end\nn :: Number = fst(5, 'a')") is empty
  "fun id<A>(x :: A) -> A: x end\nn :: Number = id('a')" is%(tc-err) CS.is-type-mismatch
  "fun id<A>(x :: A) -> A: x end\nid(5) + 'a'" is%(tc-err) CS.is-type-mismatch
end

check "type parameters are opaque inside the body":
  "fun f<A>(x :: A) -> A: x + 1 end" is%(tc-err) CS.is-incorrect-type
  "fun f<A>(x :: A) -> Number: string-length(x) end" is%(tc-err) CS.is-type-mismatch
  msgs("fun f<A>(x :: A) -> String: tostring(x) end") is empty
end

check "explicit instantiation":
  msgs("fun id<A>(x :: A) -> A: x end\nn :: Number = id<Number>(5)") is empty
  msgs("fun pair<A, B>(x :: A, y :: B) -> {A; B}: {x; y} end\np :: {Number; String} = pair<Number, String>(1, 'a')") is empty
  "fun id<A>(x :: A) -> A: x end\nid<Number>('a')" is%(tc-err) CS.is-type-mismatch
  "fun id<A>(x :: A) -> A: x end\nid<Number, String>(5)" is%(tc-err) CS.is-cant-typecheck
  "fun pair<A, B>(x :: A, y :: B) -> {A; B}: {x; y} end\npair<Number>(1, 'a')" is%(tc-err) CS.is-cant-typecheck
  "x = 5\ny = x<Number>" is%(tc-err) CS.is-incorrect-type
end

check "polymorphic functions as arguments":
  msgs(```
fun apply-to-both<A, B>(f :: (A -> B), x :: A, y :: A) -> {B; B}: {f(x); f(y)} end
p :: {Number; Number} = apply-to-both(num-sqr, 2, 3)
```) is empty
  msgs("fun app-f(f :: (Number -> Number)) -> Number: f(1) end\nfun id<A>(x :: A) -> A: x end\napp-f(id)") is empty
end

check "polymorphic return positions need annotations":
  "fun f<A>(x :: A): x end" is%(tc-err) CS.is-polymorphic-return-type-unann
  msgs("fun f<A>(x :: A) -> A: x end") is empty
end

check "lambdas with type parameters":
  msgs("id = lam<A>(x :: A) -> A: x end\nn :: Number = id(5)\ns :: String = id('a')") is empty
  msgs("fun apply-num(f :: (Number -> Number), n :: Number) -> Number: f(n) end\napply-num(lam<A>(a :: A): a end, 5)") is empty
end

check "generic data instantiation":
  msgs("data Box<A>: box(v :: A) end\nb :: Box<Number> = box(5)\nn :: Number = b.v") is empty
  "data Box<A>: box(v :: A) end\nb :: Box<Number> = box('a')" is%(tc-err) CS.is-type-mismatch
  "data Box<A>: box(v :: A) end\nb :: Box<Number, String> = box(5)" is%(tc-err) CS.is-type-mismatch
  "data Box: box(v :: Number) end\nb :: Box<Number> = box(5)" is%(tc-err) CS.is-type-mismatch
end
