# code.pyret.org test suites

Two kinds of files live here, and only one of them runs under mocha.

## Run by `npm run mocha` (CI: code.pyret.org-test.yml)

Selenium suites for behavior that the top-level `browser-test/` harness does
not cover:

- `embed.js` — the postMessage embed protocol (`/embed/embed1.html`, `embed2`)
- `image-equality.js` — pixel-diffs rendered images against
  `../test-util/test-images/*.png`
- `number.js` — rational/repeat rendering and number toggles at the REPL
- `pyret.js` — image programs from `../test-util/pyret-programs/images/`
- `shareUrls.js` — loading real `#share=` Google Drive ids
- `static-pages.js` — server-side mustache substitution on `/faq`
- `world.js` — reactor programs run cleanly

The mocha script in `package.json` lists these files explicitly.

## Spec sources for `browser-test/` (not run under mocha)

- `check-blocks.js`, `errors.js`, `chart.js`, `type-check.js`, `tables.js`,
  `url-imports.js`

These are not invoked by mocha. `browser-test/shared/load-cpo-specs.js`
requires them with the mocha globals and `../test-util/util.js` stubbed by
recording shims, harvesting the exact (program, expectation) tuples, and
`browser-test` then runs those same assertions in every environment
(cpo, embed, embed-static, vscode, vscode-ovsx) against both compilers.
Running them here too would test the cpo environment a second time.

Edit them freely — new entries in their test tables are picked up by
`browser-test` automatically — but keep their module shape (registration via
`../test-util/util.js` helpers) intact, since the harvester depends on it.
