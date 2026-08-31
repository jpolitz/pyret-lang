# Testing with Pause Schedules

The current backend of the compiler runs with fixed starting points for GAS and
RUNGAS. These have worked out well in practice, but there's a big testing
coverage gap in always having them stuck at the same values – we may miss
stack-related bugs until something perturbs codegen to tickle a boundary.

I'd like to have a stronger sense that the stack-capture mechanisms work under
a variety of settings. This also nods towards a relevant *oracle* if we write a
new runtime, which is that comparable stacks are captured at comparable program
points.

Your task is to implement *pause scheduling* in the Pyret runtime, and related
test infrastructure.

## Design

My preference for configuration is to have it be *compiler* options that get
baked into standalones and do configuration at that level, rather than e.g.
environment variables or a special category of flag given to compiled
standalone .jarrs.

One option here would be to set this all up as new config that gets passed into
an instantiated `runtime`, and then let a user of the compiler pass in a path
to a *file* that computes the config with a dynamic node require (could also be
inlined directly or managed in other ways – your choice, but should be *code*,
see below). That handles the CLI case. In the in-browser case, the script that
creates the runtime for running a standalone can use JS, etc, to configure it
directly (this is where it matters to *not* rely on env variables, which stop
making so much sense in the browser).

This configuration should set up the runtime config a *getter* for initialGas
and initialRunGas.

This gives a ton of control:

- Schedules with seeded RNG that return a sequence of random values in a range
  for each
- Constant configured values
- Schedules that swap back and forth between RUNGAS and GAS triggering first
- etc.

You can make config-wiring changes to the compiler and runtime to achieve this.

## Testing

This infrastructure should then be used for running the tests under different
schedules. main2.arr is the main entrypoint; running all those tests with
different schedules under a new make rule will stress-test the system.

Design 6 different “pause schedule” profiles that explore the space, and run
main2.arr or other interesting representative tests (maybe mutual TCO,
interesting method call patters, torepr and equals callbacks – use your
judgment) under those profiles.

You can add new tests to specifically probe pause schedules.

## Details

Add this to *both* the Pyret and the TypeScript implementations. Since it's
oracle infrastructure, it's handy to have it around in both places. The codegen
outputs should be byte-identical, so we only need to run the outputs of one
side, but we should check that outputs are byte identical under the flag (so we
can measure either if they ever diverge).

Keep all tests passing (main2 under ts and Pyret, the bootstrap-converge,
ts-parity, etc), and report back on any interesting breakage you find when
running under different schedules.

The overall goal is a robustness check on the stack capture infrastructure that
(a) can be run in CI today and (b) can be used as an oracle later – we are
considering adding e.g. a Promise-based backend or a bytecode interpreter, and
“same stacks at same pause point” is a good oracle for that.

