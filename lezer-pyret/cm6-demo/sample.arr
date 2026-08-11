#lang pyret

#|
  A small Pyret sample for the CM6 + Lezer demo.
  It exercises data, methods, cases, if, lambdas, checks and comments.
|#

provide *
provide-types *

import global as _

# An optional value, with a couple of methods.
data Option<a>:
  | none with:
    method or-else(self :: Option<a>, v :: a) -> a:
      doc: "Return the default provided value"
      v
    end,
    method and-then<b>(self :: Option<a>, _ :: (a -> b)) -> Option<b>:
      self # nothing to do for none
    end
  | some(value :: a) with:
    method or-else(self :: Option<a>, v :: a) -> a:
      self.value
    end,
    method and-then<b>(self :: Option<a>, f :: (a -> b)) -> Option<b>:
      some(f(self.value))
    end
where:
  none.or-else(1) is 1
  some(5).and-then(lam(x): some(x + 2) end) is some(7)
end

# A plain function with a conditional and a block comment inside.
fun classify(n :: Number) -> String:
  if n < 0:
    "negative"
  else if n == 0:
    "zero"     #| inline block comment |# else-branch follows
  else:
    "positive"
  end
end

fun describe(opt :: Option<Number>) -> String:
  cases (Option) opt:
    | none => "nothing"
    | some(v) => "got " + num-to-string(v)
  end
end

check "classify":
  classify(-3) is "negative"
  classify(0) is "zero"
  classify(42) is "positive"
end
