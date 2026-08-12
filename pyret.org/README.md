pyret.org
================================================================================

The source for `pyret.org`, the site for Pyret.

Installation
--------------------------------------------------------------------------------

Basic pollen setup:

```
npm install
raco pkg install pollen
```

Then, to test:

```
raco pollen start
```

Use:

```
raco pollen publish . <somewhere>
```

to get the published version at <somewhere>

To build the docs into `site/docs/` (from the sibling `docs/` directory):

```
make docs
```


Instructions on how to edit coming soon.

For embeds, run:

```
cp -r node_modules/pyret-embed/dist site/
```
