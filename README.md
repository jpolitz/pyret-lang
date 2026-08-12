# Pyret

This repository holds the implementation of the Pyret programming language and
its related tools.

## Directories

Most directories map explicitly to logical components and deployed systems:

- `lang/`: compiler and standard libraries
- `code.pyret.org/`: server and client files for the code.pyret.org web service
- `embed/`: static HTML embedding package (https://www.npmjs.com/package/pyret-embed)
- `npm/`: CLI package (https://www.npmjs.com/package/pyret-npm)
- `docs/`: Scribble source of the Pyret documentation
- `codemirror-mode/`: CodeMirror 5 mode for Pyret highlighting and indentation
- `pyret.org/`: Pollen source of the pyret.org homepage
- `vscode/`: Visual Studio Code extension (https://marketplace.visualstudio.com/items?itemName=PyretProgrammingLanguage.pyret-parley, https://open-vsx.org/extension/PyretProgrammingLanguage/pyret-parley)

Individual directories are separate projects, and have their own READMEs,
Makefiles, package dependencies, and so on. Some of them create or contain
symlinks to others (e.g. `code.pyret.org` relies on a symlink to `lang/`).

There are also directories only related to testing:

- `.github/`: for automated testing workflows (testing only; deployment to
  servers and package registries is managed outside of this repository)
- `browser-test/`: shared infrastructure for headless testing across the
  browser and webview components (code.pyret.org, embed, vscode)

## Historical Note

This monorepo was consolidated from several now-readonly repositories in 2026:

- `code.pyret.org/` -> brownplt/code.pyret.org
- `docs/` -> brownplt/pyret-docs
- `codemirror-mode/` -> brownplt/pyret-codemirror-mode
- `npm/` -> brownplt/pyret-npm
- `pyret.org/` -> brownplt/pyret.org
- `embed/` -> brownplt/pyret-embed
- `vscode/` -> jpolitz/pyret-parley-vscode
- `lang/` -> brownplt/pyret-lang (this repository), #horizon and #master
  branches. (This repository was kept at the same Github org/repo to maintain
  issues, PRs, and other historical references)

