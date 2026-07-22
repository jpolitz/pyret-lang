import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err

check "if branches must agree when checked":
  msgs("x :: Number = if true: 5 else: 6 end") is empty
  "x :: Number = if true: 5 else: 'a' end" is%(tc-err) CS.is-type-mismatch
  msgs("x :: Number = if true: 5 else if false: 6 else: 7 end") is empty
  "x :: Number = if true: 5 else if false: 'a' else: 7 end" is%(tc-err) CS.is-type-mismatch
end

check "if conditions must be booleans":
  "if 5: 1 else: 2 end" is%(tc-err) CS.is-type-mismatch
  "if 'yes': 1 else: 2 end" is%(tc-err) CS.is-type-mismatch
  msgs("if 1 < 2: 1 else: 2 end") is empty
end

check "ask":
  msgs("x :: Number = ask: | true then: 1 | otherwise: 2 end") is empty
  "x :: Number = ask: | true then: 1 | otherwise: 'a' end" is%(tc-err) CS.is-type-mismatch
  "ask: | 5 then: 1 | otherwise: 2 end" is%(tc-err) CS.is-type-mismatch
end

check "when":
  msgs("when true: print('hi') end") is empty
  "when 5: print('hi') end" is%(tc-err) CS.is-type-mismatch
end

check "blocks type as their last expression":
  msgs("x :: Number = block:\n print('e')\n 5\nend") is empty
  "x :: Number = block:\n print('e')\n 'a'\nend" is%(tc-err) CS.is-type-mismatch
end

check "for loops":
  msgs("n :: Number = for fold(acc from 0, e from [list: 1, 2]): acc + e end") is empty
  msgs("l :: List<Number> = for map(e from [list: 1, 2]): e * 2 end") is empty
  "for map(e from [list: 1, 2]): e + 'a' end" is%(tc-err) CS.is-type-mismatch
  "for fold(acc from 0, e from [list: 'a']): acc + e end" is%(tc-err) CS.is-type-mismatch
end

check "and or short circuits are boolean":
  msgs("b :: Boolean = (1 < 2) and (2 < 3)") is empty
  "b :: Number = (1 < 2) and (2 < 3)" is%(tc-err) CS.is-type-mismatch
end
