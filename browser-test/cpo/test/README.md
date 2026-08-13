# The editor (CPO) test corpus

These suites and the `../test-util/` harness/fixtures moved here from
`code.pyret.org/` — they test the editor's behavior, not the server code, so
they live with the rest of the browser testing infrastructure. Two kinds of
files sit here, and only one of them runs under mocha.

## Run by `npm run cpo-mocha` (from `browser-test/`; CI: code.pyret.org-test.yml)

Selenium suites for behavior that the harness's five environments do not
cover. They drive `/editor` on a running CPO server (`BASE_URL`):

- `embed.js` — the postMessage embed protocol (`/embed/embed1.html`, `embed2`)
- `image-equality.js` — pixel-diffs rendered images against
  `../test-util/test-images/*.png`
- `number.js` — rational/repeat rendering and number toggles at the REPL
- `pyret.js` — image programs from `../test-util/pyret-programs/images/`
- `shareUrls.js` — loading real `#share=` Google Drive ids
- `static-pages.js` — server-side mustache substitution on `/faq`
- `world.js` — reactor programs run cleanly

`make cpo-mocha` (in `browser-test/`) builds the prerequisites, starts the
server, and runs them. The suites read fixtures with `test-util/...` paths
relative to `browser-test/cpo/`, which is why the npm script `cd`s there.

## Spec sources for the five-environment suite (not run under mocha)

- `check-blocks.js`, `errors.js`, `chart.js`, `type-check.js`, `tables.js`,
  `url-imports.js`

These are not invoked by mocha. `../../shared/load-cpo-specs.js` requires them
with the mocha globals and `../test-util/util.js` stubbed by recording shims,
harvesting the exact (program, expectation) tuples, and the harness then runs
those same assertions in every environment (cpo, embed, embed-static, vscode,
vscode-ovsx) against both compilers. Running them here too would test the cpo
environment a second time.

Edit them freely — new entries in their test tables are picked up
automatically — but keep their module shape (registration via
`../test-util/util.js` helpers) intact, since the harvester depends on it.
