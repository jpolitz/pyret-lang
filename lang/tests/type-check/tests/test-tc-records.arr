import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err

check "record literals and field access":
  msgs("o = {x: 5, y: 'a'}\nn :: Number = o.x\ns :: String = o.y") is empty
  "o = {x: 5}\no.y" is%(tc-err) CS.is-object-missing-field
  "o = {x: 5}\ns :: String = o.x" is%(tc-err) CS.is-type-mismatch
end

check "record annotations":
  msgs("o :: {x :: Number, y :: String} = {x: 5, y: 'a'}") is empty
  "o :: {x :: Number} = {x: 'a'}" is%(tc-err) CS.is-type-mismatch
  "o :: {x :: Number, y :: String} = {x: 5}" is%(tc-err) CS.is-type-mismatch
end

check "width subtyping":
  msgs("fun get-x(o :: {x :: Number}) -> Number: o.x end\nget-x({x: 1, y: 2, z: 3})") is empty
  "fun get-x(o :: {x :: Number}) -> Number: o.x end\nget-x({y: 2})" is%(tc-err) CS.is-type-mismatch
end

check "depth subtyping":
  msgs("fun f(o :: {p :: {x :: Number}}) -> Number: o.p.x end\nf({p: {x: 1, y: 2}})") is empty
  "fun f(o :: {p :: {x :: Number}}) -> Number: o.p.x end\nf({p: {y: 2}})" is%(tc-err) CS.is-type-mismatch
end

check "nested records":
  msgs("o = {a: {b: {c: 5}}}\nn :: Number = o.a.b.c") is empty
  "o = {a: {b: {c: 5}}}\no.a.c" is%(tc-err) CS.is-object-missing-field
end

check "record extension":
  msgs("o = {x: 5}\no2 = o.{y: 'a'}\nn :: Number = o2.x\ns :: String = o2.y") is empty
  msgs("o = {x: 5}\no2 = o.{x: 'a'}\ns :: String = o2.x") is empty
  "o = {x: 5}\no.{y: 'a'}.z" is%(tc-err) CS.is-object-missing-field
end

check "records with methods":
  msgs("o = {n: 5, method double(self) -> Number: self.n * 2 end}\no.double()") is empty
  "o = {n: 5, method double(self) -> Number: self.n * 2 end}\no.double() + 'a'" is%(tc-err) CS.is-type-mismatch
end

check "functions returning records":
  msgs("fun mk(n :: Number) -> {v :: Number}: {v: n} end\nmk(5).v") is empty
  "fun mk(n :: Number) -> {v :: Number}: {w: n} end" is%(tc-err) CS.is-type-mismatch
end
