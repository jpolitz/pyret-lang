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

**3. The warning is almost certainly not about the flag.**

I could not find any warning anywhere in the CLI or the compiler that mentions
storage: `grep -i "warn\|warning"` across `npm/*.js`, `lang/src/arr/**` and
`lang/src/js/**` turns up only `client-lib.js`'s "Error during shutdown", one
unrelated comment in `js-numbers.js`, and the `[server]` log helpers (which are
compiled out — `LOG_LEVEL = ERROR`). Nothing in the compiler's own flag list
(`pyret.arr`, `cmdline.ts`) is storage-shaped either.

The mechanism that fits his description without any storage warning existing:
whatever his ordinary runs print, the flagged command *doesn't* print, because
the flagged command dies during argument parsing before the CLI does anything at
all. So "I get a warning when I don't provide that flag" and "no warning when I
do" is consistent with the warning being unrelated background noise — a Node
deprecation notice, an npm install warning, something from `canvas` — that
simply never gets reached on the failing invocation. **Worth just asking him to
paste the exact text**; that resolves it in one round trip and I would not guess
further.

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

> There is no `--localstorage-file` option — not on any released `pyret-npm`
> (I checked back through 0.0.80) and not in the current source. So the flag
> isn't undocumented; it isn't there.
>
> What you hit is a bug in how the CLI reports that. `command-line-args` raises
> a proper "Unknown option: --localstorage-file", but `pyret.js` catches every
> argument error, prints the whole help text, and exits 1 without saying what
> was wrong. Hence "doesn't seem to work" plus "not in `--help`". I'll make it
> print the actual error.
>
> Could you paste the exact warning text you get without the flag? I can't find
> any warning in the CLI or the compiler that mentions storage, and I suspect
> it's unrelated noise that just doesn't appear on the failing command because
> that command exits during argument parsing before anything runs.
>
> On the real question — right now the CLI persists exactly two things between
> runs, and neither is yours: the compiled-module cache and generated `.jarr`
> files under `./.pyret/`, and the compile server's socket in
> `/tmp/parley-<user>/`. There's a `--global-parley` option defaulting to
> `~/.parley/` that nothing reads. The REPL in particular saves nothing at all,
> not even command history.
>
> Which of these do you want for the fall?
>
> 1. REPL history that survives between sessions (easy — a file of past lines).
> 2. A place a *program* can read and write data that outlives the run — the
>    offline equivalent of the browser's localStorage. That's a library, and
>    the flag would just pick the file.
> 3. Somewhere stable for the compiled cache so `.pyret/` stops appearing in
>    every directory.
>
> (1) I can do quickly. (2) is the interesting one and needs a bit of design —
> if that's what you're after, tell me what the students' programs would call.
