Agent-written (Claude). The harness behind the numbers in
`../cli-repl-02-no-server.md`, plus the raw output of the runs those numbers
came from. Not part of the system — delete freely.

Scripts assume `~/work/pyret-lang/npm` is built with `PYRET_NPM_TS=1`
(`pyret-lang/build/phaseA` and `pyret-lang/build/ts-compiler` both staged).
They kill compile servers with `kill -9`, which leaves stale sockets in
`/tmp/parley-<user>/`; `rm -f /tmp/parley-*/*.sock` between runs or the next
CLI invocation exits 0 without compiling (see `../cli-repl-01-rebase.md`).

    bench-repl.js       drives `pyret --repl [--no-server]` line by line,
                        timing spawn -> first prompt and line -> next prompt.
    run-bench.sh        startup + per-expression, 5 reps in-process / 5 reps
                        warm server / 3 reps cold server.  -> bench-results.txt
    bench-proj.sh       three consecutive sessions importing proj/helper.arr.
                        -> bench-proj-results.txt
    bench-batch.sh      `pyret main.arr` on both backends, cold / warm / cache
                        cleared.  -> bench-batch-results.txt
    measure-rss.sh      resident memory of each back end, idle at the prompt.
    test-interrupt.js   sends SIGINT during a runaway loop, reports whether the
                        session answers afterwards.
    test-restart-cycle.js
                        N rounds of start-REPL / use / Ctrl-C / start again
                        against one surviving server; reports restart time and
                        the server's RSS after each round.
    test-concurrent.js  autograder shape: N submissions compiled+run at a given
                        parallelism against one warm server, each checked
                        against its own expected output.  See ../cli-repl-05-*.
    bench-autograder.sh sequential throughput per submission, both backends.
                        Its 4-way-parallel figure is meaningless on a 2-core
                        box; ignore it.
    summarize.py        medians from run-bench.sh / bench-proj.sh output.
