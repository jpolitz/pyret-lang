Programs that exist to stress the interpreter back end specifically, run by
`make vm-parity-test` alongside the shared `tests/programs/` corpus.

Every program here must COMPILE AND RUN: matching compile errors would be
parity that exercises no back end at all. The harness enforces this (only
`err-*.arr` may stop at a compile error), which is not a hypothetical --
three of the four programs here were silently doing exactly that until the
check existed.

They are kept out of `tests/programs/` because that corpus is also the
.arr-vs-ts *compiler* parity corpus, where these would only add build time:
nothing here is about the front end. What they exercise is where the machine
differs from generated code -- an explicit heap frame stack instead of the
runtime's ActivationRecords, frame reuse on tail calls, by-value upvalue
capture, and the boundary where interpreted code calls into JS-land and back.
