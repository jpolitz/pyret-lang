provide *
provide-types *

import lists as L

data Shape:
  | circ(r :: Number)
  | rect(w :: Number, h :: Number)
  | tri(b :: Number, h :: Number)
end

fun area(s :: Shape) -> Number:
  cases(Shape) s:
    | circ(r) => 3.14159 * r * r
    | rect(w, h) => w * h
    | tri(b, h) => (b * h) / 2
  end
end

fun total-area(ss :: List<Shape>) -> Number:
  L.foldl(lam(acc, s): acc + area(s) end, 0, ss)
end

fun scale(s :: Shape, k :: Number) -> Shape:
  cases(Shape) s:
    | circ(r) => circ(r * k)
    | rect(w, h) => rect(w * k, h * k)
    | tri(b, h) => tri(b * k, h * k)
  end
end

shapes = [list: circ(1), rect(2, 3), tri(4, 5)]
