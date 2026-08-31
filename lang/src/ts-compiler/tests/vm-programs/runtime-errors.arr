# Runtime errors raised from interpreted frames: the message, the source
# location, and the fact that the failure is catchable, all have to look the
# same as they do from generated code.
import error as E
import contracts as C
import either as EI

fun get-err(thunk):
  cases(EI.Either) run-task(thunk):
    | left(v) => raise("no error: " + torepr(v))
    | right(exn) => exn-unwrap(exn)
  end
end

fun bad-ann():
  x :: Number = "not a number"
  x
end

data Box: box(v) end

check "runtime errors":
  get-err(lam(): 1 + "x" end) satisfies E.is-num-string-binop-error
  get-err(lam(): [list: 1].foo end) satisfies E.is-field-not-found
  get-err(lam(): 5() end) satisfies E.is-non-function-app
  get-err(lam(): box(1, 2) end) satisfies E.is-constructor-arity-mismatch
  tostring(get-err(lam(): raise("boom") end)) is "boom"
  get-err(lam(): cases(Box) box(1): | nothing-here => 1 end end)
    satisfies E.is-no-cases-matched
  # A failed annotation check (ANNCHECK/ANNCHECKV on the machine).
  get-err(bad-ann) satisfies C.is-fail
  # An error raised many interpreted frames deep is still catchable, and the
  # machine's frames do not leak into the result.
  get-err(lam(): map(lam(x): x.no-such-field end, [list: {a: 1}]) end)
    satisfies E.is-field-not-found
end
