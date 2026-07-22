import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

ser-msgs = TC.ser-msgs
ser-err = TC.ser-err

fun both-empty(r) -> Boolean:
  (r.live == empty) and (r.cached == empty)
end

check "function types round-trip":
  lib = [list: {"lib.arr"; "provide *\nfun double(n :: Number) -> Number: n * 2 end"}]
  ser-msgs(lib + [list: {"main.arr"; "import file('lib.arr') as L\nn :: Number = L.double(21)"}], "main.arr") satisfies both-empty
  ser-err(lib + [list: {"main.arr"; "import file('lib.arr') as L\nL.double('a')"}], "main.arr", CS.is-type-mismatch) is true
  ser-err(lib + [list: {"main.arr"; "import file('lib.arr') as L\nL.double(1, 2)"}], "main.arr", CS.is-incorrect-number-of-args) is true
end

check "polymorphic function types round-trip":
  lib = [list: {"lib.arr"; ```
provide *
fun my-id<A>(v :: A) -> A: v end
fun apply-both<A, B>(f :: (A -> B), xs :: {A; A}) -> {B; B}: {f(xs.{0}); f(xs.{1})} end
```}]
  ser-msgs(lib + [list: {"main.arr"; ```
import file('lib.arr') as L
n :: Number = L.my-id(5)
s :: String = L.my-id('a')
t :: {String; String} = L.apply-both(lam(v :: Number) -> String: tostring(v) end, {1; 2})
```}], "main.arr") satisfies both-empty
  ser-err(lib + [list: {"main.arr"; "import file('lib.arr') as L\nn :: Number = L.my-id('a')"}], "main.arr", CS.is-type-mismatch) is true
end

animal = {"lib.arr"; ```
provide *
provide-types *
data Animal:
  | cat(lives :: Number)
  | dog(name :: String)
sharing:
  method describe(self) -> String: 'an animal' end
end
```}

check "data types round-trip: constructors, cases, methods, predicates":
  ser-msgs([list: animal, {"main.arr"; ```
include file('lib.arr')
c :: Animal = cat(9)
n :: Number = cases(Animal) c: | cat(l) => l | dog(_) => 0 end
s :: String = c.describe()
b :: Boolean = is-dog(c)
```}], "main.arr") satisfies both-empty
  ser-err([list: animal, {"main.arr"; "include file('lib.arr')\ncat('a')"}], "main.arr", CS.is-type-mismatch) is true
  ser-err([list: animal, {"main.arr"; "include file('lib.arr')\ncases(Animal) cat(9): | cat(l) => l end"}], "main.arr", CS.is-non-exhaustive-pattern) is true
  ser-err([list: animal, {"main.arr"; "include file('lib.arr')\ncases(Animal) cat(9): | cat(l) => l | dog(_) => 0 | else => 1 end"}], "main.arr", CS.is-unnecessary-else-branch) is true
  ser-err([list: animal, {"main.arr"; "include file('lib.arr')\ncat(9).name"}], "main.arr", CS.is-object-missing-field) is true
end

check "generic data round-trips":
  lib = [list: {"lib.arr"; ```
provide *
provide-types *
data Result<O, E>:
  | success(v :: O)
  | failure(err :: E)
end
fun try-num(n :: Number) -> Result<Number, String>:
  if n > 0: success(n) else: failure('negative') end
end
```}]
  ser-msgs(lib + [list: {"main.arr"; ```
include file('lib.arr')
r :: Result<Number, String> = try-num(5)
n :: Number = cases(Result<Number, String>) r:
  | success(v) => v
  | failure(e) => string-length(e)
end
```}], "main.arr") satisfies both-empty
  ser-err(lib + [list: {"main.arr"; "include file('lib.arr')\nr :: Result<String, String> = try-num(5)"}], "main.arr", CS.is-type-mismatch) is true
end

check "data with ref fields and singleton variants round-trips":
  lib = [list: {"lib.arr"; ```
provide *
provide-types *
data Registry:
  | registry(ref count :: Number)
  | empty-registry with:
    method size(self) -> Number: 0 end
end
```}]
  ser-msgs(lib + [list: {"main.arr"; ```
include file('lib.arr')
r = registry(0)
r!{count: 1}
n :: Number = r!count
e :: Registry = empty-registry
z :: Number = empty-registry.size()
```}], "main.arr") satisfies both-empty
  ser-err(lib + [list: {"main.arr"; "include file('lib.arr')\nregistry(0)!{count: 'a'}"}], "main.arr", CS.is-type-mismatch) is true
end

check "generic methods on data round-trip":
  lib = [list: {"lib.arr"; ```
provide *
provide-types *
data Stack<A>:
  | stack(items :: List<A>) with:
    method push(self, v :: A) -> Stack<A>: stack(link(v, self.items)) end,
    method peek(self) -> Option<A>:
      cases(List<A>) self.items: | empty => none | link(f, _) => some(f) end
    end
end
fun mk-stack<A>() -> Stack<A>: stack(empty) end
```}]
  ser-msgs(lib + [list: {"main.arr"; ```
include file('lib.arr')
s :: Stack<Number> = stack([list: 1]).push(2)
```}], "main.arr") satisfies both-empty
  ser-err(lib + [list: {"main.arr"; "include file('lib.arr')\nstack([list: 1]).push('a')"}], "main.arr", CS.is-type-mismatch) is true
end

check "type aliases round-trip":
  lib = [list: {"lib.arr"; ```
provide *
provide-types *
type Id = Number
type Tagged<A> = {tag :: String, v :: A}
fun mk(n :: Number) -> Tagged<Number>: {tag: 'n', v: n} end
```}]
  ser-msgs(lib + [list: {"main.arr"; ```
import file('lib.arr') as L
i :: L.Id = 5
t :: L.Tagged<Number> = L.mk(5)
n :: Number = t.v
s :: String = t.tag
```}], "main.arr") satisfies both-empty
  ser-err(lib + [list: {"main.arr"; "import file('lib.arr') as L\ni :: L.Id = 'a'"}], "main.arr", CS.is-type-mismatch) is true
  ser-err(lib + [list: {"main.arr"; "import file('lib.arr') as L\nt :: L.Tagged<String> = L.mk(5)"}], "main.arr", CS.is-type-mismatch) is true
end

check "record and tuple types round-trip":
  lib = [list: {"lib.arr"; ```
provide *
point :: {x :: Number, y :: Number} = {x: 1, y: 2}
pair :: {Number; String} = {1; 'a'}
```}]
  ser-msgs(lib + [list: {"main.arr"; ```
import file('lib.arr') as L
n :: Number = L.point.x
s :: String = L.pair.{1}
```}], "main.arr") satisfies both-empty
  ser-err(lib + [list: {"main.arr"; "import file('lib.arr') as L\nL.point.z"}], "main.arr", CS.is-object-missing-field) is true
  ser-err(lib + [list: {"main.arr"; "import file('lib.arr') as L\nL.pair.{2}"}], "main.arr", CS.is-tuple-too-small) is true
end

check "types mentioning builtin generics round-trip":
  lib = [list: {"lib.arr"; ```
provide *
provide-types *
data Task: task(name :: String) end
all-tasks :: List<Task> = [list: task('a')]
fun names(ts :: List<Task>) -> List<String>: ts.map(lam(t): t.name end) end
```}]
  ser-msgs(lib + [list: {"main.arr"; ```
import file('lib.arr') as L
ns :: List<String> = L.names(L.all-tasks)
t :: L.Task = L.all-tasks.first
```}], "main.arr") satisfies both-empty
  ser-err(lib + [list: {"main.arr"; "import file('lib.arr') as L\nns :: List<Number> = L.names(L.all-tasks)"}], "main.arr", CS.is-type-mismatch) is true
end

check "types referencing another module's data round-trip through a chain":
  mods = [list:
    {"base.arr"; "provide *\nprovide-types *\ndata Color: red | green end"},
    {"mid.arr"; ```
provide *
provide-types *
import file('base.arr') as B
fun invert(c :: B.Color) -> B.Color:
  cases(B.Color) c: | red => B.green | green => B.red end
end
```}]
  ser-msgs(mods + [list: {"main.arr"; ```
import file('base.arr') as B
import file('mid.arr') as M
c :: B.Color = M.invert(B.red)
```}], "main.arr") satisfies both-empty
  ser-err(mods + [list: {"main.arr"; "import file('mid.arr') as M\nM.invert(5)"}], "main.arr", CS.is-type-mismatch) is true
end

check "re-provided types round-trip":
  mods = [list:
    {"base.arr"; "provide *\nprovide-types *\ndata Coin: heads | tails end\nfun flip-it(c :: Coin) -> Coin: cases(Coin) c: | heads => tails | tails => heads end end"},
    {"facade.arr"; "import file('base.arr') as B\nprovide from B: flip-it, heads, tails, type Coin end"}]
  ser-msgs(mods + [list: {"main.arr"; "import file('facade.arr') as F\nc :: F.Coin = F.flip-it(F.heads)"}], "main.arr") satisfies both-empty
  ser-err(mods + [list: {"main.arr"; "import file('facade.arr') as F\nF.flip-it(5)"}], "main.arr", CS.is-type-mismatch) is true
end

check "refined variant types round-trip":
  lib = [list: {"lib.arr"; ```
provide *
provide-types *
data Species:
  | lion() with:
    method roar(self) -> String: 'roar' end
  | mouse() with:
    method squeak(self) -> String: 'squeak' end
end
king = lion()
```}]
  ser-msgs(lib + [list: {"main.arr"; "import file('lib.arr') as L\ns :: String = L.king.roar()"}], "main.arr") satisfies both-empty
  ser-err(lib + [list: {"main.arr"; "import file('lib.arr') as L\nL.king.squeak()"}], "main.arr", CS.is-object-missing-field) is true
end
