import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err

check "arithmetic operators":
  msgs("2 + 2") is empty
  msgs("2 - 3.5") is empty
  msgs("2 * num-sqrt(2)") is empty
  msgs("2 / ~4") is empty
  "2 + true" is%(tc-err) CS.is-type-mismatch
  "'a' - 'b'" is%(tc-err) CS.is-object-missing-field
end

check "string and boolean operators":
  msgs("'a' + 'b'") is empty
  msgs("true and false") is empty
  msgs("(1 < 2) or (2 > 1)") is empty
  "1 and true" is%(tc-err) CS.is-type-mismatch
  "'a' or false" is%(tc-err) CS.is-type-mismatch
  "not(5)" is%(tc-err) CS.is-type-mismatch
end

check "comparison operators":
  msgs("1 <= 2") is empty
  msgs("'a' < 'b'") is empty
  msgs("1 == 2") is empty
  "1 < 'a'" is%(tc-err) CS.is-type-mismatch
  "true < false" is%(tc-err) CS.is-object-missing-field
end
