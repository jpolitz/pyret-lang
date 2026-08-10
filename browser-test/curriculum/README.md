# curriculum — "do the Bootstrap starter files still work?"

This directory answers one question when Pyret changes: **would a Bootstrap
student's starter file still open, run, and do what the lesson expects?**

It is one loop:

    for each entry in manifest.json:
      fetch the .arr at the pin  →  install it in /editor  →  Run
      →  require the outcome its spec row declares
      →  type its repl entries and match what renders

Everything the suite runs and checks is a file in a repo — Bootstrap's
starter files at a pinned tag, and the reviewed rows in `specs/`. There is no
run-time derivation: what ran is what you can read.

```bash
# needs the CPO server running (see ../README.md), or just:
make -C browser-test curriculum
```

## The pieces

```
manifest.json    REVIEWED: the student entry points (path, ref) and the pins
                 they were recorded against. The `pin` test fails when the
                 term tag moves off the recorded commit.
specs/<area>.js  REVIEWED: one row per starter file -- outcome, error pins,
                 check-block counts, and the repl entries to type after a
                 clean run. specs/index.js documents the row format and
                 validates the whole table against the manifest at load.
harness.js       fetch (cached under .cache/), install, run, judge, probe.
page-curriculum.js  window.CUR: the in-page snapshot a judgment reads.
tests/curriculum.test.js  the node:test entry point.
run.js           thin CLI (there is nothing to resolve first).
drafter.js       the re-pin tool: re-derives the entry-point list from the
                 curriculum repo, reports drift, drafts rows for new files.
```

Three parts, `--parts=` to select: `pin`, `shareurl` (the `#shareurl=`
delivery path, for the few file names that between them cover every rare
character — encoding bugs are per-character, not per-file), and `files`
(everything else).

One editor serves all files; any file whose test fails gets the editor thrown
away, so a failure cannot cascade into the files after it. Green runs pay
zero reboots.

## Outcomes

Three, documented in full in `specs/index.js`:

| outcome | means | pinned by |
|---|---|---|
| `runs` | finishes with an empty error area | check-block counts (some blocks are the exercise and MUST fail), then the `repl` entries |
| `interactive` | opens a window and waits for the student | `windowKind` (reactor animation vs Interactive Chart), whether it painted |
| `errors` | fails, on purpose or not | `errorContains`; `compileError: true` where the kind is the lesson; `upstream: true` marks bugs to report to Bootstrap, with a `note` saying what is wrong |

`readsSheet` marks the files that open a Google Sheet (recorded empirically —
a grep misses sheet loads inside libraries). On an editor that cannot reach
sheets, those files are judged as "blocked at Google auth", which still
proves the whole file compiled and every import resolved.

## Google Sheets

`--sheets=public` (the default) reads the curriculum's public sheets through
a **development-only** proxy over Google's own public export endpoints
(`/test-only/gsheet/*` in `code.pyret.org/src/server.js`, client side in
`sheets-public.js`). No credentials — a public sheet needs none, only a fetch
CORS doesn't block. Everything downstream of the transport is the shipping
code. `--sheets=none` runs against a plain editor with no Google dependency
at all; CI uses it for the push-triggered job, and the `--sheets=public` run
happens on a weekly schedule, because "Bootstrap's data moved" is a finding
to forward upstream, not a Pyret regression.

## Filtering

`--grep` is a regex over test names, and test names are repo paths:

```bash
node curriculum/run.js --grep 'Rocket Height'
node curriculum/run.js --grep '^data-science/'
node curriculum/run.js --parts=pin,shareurl
node curriculum/run.js --compiler=ts
node curriculum/run.js --sheets=none
```

`CURRICULUM_RUN_TIMEOUT_MS` raises the per-file budget on a slow machine.

## Re-pinning to a new term

When Bootstrap cuts a new tag (or the `pin` test reports the tag moved):

1. Update `manifest.json`'s `starterFiles` (ref and the commit the tag now
   points at — `git ls-remote https://github.com/bootstrapworld/starter-files
   <tag>`) and, if re-deriving, `curriculum.commit`.
2. `rm -rf curriculum/.cache`
3. `node curriculum/drafter.js` — it reports dead lesson links, links and
   import headers that bypass the tag (forward those upstream), entries to
   add or retire, and drafts manifest + spec rows for anything new.
4. **Review every drafted row.** A draft's outcome is `REVIEW` on purpose:
   classifying it takes a run, and judging it takes a human — "does not
   compile" is the lesson in one file (`compileError: true`) and an upstream
   bug in another (`upstream: true` + `note`). Trim the drafted `repl` lists
   against what the lesson actually has students type.
5. Re-run the suite in both sheet modes; the `--sheets=none` run is also what
   verifies the `readsSheet` markings.

## Known upstream findings

The `errors` rows with `upstream: true` are starter files that are broken for
students today (a lesson button that opens a compile error). They are pinned
so the suite stays green while the breakage stays visible; the fixes belong
in Bootstrap's repos. The drafter's report lists dead lesson links and
unpinned refs for the same reason.
