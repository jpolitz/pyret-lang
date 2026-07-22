import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err

check "tuple literals and access":
  msgs("t = {1; 'a'; true}\nn :: Number = t.{0}\ns :: String = t.{1}\nb :: Boolean = t.{2}") is empty
  "t = {1; 'a'}\nt.{2}" is%(tc-err) CS.is-tuple-too-small
  "t = {1; 'a'}\ns :: String = t.{0}" is%(tc-err) CS.is-type-mismatch
end

check "tuple annotations":
  msgs("t :: {Number; String} = {1; 'a'}") is empty
  "t :: {Number; String} = {1; 2}" is%(tc-err) CS.is-type-mismatch
  "t :: {Number; String} = {1; 'a'; true}" is%(tc-err) CS.is-incorrect-type
  "t :: {Number; String; Boolean} = {1; 'a'}" is%(tc-err) CS.is-incorrect-type
end

check "tuple binding":
  msgs("{n; s} = {1; 'a'}\nn2 :: Number = n\ns2 :: String = s") is empty
  "{n; s} = {1; 'a'}\nn + s" is%(tc-err) CS.is-type-mismatch
  "{n; s; b} = {1; 'a'}\nn" is%(tc-err) CS.is-incorrect-type
end

check "tuples in and out of functions":
  msgs("fun swap(t :: {Number; String}) -> {String; Number}: {t.{1}; t.{0}} end\nswap({1; 'a'})") is empty
  "fun swap(t :: {Number; String}) -> {String; Number}: {t.{0}; t.{1}} end" is%(tc-err) CS.is-type-mismatch
  "fun f(t :: {Number; Number}) -> Number: t.{0} end\nf(5)" is%(tc-err) CS.is-type-mismatch
  "fun f(n :: Number) -> Number: n end\nf({1; 2})" is%(tc-err) CS.is-incorrect-type
end

check "tuple access on non-tuples":
  "x = 5\nx.{0}" is%(tc-err) CS.is-incorrect-type
  "o = {x: 5}\no.{0}" is%(tc-err) CS.is-incorrect-type
end

check "nested tuples":
  msgs("t = {{1; 2}; 'a'}\nn :: Number = t.{0}.{1}") is empty
  "t = {{1; 2}; 'a'}\nt.{0}.{2}" is%(tc-err) CS.is-tuple-too-small
end
