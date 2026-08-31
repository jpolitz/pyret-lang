# Promise-based, Bytecode VM Backend for Pyret

Let's add a new backend to Pyret. Two key design points:

1. It is a bytecode interpreter. Design a bytecode specification based on the
   syntactic forms from post-ANF and the operations defined in the runtime. Add
   a codegen pass to create bytecode and an interpreter for it.
2. It uses *promises* and *async/await* for suspension, rather than the custom
   ActivationRecord infrastructure of the current runtime.

## Why these design points

**Why Bytecode**: The generated JS for the current backend is quite large, and
already compiles to a complex step machine. It's worth trying a bytecode
interpreter plus (later, not this goal) optimizations on top of it. Hypothesis:
The interpreter loop is ~as fast as all the individual bespoke functions (they
are too big/complex to optimize well in the engine), and speed will come from
finding ways to compile functions as straightline code. The bytecode will ship
our compiled stdlib much smaller.

Equally importantly, the VM representation unlocks a lot of oppurtinities for
debugging, tracing, serializing, and otherwise treating the runtime as a data
structure rather than having so much of it bound up in the JS stack.

**Why Promises**: It sucks to implement against our custom stack
representation, because a mistake drops frames on the floor and leads to
inscrutable "wrong answer" compiler bugs. Using promises let's us give a clean
`Awaitable` type to the returns from functions that interop between Pyret and
raw JS, which helps 3rd parties use TS to check it, and gives better
promise-related error messages.

## Writing Code

I recommend making a *copy* of runtime.js, call it vm-runtime.js, for any
promise-based changes and for the interpreter.

Add the new backend as a *flag* to the compiler (`-backend vm`), and also flag
it in on code.pyret.org as a URL parameter. Similar infrastructure to the ts
mode (separate compiled caches and so on to get parallel structure).

*Do* make sure it works in code.pyret.org; this will require a little thinking
about places where we assumed “flat enough” functions that wouldn't pause, and
may return promises now. You can either re-implement those helpers in
synchronous JS if small, or do a little isthenable style checking in small
doses.

*Just* implement it in TypeScript, it doesn't need to also have a .arr side
implementation.

There is *one* optimization to carry into the bytecode interpreter -- functions
marked flat should be compiled to straightforward synchronous JavaScript, and
called out to from the bytecode VM. Without this a lot of easy performance is
left on the table. This might be a special "FLATCALL" opcode, or re-use
something for prim calls, your design choice.

You can do optimizations at the byecode level: fused opcodes (methodcall or
even tailmethodcall might be good ones), pre-allocate or otherwise pool memory
for an explicit stack, come up with clever representations, and so on.

*Don't* add any new source-to-source transformations if you can help it; try to
work purely on the post-ANF tree that would have been fed to
`anf-loop-compiler`. This keeps the initial design comparison tractable

## Correctness

The large build of `main2.arr` is the first-line correctness check: the VM must
pass all of these tests.

Second, the compiler should be able to run the `bootstrap-converge` test in
this configuration.

There is a stronger oracle – pause schedules. These are configurable settings
for GAS and RUNGAS in the current backend for how they get initialized and
reset. The new backend must also support pause schedules, and should be able to
run all the tests against the existing randomized and adversarial schedules.

Further, you must implement a new oracle that configures running the new
backend and the existing backend *on the same pause schedule*, and checks that
the “same” stacks were captured at the same pauses. You can engineer this
however makes sense (e.g. collect traces is the most obvious to me). The
definition of same-ness is contingent on your implementation and may have some
projection (e.g. eliding vm- or cont-backend specific runtime helper frames).
It *should* catch issues like one side doing a tail call the other doesn't –
those are *not* OK to elide. If we printed an error message from the capture,
it should be possible to print the same stack trace as the current compiler,
for example. This is the strongest oracle, and means the VM is also
wart-for-wart compatible (yes the VM must replicate the hack where calls become
non-tail on certain closure cases).

(This is pretty cool, right? This is how we do a ton of work and have
confidence we match what's there)

## Performance

In your report, include measuremnts of VM vs. current compiler on the
lang/tests/async-opt benchmarks. You still succeed if the bytecode VM is
slower, the comparison needs to be in the report.

Also measure the size of the trove/ stdlib with bytecode and compare to the JS
output of the current compiler (relevant for browser load times), and *compile
times* of the bytecode VM codegen vs. the current compiler.

## References

Another agent pass wrote BYTECODE_VM_PREP_REPORT.md. It has some useful
references, but this is meant to be a clean attempt under a strong oracle, so
the standing advice about rederiving for yourself when you read a prose
statement of fact applies.


