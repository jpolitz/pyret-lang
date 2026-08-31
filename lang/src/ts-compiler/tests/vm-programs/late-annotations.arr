# Annotation timing. A `data` member's refinement may name a function
# defined LATER in the same letrec group, so the annotation cannot be built
# when the data declaration runs -- only when a constructor is first called.
# The JS back end thunks its compiled annotations for exactly this reason;
# the machine has to defer the same dereference.
#
# Regression: this crashed module load with "used before it has been
# initialized", and only showed up when the code.pyret.org trove was built
# as bytecode -- nothing in the lang/ suite happened to order a data
# declaration before its own refinement.

data FillMode:
  | mode-solid
  | mode-fade(n :: Number%(is-transparency))
end

fun is-transparency(n :: Number) -> Boolean:
  (n >= 0) and (n <= 1)
end

# The same shape one level deeper: a record annotation whose field carries a
# refinement defined later still has to work.
data Style:
  | style(opts :: { alpha :: Number%(is-transparency), name :: String })
end

print(mode-fade(0.5))
print("\n")
print(style({ alpha: 0.25, name: "x" }))
print("\n")

check "late-bound annotations":
  mode-fade(0) satisfies is-mode-fade
  mode-fade(1) satisfies is-mode-fade
  is-transparency(0.5) is true
  style({ alpha: 1, name: "ok" }) satisfies is-style
end
