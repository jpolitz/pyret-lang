# `--localstorage-file`: what is actually true, and a draft reply

*Written by Claude (agent). Not written by Joe, and not in his voice — the draft
at the bottom is substance to re-phrase, not text to send as-is. Claims marked
"measured" come from a command I ran here.*

## Findings

**1. The flag does not exist, and never has.**

Not in this tree (`git grep -i localstorage` hits only browser code under
`code.pyret.org/` and `docs/`), and not in any published `pyret-npm`. Measured:
I `npm pack`ed 0.0.80, 0.0.90, 0.1.20 and 0.1.24 and diffed their option lists.
Every one of them has exactly the same set, and no version has ever had anything
storage-related:

```
allow-builtin-overrides base-dir builtin-arr-dir builtin-js-dir checks
checks-format clean compiled-dir compiler deps-file global-parley help init
local-parley no-check-mode norun outfile perilous port program quiet
require-config shutdown standalone-file type-check version
```

(0.1.24 adds `backend`. `latest` on npm is 0.1.24; it does not have `--repl`
either, so whatever Shriram is running, it is not this branch.)

**2. "That doesn't seem to work" is a CLI bug, and a small one to fix.**

Measured, against the published 0.1.24:

```
$ pyret --localstorage-file hold-my-data new.arr
Pyret Command-line Interface v0.1.24
  The pyret command compiles and runs Pyret programs. ...
  [the entire ~120-line help text]
$ echo $?
1
```

`command-line-args` does throw a perfectly good error —
`UNKNOWN_OPTION: Unknown option: --localstorage-file`, with `e.optionName` set
(measured directly against the same `command-line-args` build) — but
`npm/pyret.js` wraps the parse in

```js
catch(e) {
  printUsage();
  process.exit(1);
}
```

and drops `e` on the floor. So the user gets a wall of help with no indication
of which argument was rejected, no line saying "unknown option", and a program
that silently didn't run. That is exactly the two symptoms in his mail: it
"doesn't seem to work", and the flag isn't in the help he was just shown.
Printing `e.message` before `printUsage()` fixes it. **I have not made this
change** — it is one line in `pyret.js` outside the REPL work, and it is your
call whether it rides along.

**3. The warning is a Node warning, and Pyret's own compiled output causes it.**
*(Resolved — this section originally said the warning was probably unrelated
noise and asked for the exact text. Shriram supplied it, and the guess was right
in shape but the cause is ours.)*

His verbatim text:

```
All modules already compiled. Cleaning up and generating standalone...
(node:8939) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
```

`--localstorage-file` is a **Node** flag. It is in `node --help`:

```
  --localstorage-file=...     file used to persist localStorage data
```

So the flag he tried to pass to `pyret` is real, it just belongs to `node`.
Nothing about it is a Pyret option, which is why `--help` does not list it and
why `command-line-args` rejects it.

**What reads `localStorage`.** Not the compiler, and not the compile server —
**his own compiled program**. I preloaded a getter on `globalThis.localStorage`
into every process in the CLI (`cli-repl-bench/trap-ls.js`) and ran a compile.
The only reads come from the generated `.pyret/<name>.jarr`, twice, at load:

```
[LOCALSTORAGE READ] pid=97257 argv=.../.pyret/new.jarr
    at config     (.../new.jarr:45715:17)
    at Object.deprecate (.../new.jarr:45682:7)
    at             (.../new.jarr:44333:25)
```

`config` and `deprecate` are `util-deprecate`. Both call sites are
`readable-stream`'s deprecation shim for `WritableState.prototype.buffer`
(DEP0003), evaluated at module top level — there are two copies of
`readable-stream` in the bundle, hence two reads. `util-deprecate`'s `config()`
reads `global.localStorage` to decide whether to suppress deprecation notices.

That is why the warning appears immediately after *"Cleaning up and generating
standalone..."*: that is the moment `client-lib.js` spawns
`node .pyret/new.jarr` with `stdio: 'inherit'`. It fires on **every run of
every Pyret program**, and it has nothing to do with his code or his data.

**Why `util-deprecate`'s browser build is in there** is the same bug as canvas
and cross-fetch (report 06): its package.json has `"browser": "browser.js"`,
browserify honours the browser field, so `require-node-dependencies.js` bundles
the browser variant — the one that probes `localStorage`. The node build of
`util-deprecate` reads `process.noDeprecation` instead and would never touch it.

**Why I could not reproduce it here.** Node version. On Node 24.20,
`globalThis.localStorage` is simply undefined and reading it is silent; under
`--experimental-webstorage` it *throws* `ERR_INVALID_ARG_VALUE` rather than
warning. The `ExperimentalWarning` wording is the older Node behaviour, so
Shriram is on 22.x or 23.x. Worth noting the forward risk: on a Node where
webstorage is enabled without a file, that read stops being a warning and
becomes a crash at program load.

**Workaround for him today (measured).** It is a Node warning, so
`NODE_OPTIONS=--no-warnings` silences it, and it propagates to the spawned
`.jarr`:

```
$ NODE_OPTIONS=--no-warnings pyret new.arr
Looks shipshape, your test passed, mate!
```

I verified the propagation by emitting a stand-in `ExperimentalWarning` from
inside the spawned jarr — visible by default, gone with `--no-warnings`, both
lines included.

**Real fix, on our side.** Keep `util-deprecate` out of the browser-field
substitution — either browserify with the browser field off for these, or
`nodeRequire` them so the node build is used. Or update whatever drags in the
two ancient `readable-stream` copies. Same one-line shape as the canvas item in
report 06, and it removes a spurious warning from every student's every run.

**4. What the CLI actually persists across runs, today.**

* `./.pyret/` in the working directory (`--local-parley`, default `.pyret`):
  the compiled-module cache in `.pyret/compiled/` (`<name>-<sha>-static.js` and
  `-module.js`), the generated standalone `.pyret/<name>.jarr`, and a
  `node_modules` symlink. Measured: after `pyret new.arr`, `.pyret/compiled`
  holds two files and `.pyret/new.jarr` is 9.2 MB.
* `/tmp/parley-<username>/comm.sock` (`--port`): the compile server's socket.
  That is the only cross-invocation state outside the project directory.
* `~/.parley/` — the default value of `--global-parley`. Measured:
  `grep -rn "global-parley\|globalParley" npm/*.js` returns exactly one hit, the
  option definition itself. **Nothing reads it.** It is a dead option. (It and
  `--local-parley` are also the only two entries in `optionDefinitions`
  declared without a `group:`, so they land in `options._all` and nowhere else.
  That is unrelated to why they are absent from `--help` — the help text is a
  separate, hand-maintained `optionList` in `usages`, so *every* flag has to be
  documented twice and several already aren't.) If a storage flag ever gets
  added, `--global-parley` is the natural place for it to live, and it should
  either be wired up or deleted.
* **The REPL persists nothing at all.** Measured: I ran three consecutive
  `pyret --repl` sessions in the same project directory, each importing a local
  `helper.arr`, on both the server-backed and the in-process back end. In both
  cases `.pyret/compiled` was still empty afterwards — the REPL's interaction
  locators declare `needsCompile: true` and a no-op `setCompiled`, and nothing
  writes user modules to disk. There is also no history file: the readline
  interface is created with `historySize: 500` and no `history` option, so
  history lives in RAM and dies with the process.

So: there is no file, anywhere, that holds anything a student would recognise as
their data or their session between runs.

**5. Is the underlying request real? Yes, and it's three different features.**

"the local storage file" could reasonably mean any of:

* **REPL history that survives.** Cheapest by far — Node's `readline` takes a
  `history` array, so it is read-a-file/write-a-file. `~/.pyret_history`, or
  `--history-file`. This is what most people mean by "my REPL forgot everything".
* **A program-visible key/value store**, i.e. a Pyret-side API so a program can
  `store.set("scores", ...)` and get it back next run — the offline analogue of
  what `localStorage` is in the browser. This is a language-surface feature, not
  a CLI flag, and it needs a trove; the flag would only choose the backing file.
* **A stable location for the compile cache**, i.e. "stop scattering `.pyret/`
  through my directories". That is `--compiled-dir` plus a wired-up
  `--global-parley`.

They are unrelated pieces of work, and I do not think it is worth guessing which
one he wants.

## Draft reply — substance only, please re-phrase

> Good news and bad news. `--localstorage-file` is a real flag, but it's
> **Node's**, not Pyret's — it's in `node --help`, and it tells Node where to
> persist its experimental `localStorage`. Pyret has no such option, which is
> why it isn't in `pyret --help`.
>
> The warning is our fault, not yours, and it's harmless. It comes from the
> compiled program Pyret generates and runs for you — the `.jarr` — not from
> your code. We bundle a library (`util-deprecate`, pulled in by
> `readable-stream`) and we accidentally bundle its *browser* build, which
> reads `localStorage` on startup to decide whether to print deprecation
> notices. On your Node version, touching `localStorage` without
> `--localstorage-file` produces that warning. It fires twice on every run of
> every Pyret program and means nothing about your program.
>
> To silence it now:
>
>     NODE_OPTIONS=--no-warnings pyret new.arr
>
> I'll fix it properly on our end so nobody sees it.
>
> Two other things from this:
>
> The reason `pyret --localstorage-file hold-my-data new.arr` printed the whole
> help text with no explanation is a bug in our CLI — the argument parser does
> raise a clear "Unknown option: --localstorage-file", and we throw the message
> away before printing usage. Fixing that.
>
> And if you *do* want persistence, tell me which one you mean, because right
> now the CLI keeps nothing of yours between runs — only the compiled-module
> cache and generated `.jarr` files under `./.pyret/`, plus the compile
> server's socket in `/tmp`. The REPL saves nothing at all, not even command
> history.
>
> 1. REPL history that survives between sessions. Easy, and probably the thing
>    you'll miss most in class.
> 2. A place a *program* can read and write data that outlives the run — the
>    offline equivalent of the browser's localStorage. That's a library, and a
>    flag would just pick the file.
> 3. Somewhere stable for the compiled cache, so `.pyret/` stops appearing in
>    every directory.
>
> (1) I can do quickly. (2) is the interesting one and needs some design — if
> that's what you're after, tell me what the students' programs would call.
