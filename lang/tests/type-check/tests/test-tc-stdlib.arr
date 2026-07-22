import file("../tc-helper.arr") as TC
import file("../../../src/arr/compiler/compile-structs.arr") as CS

msgs = TC.msgs
tc-err = TC.tc-err

check "list constructors and element types":
  msgs("l :: List<Number> = [list: 1, 2, 3]") is empty
  msgs("l :: List<List<String>> = [list: [list: 'a'], [list:]]") is empty
  msgs("l :: List<Number> = empty") is empty
  msgs("l :: List<Number> = link(1, empty)") is empty
  "l :: List<Number> = [list: 'a']" is%(tc-err) CS.is-type-mismatch
  "l :: List<Number> = [list: 1, 'a']" is%(tc-err) CS.is-type-mismatch
  "l :: List<Number> = link('a', empty)" is%(tc-err) CS.is-type-mismatch
end

check "list methods":
  msgs("n :: Number = [list: 1, 2].length()") is empty
  msgs("l :: List<Number> = [list: 1, 2].map(lam(x): x * 2 end)") is empty
  msgs("l :: List<String> = [list: 1, 2].map(lam(x): tostring(x) end)") is empty
  msgs("l :: List<Number> = [list: 1, 2].filter(lam(x): x > 1 end)") is empty
  msgs("n :: Number = [list: 1, 2].foldl(lam(acc, e): acc + e end, 0)") is empty
  "s :: String = [list: 1, 2].length()" is%(tc-err) CS.is-type-mismatch
  "[list: 1, 2].map(lam(x :: String): x end)" is%(tc-err) CS.is-type-mismatch
  "l :: List<String> = [list: 1, 2].map(lam(x): x * 2 end)" is%(tc-err) CS.is-type-mismatch
end

check "lists module functions":
  msgs("l :: List<Number> = lists.map(lam(x :: Number): x + 1 end, [list: 1])") is empty
  msgs("n :: Number = lists.fold(lam(acc :: Number, e :: Number): acc + e end, 0, [list: 1])") is empty
  "lists.map(lam(x :: Number): x + 1 end, [list: 'a'])" is%(tc-err) CS.is-type-mismatch
end

check "options":
  msgs("o :: Option<Number> = some(5)") is empty
  msgs("o :: Option<Number> = none") is empty
  msgs("n :: Number = some(5).or-else(0)") is empty
  msgs("o :: Option<String> = some(5).and-then(lam(n): tostring(n) end)") is empty
  msgs(```
fun get(o :: Option<Number>) -> Number:
  cases(Option<Number>) o:
    | some(v) => v
    | none => 0
  end
end
```) is empty
  "o :: Option<Number> = some('a')" is%(tc-err) CS.is-type-mismatch
  "s :: String = some(5).or-else(0)" is%(tc-err) CS.is-type-mismatch
  ```
cases(Option<Number>) some(5):
  | some(v) => string-length(v)
  | none => 0
end
``` is%(tc-err) CS.is-type-mismatch
end

check "either":
  msgs("import either as E\ne :: E.Either<Number, String> = E.left(5)") is empty
  msgs(```
import either as E
fun get(e :: E.Either<Number, String>) -> Number:
  cases(E.Either<Number, String>) e:
    | left(n) => n
    | right(s) => string-length(s)
  end
end
```) is empty
  "import either as E\ne :: E.Either<Number, String> = E.left('a')" is%(tc-err) CS.is-type-mismatch
end

check "raw arrays":
  msgs("a :: RawArray<Number> = [raw-array: 1, 2]") is empty
  msgs("n :: Number = raw-array-get([raw-array: 1, 2], 0)") is empty
  "a :: RawArray<Number> = [raw-array: 'a']" is%(tc-err) CS.is-type-mismatch
  "raw-array-get([raw-array: 1], 'a')" is%(tc-err) CS.is-type-mismatch
  "s :: String = raw-array-get([raw-array: 1], 0)" is%(tc-err) CS.is-type-mismatch
end

check "arrays":
  msgs("a :: Array<Number> = [array: 1, 2]\nn :: Number = a.get-now(0)") is empty
  "a :: Array<Number> = [array: 1]\na.set-now(0, 'a')" is%(tc-err) CS.is-type-mismatch
end

check "string dicts: annotation picks the value type, construction is unchecked":
  msgs("import string-dict as SD\nd :: SD.StringDict<Number> = [SD.string-dict: 'a', 1]") is empty
  msgs("import string-dict as SD\nd = [SD.string-dict: 'a', 1]\nn :: Number = d.get-value('a')") is empty
  msgs("import string-dict as SD\nd :: SD.StringDict<Number> = [SD.string-dict: 'a', 'b']") is empty
  "import string-dict as SD\nd :: SD.StringDict<Number> = [SD.string-dict: 'a', 1]\ns :: String = d.get-value('a')" is%(tc-err) CS.is-type-mismatch
  "import string-dict as SD\nd = [SD.string-dict: 'a', 1]\nd.get-value(5)" is%(tc-err) CS.is-type-mismatch
end

check "str-dict: the tuple-based maker checks its elements":
  msgs("import str-dict as S\nd = [S.string-dict: {'a'; 5}]\no :: Option<Number> = d.get('a')") is empty
  "import str-dict as S\nd = [S.string-dict: {'a'; 5}, {'b'; true}]" is%(tc-err) CS.is-type-mismatch
  "import str-dict as S\nd = [S.string-dict: {'a'; 5}]\no :: Option<Boolean> = d.get('a')" is%(tc-err) CS.is-type-mismatch
end

check "sets":
  msgs("s :: Set<Number> = [set: 1, 2]\nb :: Boolean = s.member(1)") is empty
  "s :: Set<Number> = [set: 'a']" is%(tc-err) CS.is-type-mismatch
  "[set: 1, 2].member('a')" is%(tc-err) CS.is-type-mismatch
end

check "builtin functions":
  msgs("n :: Number = string-length('abc')") is empty
  msgs("s :: String = string-repeat('ab', 3)") is empty
  msgs("n :: Number = num-max(1, 2)") is empty
  "string-length(5)" is%(tc-err) CS.is-type-mismatch
  "num-sqrt('a')" is%(tc-err) CS.is-type-mismatch
  "string-repeat('ab', 'c')" is%(tc-err) CS.is-type-mismatch
end
