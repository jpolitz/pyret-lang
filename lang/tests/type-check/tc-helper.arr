provide *
import either as E
import filelib as FL
import pathlib as P
import string-dict as SD
import render-error-display as RED
import file("../../src/arr/compiler/compile-lib.arr") as CL
import file("../../src/arr/compiler/cli-module-loader.arr") as CLI
import file("../../src/arr/compiler/compile-structs.arr") as CS

fun string-to-named-locator(program :: String, name :: String):
  {
    method needs-compile(self, provs): true end,
    method get-modified-time(self): 0 end,
    method get-options(self, options): options end,
    method get-module(self): CL.pyret-string(program) end,
    method get-native-modules(self): [list:] end,
    method get-extra-imports(self): CS.standard-imports end,
    method get-dependencies(self): CL.get-standard-dependencies(self.get-module(), self.uri()) end,
    method get-globals(self): CS.standard-globals end,
    method uri(self): "tc-test://" + name end,
    method name(self): name end,
    method set-compiled(self, _, _): nothing end,
    method get-compiled(self): none end,
    method _equals(self, that, rec-eq): rec-eq(self.uri(), that.uri()) end
  }
end

fun make-dfind(mods :: List<{String; String}>):
  sources = for fold(sd from [SD.string-dict:], m from mods):
    sd.set(m.{0}, m.{1})
  end
  lam(ctxt, dep):
    cases(CS.Dependency) dep:
      | builtin(_) => CLI.module-finder(ctxt, dep)
      | else =>
        modname = dep.arguments.get(0)
        CL.located(string-to-named-locator(sources.get-value(modname), modname), ctxt)
    end
  end
end

fun problems-of(result):
  cases(E.Either) result:
    | right(_) => empty
    | left(errors) => errors.map(_.result-printer).map(_.problems).foldr(_ + _, empty)
  end
end

fun compile-typed-with(mods :: List<{String; String}>, program :: String):
  loc = string-to-named-locator(program, "tc-test-main")
  wlist = CL.compile-worklist(make-dfind(mods), loc, CLI.default-test-context)
  result = CL.compile-program(wlist, CS.default-compile-options.{type-check: true})
  errors = result.loadables.filter(CL.is-error-compilation)
  cases(List) errors:
    | empty => E.right(result.loadables)
    | link(_, _) => E.left(errors)
  end
end

fun errs-with(mods :: List<{String; String}>, program :: String) -> List<CS.CompileError>:
  problems-of(compile-typed-with(mods, program))
end

fun errs(program :: String) -> List<CS.CompileError>:
  errs-with(empty, program)
end

fun render(problems :: List<CS.CompileError>) -> List<String>:
  for lists.map(p from problems):
    RED.display-to-string(p.render-reason(), torepr, empty)
  end
end

fun msgs(program :: String) -> List<String>:
  render(errs(program))
end

fun msgs-with(mods :: List<{String; String}>, program :: String) -> List<String>:
  render(errs-with(mods, program))
end

fun all-match(problems :: List<CS.CompileError>, pred) -> Boolean:
  (problems <> empty) and lists.all(pred, problems)
end

fun tc-err(program :: String, pred) -> Boolean:
  all-match(errs(program), pred)
end

fun tc-err-with(mods :: List<{String; String}>):
  lam(program :: String, pred) -> Boolean:
    all-match(errs-with(mods, program), pred)
  end
end

# Serialized module boundary: writes modules to disk, then compiles the entry
# module twice against the same on-disk cache. The first compile sees its
# dependencies' types in memory; the second re-reads them from the serialized
# -static.js artifacts. Any difference between the two runs is a
# serialization round-trip bug. The entry module itself is never cached, so
# both runs re-typecheck it.
ser-base = "./tests/type-check/tmp-serialized/"
var ser-count = 0

fun compile-serialized-twice(mods :: List<{String; String}>, entry :: String) block:
  ser-count := ser-count + 1
  case-name = "case-" + tostring(ser-count)
  dir-rel = ser-base + case-name + "/"
  cache = P.resolve(ser-base + "compiled")
  FL.create-dir-tree(P.resolve(ser-base),
    [SD.string-dict: case-name, [SD.string-dict:], "compiled", [SD.string-dict:]])
  for each(m from mods) block:
    f = FL.open-output-file(dir-rel + m.{0}, false)
    FL.display(f, m.{1})
    FL.close-output-file(f)
  end
  dir = P.resolve(dir-rel)
  ctxt = {current-load-path: dir, cache-base-dir: cache, compiled-read-only-dirs: empty, url-file-mode: CS.all-remote}
  entry-path = P.join(dir, entry)
  fun run-once() block:
    base = CLI.module-finder(ctxt, CS.dependency("file", [list: entry-path]))
    wlist = CL.compile-worklist(CLI.module-finder, base.locator, base.context)
    starter-modules = CL.modules-from-worklist(wlist, CLI.get-loadable(cache, empty, _, _))
    starter-modules.remove-now(base.locator.uri())
    opts = CS.default-compile-options.{
      type-check: true,
      method on-compile(self, locator, loadable, trace) block:
        when locator.uri() <> base.locator.uri():
          CLI.set-loadable(cache, locator, loadable)
        end
        loadable
      end
    }
    result = CL.compile-program-with(wlist, starter-modules, opts)
    errors = result.loadables.filter(CL.is-error-compilation)
    cases(List) errors:
      | empty => E.right(result.loadables)
      | link(_, _) => E.left(errors)
    end
  end
  live = run-once()
  cached = run-once()
  {live: problems-of(live), cached: problems-of(cached)}
end

fun ser-msgs(mods :: List<{String; String}>, entry :: String) -> {live :: List<String>, cached :: List<String>}:
  result = compile-serialized-twice(mods, entry)
  {live: render(result.live), cached: render(result.cached)}
end

fun ser-err(mods :: List<{String; String}>, entry :: String, pred) -> Boolean:
  result = compile-serialized-twice(mods, entry)
  all-match(result.live, pred) and all-match(result.cached, pred)
end
