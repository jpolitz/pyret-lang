NPM package for a command line interface of the Pyret programming language.

The package ships a prebuilt compiler. `build.sh` builds `lang/` from this
repository and stages `build/phaseA` into `pyret-lang/`, which is where
`pyret.js` loads it from.

After installing the package, you can run

```
$ pyret --help
```

to get started.

## Compiler backends

The CLI can run on either the stock Pyret-hosted compiler (the default) or
the TypeScript port of the compiler (`pyret-lang/src/ts-compiler`) — the CLI
analogue of code.pyret.org's `?compiler=ts` flag:

```
$ pyret --backend ts my-program.arr      # or: PYRET_COMPILER=ts pyret my-program.arr
```

Each backend keeps its own Parley compile server (separate sockets), so both
can be used side by side. An explicit `--compiler <path>` overrides
`--backend`. The ts backend is available when the package was built with
`PYRET_NPM_TS=1 npm run build` (which additionally runs `make ts-compiler`
in `../lang` and packages its build output); the default build ships only
the stock compiler, and default behavior is unchanged.
