import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err

point = ```
data Point:
  | point2d(x :: Number, y :: Number)
  | point3d(x :: Number, y :: Number, z :: Number)
  | origin
end
``` + "\n"

check "constructors and field access":
  msgs(point + "n :: Number = point2d(1, 2).x") is empty
  msgs(point + "p :: Point = origin") is empty
  (point + "point2d(1, 'a')") is%(tc-err) CS.is-type-mismatch
  (point + "point2d(1)") is%(tc-err) CS.is-incorrect-number-of-args
  (point + "origin(1)") is%(tc-err) CS.is-apply-non-function
  (point + "s :: String = point2d(1, 2).x") is%(tc-err) CS.is-type-mismatch
  (point + "point2d(1, 2).z") is%(tc-err) CS.is-object-missing-field
end

check "detection predicates":
  msgs(point + "b :: Boolean = is-point2d(point2d(1, 2))") is empty
  msgs(point + "b :: Boolean = is-origin(origin)") is empty
end

check "cases exhaustiveness":
  msgs(point + ```
fun which(p :: Point) -> String:
  cases(Point) p:
    | point2d(_, _) => '2d'
    | point3d(_, _, _) => '3d'
    | origin => 'o'
  end
end
```) is empty
  (point + ```
fun which(p :: Point) -> String:
  cases(Point) p:
    | point2d(_, _) => '2d'
  end
end
```) is%(tc-err) CS.is-non-exhaustive-pattern
  msgs(point + ```
fun which(p :: Point) -> String:
  cases(Point) p:
    | point2d(_, _) => '2d'
    | else => 'other'
  end
end
```) is empty
end

check "cases branch mistakes":
  (point + ```
cases(Point) origin:
  | point2d(_, _) => 1
  | point3d(_, _, _) => 2
  | origin => 3
  | else => 4
end
```) is%(tc-err) CS.is-unnecessary-else-branch
  (point + ```
data Other: other end
cases(Point) origin:
  | point2d(_, _) => 1
  | other => 2
  | else => 3
end
```) is%(tc-err) CS.is-unnecessary-branch
  (point + ```
cases(Point) origin:
  | point2d(_) => 1
  | else => 2
end
```) is%(tc-err) CS.is-incorrect-number-of-bindings
  (point + ```
cases(Point) origin:
  | origin(_) => 1
  | else => 2
end
```) is%(tc-err) CS.is-cases-singleton-mismatch
  (point + ```
cases(Point) origin:
  | point2d => 1
  | else => 2
end
```) is%(tc-err) CS.is-cases-singleton-mismatch
end

check "cases on builtin types with no variants":
  "cases(Number) 5: | else => 1 end" is%(tc-err) CS.is-unnecessary-else-branch
  "cases(Number) 5: | foo => 1 end" is%(tc-err) CS.is-unnecessary-branch
end

check "cases branches and bound argument types":
  msgs(point + ```
n :: Number = cases(Point) point2d(1, 2):
  | point2d(x, y) => x + y
  | else => 0
end
```) is empty
  (point + ```
cases(Point) point2d(1, 2):
  | point2d(x, y) => x + 'a'
  | else => 0
end
```) is%(tc-err) CS.is-type-mismatch
  (point + ```
s :: String = cases(Point) origin:
  | origin => 'o'
  | else => 5
end
```) is%(tc-err) CS.is-type-mismatch
end

check "occurrence typing through cases":
  msgs(```
data NumOrStr:
  | a-num(n :: Number)
  | a-str(s :: String)
end
fun to-num(v :: NumOrStr) -> Number:
  cases(NumOrStr) v:
    | a-num(_) => v.n
    | a-str(_) => string-length(v.s)
  end
end
```) is empty
  ```
data NumOrStr:
  | a-num(n :: Number)
  | a-str(s :: String)
end
fun to-num(v :: NumOrStr) -> Number:
  cases(NumOrStr) v:
    | a-num(_) => v.s
    | a-str(_) => 0
  end
end
``` is%(tc-err) CS.is-object-missing-field
end

check "methods and sharing":
  msgs(```
data Counter:
  | counter(n :: Number) with:
    method bump(self) -> Counter: counter(self.n + 1) end
sharing:
  method get(self) -> Number: self.n end
end
counter(1).bump().get()
```) is empty
  ```
data Counter:
  | counter(n :: Number) with:
    method bump(self) -> Counter: counter(self.n + 'a') end
end
``` is%(tc-err) CS.is-type-mismatch
  ```
data Counter:
  | counter(n :: Number) with:
    method bump(self) -> Counter: counter(self.n + 1) end
end
counter(1).bump(2)
``` is%(tc-err) CS.is-incorrect-number-of-args
  msgs(```
data Shape:
  | circle(r :: Number)
sharing:
  method area(self) -> Number: self.r * self.r * 3 end
end
circle(2).area()
```) is empty
  ```
data Shape:
  | circle(r :: Number)
  | square(s :: Number)
sharing:
  method area(self) -> Number: self.r * self.r end
end
square(2).area()
``` is%(tc-err) CS.is-object-missing-field
  ```
data Shape:
  | circle(r :: Number)
sharing:
  method bad(self) -> String: self.r end
end
``` is%(tc-err) CS.is-type-mismatch
end

check "recursive data":
  msgs(```
data Tree:
  | leaf
  | node(v :: Number, l :: Tree, r :: Tree)
end
fun sum(t :: Tree) -> Number:
  cases(Tree) t:
    | leaf => 0
    | node(v, l, r) => v + sum(l) + sum(r)
  end
end
sum(node(1, leaf, node(2, leaf, leaf)))
```) is empty
  ```
data Tree:
  | leaf
  | node(v :: Number, l :: Tree, r :: Tree)
end
node(1, leaf, 5)
``` is%(tc-err) CS.is-type-mismatch
end

check "polymorphic recursive data":
  msgs(```
data Seq<A>:
  | nil
  | cons(first :: A, rest :: Seq<A>)
end
fun len<A>(s :: Seq<A>) -> Number:
  cases(Seq<A>) s:
    | nil => 0
    | cons(_, rest) => 1 + len(rest)
  end
end
len(cons(1, cons(2, nil)))
```) is empty
  ```
data Seq<A>:
  | nil
  | cons(first :: A, rest :: Seq<A>)
end
cons(1, cons('a', nil))
``` is%(tc-err) CS.is-type-mismatch
end

check "data with ref fields":
  msgs(```
data Cell: cell(ref v :: Number) end
c = cell(5)
c!{v: 6}
n :: Number = c!v
```) is empty
  ```
data Cell: cell(ref v :: Number) end
cell(5)!{v: 'a'}
``` is%(tc-err) CS.is-type-mismatch
  ```
data Cell: cell(v :: Number) end
cell(5)!{v: 6}
``` is%(tc-err) CS.is-incorrect-type
end
