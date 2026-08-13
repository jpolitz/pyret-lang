NPM package for a command line interface of the Pyret programming language.

The package ships a prebuilt compiler. `build.sh` builds `lang/` from this
repository and stages `build/phaseA` into `pyret-lang/`, which is where
`pyret.js` loads it from.

After installing the package, you can run

```
$ pyret --help
```

to get started.
