import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs-with = TC.msgs-with
tc-err-with = TC.tc-err-with

fun lib(source :: String): [list: {"lib"; source}] end

num-lib = lib("provide *\nx :: Number = 42\nfun double(n :: Number) -> Number: n * 2 end")

check "imported values keep their types":
  msgs-with(num-lib, "import file('lib') as L\nn :: Number = L.double(L.x)") is empty
  "import file('lib') as L\ns :: String = L.x" is%(tc-err-with(num-lib)) CS.is-type-mismatch
  "import file('lib') as L\nL.double('a')" is%(tc-err-with(num-lib)) CS.is-type-mismatch
  "import file('lib') as L\nL.double(1, 2)" is%(tc-err-with(num-lib)) CS.is-incorrect-number-of-args
end

check "include brings names in unqualified":
  msgs-with(num-lib, "include file('lib')\nn :: Number = double(x)") is empty
  "include file('lib')\ndouble(true)" is%(tc-err-with(num-lib)) CS.is-type-mismatch
end

poly-lib = lib("provide *\nfun my-id<A>(v :: A) -> A: v end\nfun twice<A>(f :: (A -> A), v :: A) -> A: f(f(v)) end")

check "imported polymorphic functions instantiate":
  msgs-with(poly-lib, "import file('lib') as L\nn :: Number = L.my-id(5)\ns :: String = L.my-id('a')") is empty
  msgs-with(poly-lib, "import file('lib') as L\nn :: Number = L.twice(lam(x :: Number): x + 1 end, 5)") is empty
  "import file('lib') as L\nn :: Number = L.my-id('a')" is%(tc-err-with(poly-lib)) CS.is-type-mismatch
end

data-lib = lib(```
provide *
provide-types *
data Animal:
  | cat(lives :: Number)
  | dog(name :: String)
sharing:
  method describe(self) -> String: 'an animal' end
end
```)

check "imported data: constructors, cases, methods":
  msgs-with(data-lib, "import file('lib') as L\nc :: L.Animal = L.cat(9)") is empty
  msgs-with(data-lib, "include file('lib')\nn :: Number = cases(Animal) cat(9): | cat(l) => l | dog(_) => 0 end") is empty
  msgs-with(data-lib, "include file('lib')\ns :: String = cat(9).describe()") is empty
  msgs-with(data-lib, "include file('lib')\nb :: Boolean = is-cat(cat(9))") is empty
  "include file('lib')\ncat('a')" is%(tc-err-with(data-lib)) CS.is-type-mismatch
  "include file('lib')\ncat(9).name" is%(tc-err-with(data-lib)) CS.is-object-missing-field
  "include file('lib')\ncases(Animal) cat(9): | cat(l) => l end" is%(tc-err-with(data-lib)) CS.is-non-exhaustive-pattern
  "include file('lib')\ncases(Animal) cat(9): | cat(l) => l | dog(_) => 0 | else => 1 end" is%(tc-err-with(data-lib)) CS.is-unnecessary-else-branch
end

generic-data-lib = lib(```
provide *
provide-types *
data Pair<L, R>:
  | pair(left :: L, right :: R)
end
fun flip<L, R>(p :: Pair<L, R>) -> Pair<R, L>:
  pair(p.right, p.left)
end
```)

check "imported generic data":
  msgs-with(generic-data-lib, "import file('lib') as L\np :: L.Pair<Number, String> = L.pair(1, 'a')") is empty
  msgs-with(generic-data-lib, "import file('lib') as L\np = L.flip(L.pair(1, 'a'))\ns :: String = p.left") is empty
  "import file('lib') as L\np :: L.Pair<Number, String> = L.pair('a', 1)" is%(tc-err-with(generic-data-lib)) CS.is-type-mismatch
  "import file('lib') as L\np = L.flip(L.pair(1, 'a'))\nn :: Number = p.left" is%(tc-err-with(generic-data-lib)) CS.is-type-mismatch
end

alias-lib = lib("provide *\nprovide-types *\ntype Id = Number\ntype Tagged<A> = {tag :: String, v :: A}\nfun mk(n :: Number) -> Tagged<Number>: {tag: 'n', v: n} end")

check "imported type aliases":
  msgs-with(alias-lib, "import file('lib') as L\ni :: L.Id = 5") is empty
  msgs-with(alias-lib, "import file('lib') as L\nt :: L.Tagged<Number> = L.mk(5)\nn :: Number = t.v") is empty
  "import file('lib') as L\ni :: L.Id = 'a'" is%(tc-err-with(alias-lib)) CS.is-type-mismatch
  "import file('lib') as L\nt :: L.Tagged<String> = L.mk(5)" is%(tc-err-with(alias-lib)) CS.is-type-mismatch
end

chain = [list:
  {"base"; "provide *\nprovide-types *\ndata Color: red | green end"},
  {"mid"; ```
provide *
provide-types *
import file('base') as B
fun next-color(c :: B.Color) -> B.Color:
  cases(B.Color) c: | red => B.green | green => B.red end
end
```}]

check "types flow through a module chain":
  msgs-with(chain, "import file('base') as B\nimport file('mid') as M\nc :: B.Color = M.next-color(B.red)") is empty
  "import file('base') as B\nimport file('mid') as M\nM.next-color(5)" is%(tc-err-with(chain)) CS.is-type-mismatch
end

reprovide = [list:
  {"base"; "provide *\nprovide-types *\ndata Coin: heads | tails end\nfun flip-it(c :: Coin) -> Coin: cases(Coin) c: | heads => tails | tails => heads end end"},
  {"facade"; "import file('base') as B\nprovide from B: flip-it, heads, tails, type Coin end"}]

check "re-provided names keep their types":
  msgs-with(reprovide, "import file('facade') as F\nc :: F.Coin = F.flip-it(F.heads)") is empty
  "import file('facade') as F\nF.flip-it(5)" is%(tc-err-with(reprovide)) CS.is-type-mismatch
end
