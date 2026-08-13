import string-dict as SD
import either as E
import render-error-display as RED
import file("../../src/arr/compiler/compile-lib.arr") as CL
import file("../../src/arr/compiler/compile-structs.arr") as CS

# An in-memory compile driver: no filesystem, no CLI assumptions.
# Compiles source strings through the full pipeline (parse -> well-formed ->
# scope -> desugar -> ANF -> stock codegen) and renders static errors the
# same way the CLI does.

fun mem-locator(uri :: String, s :: String):
  {
    method needs-compile(self, _): true end,
    method get-modified-time(self): 0 end,
    method get-options(self, options): options end,
    method get-module(self): CL.pyret-string(s) end,
    method get-native-modules(self): [list:] end,
    method get-dependencies(self): [list:] end,
    method get-extra-imports(self): CS.minimal-imports end,
    method get-globals(self): CS.no-globals end,
    method uri(self): uri end,
    method name(self): uri end,
    method set-compiled(self, _, _): nothing end,
    method get-compiled(self): none end,
    method _equals(self, other, rec-eq): rec-eq(other.uri(), self.uri()) end
  }
end

fun no-finder(ctx, dep):
  raise("This driver compiles dependency-free programs only")
end

opts = CS.default-compile-options.{checks: "none", display-progress: false}

fun compile-one(name :: String, src :: String) block:
  print("=== " + name + "\n")
  result = run-task(lam() block:
    loc = mem-locator("memory://" + name, src)
    wl = CL.compile-worklist(no-finder, loc, nothing)
    program = CL.compile-program(wl, opts)
    program.loadables.first
  end)
  cases(E.Either) result block:
    | left(loadable) =>
      cases(CL.Loadable) loadable block:
        | module-as-string(_, _, _, cr) =>
          cases(CS.CompileResult) cr block:
            | ok(ccp) =>
              code = ccp.pyret-to-js-runnable()
              print("compiled ok: " + tostring(string-length(code)) + " chars of JS\n")
            | err(problems) =>
              for each(p from problems) block:
                print(RED.display-to-string(p.render-reason(), torepr, empty))
                print("\n")
              end
          end
        | else => print("unexpected loadable\n")
      end
    | right(exn-v) =>
      err-v = exn-unwrap(exn-v)
      rendered = run-task(lam():
        RED.display-to-string(err-v.render-reason(), torepr, empty)
      end)
      cases(E.Either) rendered block:
        | left(str) => print(str + "\n")
        | right(_) => print("error (unrenderable): " + torepr(err-v) + "\n")
      end
  end
  print("\n")
end

compile-one("simple-program", "lam(x): x end(42)")
compile-one("parse-error", "1 +")
compile-one("well-formedness-error", "block: end")
compile-one("unbound-id", "some-unbound-name")
print("driver done\n")
