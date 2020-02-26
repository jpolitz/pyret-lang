import load-lib as L
import runtime-lib as RT
import string-dict as SD
import either as E
import pathlib as P
import render-error-display as RED
import js-file("./stdin") as S
import file("../../src/arr/compiler/locators/builtin.arr") as B
import file("../../src/arr/compiler/repl.arr") as R
import file("../../src/arr/compiler/compile-structs.arr") as CS
import file("../../src/arr/compiler/cli-module-loader.arr") as CLI

type Either = E.Either

fun val(res):
  cases(Either) res block:
    | right(ans) => L.get-result-answer(ans)
    | left(err) =>
      print-error("Expected an answer, but got compilation errors:")
      for lists.each(e from err):
        print-error(tostring(e))
      end
      nothing
  end
end
fun msgs(res) block:
  cases(Either) res block:
    | right(ans) =>
      L.render-error-message(ans).message
    | left(shadow res) =>
      sep = "\n========================\n"
      for map(r from res):
        cases(CS.CompileResult) r:
          | ok(code) => tostring(code)
          | err(problems) =>
            for map(p from problems):
              RED.display-to-string(p.render-reason(), torepr, empty)
            end.join-str("sep")
        end
      end.join-str(sep)
  end
end

runtime = RT.make-runtime()

repl = R.make-repl(runtime, [SD.mutable-string-dict:], L.empty-realm(), CLI.default-start-context, lam(): CLI.module-finder end)
fun restart(src, type-check):
  i = repl.make-definitions-locator(lam(): src end, CS.standard-globals)
  repl.restart-interactions(i, CS.default-compile-options.{type-check: type-check})
end
fun next-interaction(src):
  i = repl.make-interaction-locator(lam(): src end)
  repl.run-interaction(i)
end

fun do-reads() block:
  restart("", false)
  var code-so-far = ""
  fun loop() block:
    line = S.readline()
    if line == "#go" block:
      start = time-now()
      result = next-interaction(code-so-far)
      print("Time to run interaction: " + to-repr(time-now() - start))
      before-render = time-now()
      cases(Either) result block:
        | right(ans) =>
          print(L.get-result-answer(ans))
          print("\n")
#          print(L.render-check-results(ans))
#          print("\n")
        | left(ans) =>
          errstr = for map(r from ans):
            cases(CS.CompileResult) r:
              | ok(code) => tostring(code)
              | err(problems) =>
                for map(p from problems):
                  RED.display-to-string(p.render-reason(), torepr, empty)
                end.join-str("\n")
            end
          end.join-str("\n")
          print(errstr)
      end
      print("Time to render interaction: " + to-repr(time-now() - before-render))
      code-so-far := ""
      loop()
    else if line <> "#done":
      code-so-far := code-so-far + line + "\n"
      loop()
    else:
      print("interaction finished\n")
    end
  end
  loop()
end

do-reads()
