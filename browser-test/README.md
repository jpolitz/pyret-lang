# browser-test — code.pyret.org's editor assertions, on embed instances and vscode webviews

NOTE(joe): Originally Claude-generated README here with only minor edits

This directory runs the **same assertions** from `code.pyret.org`'s editor test
suite against the three places the Pyret editor renders. It's a **`node:test`**
suite (no extra test-framework dependency) driven through **one runner**:

```
node run.js --env=cpo|embed|embed-static|vscode|vscode-ovsx [--grep=<regex>] [--suites=all|check-blocks,errors,...]
```

| `--env` | What it drives |
|---|---|
| `cpo` | the reference — `code.pyret.org`'s `/editor` page (reproduces upstream's outcomes) |
| `embed` | the embed API's embedded instance (`<iframe>` in `/embed/embed1.html`) |
| `embed-static` | the **pyret-embed library** (`embed/dist/pyret.js`) driving the **built** `editor.embed.html` artifact on a plain static server — the npm-consumer flow, no CPO server |
| `vscode` | the `pyret-parley.cpo` webview, in headless VS Code for the Web |
| `vscode-ovsx` | the same webview, but with its assets served the way **Open VSX** serves them to the **GitLab Web IDE** — reproduces issue #21 |

### `vscode-ovsx` — the GitLab Web IDE / Open VSX reproduction

`--env=vscode` serves the webview assets from a local static server with correct
MIME types and no size limit (that's how `@vscode/test-web` works), so it can't
see the way the extension breaks in the GitLab Web IDE. There, GitLab resolves
the webview's resources to Open VSX (`open-vsx.org/vscode/unpkg/...`), which
serves **every** file as `Content-Type: text/plain` + `X-Content-Type-Options:
nosniff` (so `<script src>`/`<link>` are refused execution) and **503s** files
over a ~15 MB cap (so the 37 MB `cpo-main.jarr.js` never loads). That's
[issue #21](https://github.com/jpolitz/pyret-parley-vscode/issues/21).

`vscode-ovsx` reproduces exactly that. `shared/ovsx-server.js` serves the built
`dist/web/build/web` with those hostile semantics; the editor HTML is rendered
the same way `getHtmlForWebview` does, with `BASE_URL`/`PYRET` pointed at it. It
does not boot VS Code — it injects a no-op `acquireVsCodeApi` (so beforePyret
takes the real `window.PYRET_IN_VSCODE` branch, the path issue #21 broke)
and passes `initialState` in the URL hash (so `events.js` self-resets the editor
and gains control locally, giving `editorReady` its non-empty CodeMirror).

Hostile mode is the regression test for #21: it fails if the self-contained
template stops booting under nosniff serving. To separate a real regression
from broken harness plumbing, run **faithful** mode (correct MIME, no cap) —
that should boot and pass just like `vscode.dev`:

```bash
node run.js --env=vscode-ovsx                 # hostile (default): the #21 regression test
OVSX_FAITHFUL=1 node run.js --env=vscode-ovsx  # correct MIME/no cap: plumbing check
```

Env vars: `OVSX_FAITHFUL=1` (correct serving), `OVSX_ASSET_ROOT=<dir>` (override
the served build; defaults to `vscode/dist/web/build/web`), `OVSX_CAP_MB=<n>`
(hostile size cap, default 15). A standalone one-shot check that skips the full
spec suite lives in `smoke-ovsx.js`.

### `embed-static` — pyret-embed driving the built `editor.embed.html` artifact

`--env=embed` drives `/editor#controlled=true` through a running CPO server, so
it never loads `build/web/editor.embed.html`: the file an embedding host
actually deploys, rendered once at build time from `src/web/editor.html` +
`.env.embed` (`BASE_URL="."`, relative asset paths, `POSTMESSAGE_ORIGIN="*"`).
`embed-static` serves `build/web` from a plain correct-MIME static server
(`shared/static-server.js`) and embeds it through the **real pyret-embed
library**: a host page (`pages/embed-static-host.html`, mirroring the package's
own `embed/src/basic.html` examples) imports `embed/dist/pyret.js` and calls
`makeEmbedConfig({ src: "/editor.embed.html", ... })` — the exact flow an npm
consumer of `pyret-embed` runs. It catches breakage that lives only in the
built artifact or the library: template variables mis-rendered at build time,
asset references that resolve at a server root but 404 under relative/static
hosting, and pyret-embed API drift against the editor. Needs the CPO build and
`embed/dist` (`npm ci --ignore-scripts && npx webpack` in `embed/`) — no
server, no `code.pyret.org/node_modules`. `EMBED_STATIC_ROOT=<dir>` overrides
the served build dir.

It is **strictly additive**: nothing under `code.pyret.org/` or `vscode/` is
modified; the upstream test files are read as-is.

## Why this is "the same tests"

All three environments render the **same** CPO editor (`editor.html`: CodeMirror,
`#runButton`, `#output`, `.check-block`, `.testing-summary`, "Looks shipshape").
Only how you *reach* that DOM differs — the editor is the main page (cpo), a child
iframe (embed), or a webview frame (vscode) — and a single `findEditorFrame`
helper (the frame with a `#runButton`) locates it in every case.

Two mechanisms keep the inputs and assertions identical to upstream:

- **Same inputs, zero copying.** `shared/load-cpo-specs.js` `require`s the
  unmodified `code.pyret.org/test/*.js` with the mocha globals and `util.js`
  replaced by *recording shims*, capturing the exact `(program, expected)` tuples
  upstream feeds its assertions — the same check-block table, the same
  error→substring table, the same `.arr` chart/table programs. No spec is copied.

- **Same assertions.** `shared/page-assertions.js` is a line-for-line, in-page
  port of the `util.js` predicates (`checkAllTestsPassed` / `testErrorRendersString`
  / `testRunsAndHasCheckBlocks` / `testRunAndUseRepl` / `checkTableRendersCorrectly`);
  `shared/cpo-assertions.js` orchestrates them exactly as `util.js` does, using
  **`node:assert`** for the content checks. Each function carries its `util.js`
  source reference. Because the port runs in-page via Playwright, it can reach a
  vscode webview (Selenium can't), so the *same* assertion code runs in all three
  environments.

  Running `--env=cpo` reproduces upstream's pass/fail on the real `/editor` page,
  which is what makes the port a trustworthy stand-in for `util.js`. (The port was
  first validated head-to-head against the real Selenium `util.js` suite; see the
  git history of this directory — the `util.js` path and the port produced
  identical results before the harness was consolidated onto the port.)

- **Two failure kinds, kept distinct.** Content checks use `node:assert`, so a
  wrong rendering fails as an **`AssertionError`** (with a value diff — "expected
  `failed`, got `Passed`"). Anything that prevents the test from being conducted —
  a program that wouldn't install, a value that never rendered, the REPL erroring —
  throws a **`ProceduralError`** (`shared/errors.js`). Both fail the test; the
  error class tells you which kind at a glance.

### Two webview details the port handles

- The `pyret-parley.cpo` custom editor starts with the interactions panel
  collapsed (`hideInteractions`), but the CPO editor removes that class on the
  first run (`beforePyret.js:1594`), so the REPL becomes available — which is why
  the REPL-driven suites (type-check, tables) run in the webview too.
- The run mode is sticky (`cpo-main.js`: `currentAction`): after a type-check
  run, the plain Run button keeps running type-checked. Since one editor frame is
  reused across suites, `PA.run()` selects the explicit "Run" dropdown item, which
  resets the mode. (Upstream never sees this — a fresh browser per suite.)

## Layout

```
run.js                  friendly CLI: --env/--grep -> `node --test ...` + PYRET_ENV
tests/suite.test.js     the node:test entry: boots one env, one test() per spec
envs/
  cpo.js                goto /editor (the one env that also runs under real Safari)
  embed.js              goto /embed/embed1.html, sendReset, find the iframe
  embed-static.js       pyret-embed (embed/dist) against the built editor.embed.html (no CPO server)
  vscode.js             boot @vscode/test-web, open the custom editor, find the webview
  vscode-ovsx.js        serve the webview via a simulated Open VSX (issue #21 repro)
pages/
  embed-static-host.html  host page embedding the artifact via pyret-embed's makeEmbedConfig
shared/
  static-server.js      plain correct-MIME static server (multi-root)
  ovsx-server.js        static server that mimics Open VSX serving (text/plain+nosniff, size cap)
  load-cpo-specs.js     extract exact specs from code.pyret.org/test/*.js (no copying)
  page-assertions.js    in-page DOM port of util.js predicates (window.PA)
  cpo-assertions.js     node:assert assertions mirroring util.js, per content check
  dispatch.js           map a loaded spec to its assertion
  errors.js             ProceduralError (procedural failures vs content AssertionError)
  playwright-page.js    `page` adapter over a Playwright frame
  webdriver.js          minimal W3C WebDriver client (real Safari; see below)
  webdriver-page.js     the same `page` adapter over a WebDriver session
  find-frame.js         locate the editor frame (the one with #runButton)
  browser.js            open a browser: Chromium via Playwright, or Safari via WebDriver
vscode/fixture-workspace/test.arr   the .arr the custom editor opens
results/                captured run logs
```

## Running

Prereqs (one-time):

```bash
# code.pyret.org built + deps (build/web/js/cpo-main.jarr, code.pyret.org/node_modules)

# vscode extension built
cd vscode && ln -sf ../code.pyret.org/build build && npm install && npm run compile

# this harness's deps
cd ../browser-test && npm install     # playwright + @vscode/test-web

# Chrome (Playwright drives it via executablePath)
export GOOGLE_CHROME_BINARY=/bin/google-chrome
```

Then:

```bash
# cpo + embed load /editor from the CPO server, so start it first:
#   (cd code.pyret.org && BASE_URL=... PYRET=... PORT=4999 ... node src/run.js &)
BASE_URL=http://localhost:4999 node run.js --env=cpo
BASE_URL=http://localhost:4999 node run.js --env=embed

# vscode needs no CPO server (assets come from the built extension):
node run.js --env=vscode

# embed-static needs no CPO server either (build the library once:
#   cd embed && npm ci --ignore-scripts && npx webpack):
node run.js --env=embed-static

# everything (starts the CPO server if needed):
./run-all.sh
```

### Filtering (local dev)

`--grep` is a regex matched against both suite names and individual test names —
so you can scope to one feature or one env:

```bash
node run.js --env=embed  --grep tables       # the tables suite, in the embed instance
node run.js --env=cpo    --grep 'is-not'      # every is-not* test, in /editor
node run.js --env=vscode --grep field-not-found

npm run embed -- --grep tables                # same, via package scripts
```

Other flags: `--suites=check-blocks,errors,...` (default `all`),
`--reporter=spec|tap|dot|junit` (default `spec`). Or skip the wrapper entirely:
`PYRET_ENV=embed node --test --test-name-pattern=tables tests/suite.test.js`.

## Running `cpo` against real Safari

`make cpo-safari` runs the same `cpo` specs in **Apple's Safari** instead of Chromium.
The motivating case is checking an *old* Safari (17.x), which is otherwise hard to get
at: GitHub's `macos-14` runner image ships a current Safari regardless of the OS pin,
and Playwright's `webkit` is a separate WebKit build, not the shipped browser.

Only `cpo` supports this. It is the one env that is same-origin, needs no init script,
and has the editor in the main frame — so `shared/webdriver-page.js` needs no frame
handling. See the note in that file before porting the others.

Nothing here is Safari-17-specific: point it at any safaridriver.

### Standing up a Safari 17 VM

Safari can't be downgraded independently of the OS, so Safari 17.0 means a macOS
Sonoma 14.0 guest. Apple's Virtualization.framework runs it on any Apple Silicon host
at macOS 14+; [`tart`](https://tart.run) is the convenient wrapper.

```sh
brew install cirruslabs/cli/tart
```

**Build from a pinned IPSW, not from `ghcr.io/cirruslabs/macos-sonoma-*`** — those
images are rebuilt monthly and carry whatever Safari is current. Fetch macOS 14.0
(build `23A344`) from [ipsw.me](https://ipsw.me), then:

```sh
tart create --from-ipsw=/path/UniversalMac_14.0_23A344_Restore.ipsw safari17-golden --disk-size 40
tart run safari17-golden       # complete Setup Assistant once, by hand
```

In Setup Assistant create user `admin` / password `admin` (the tart convention), then
enable **auto-login** (System Settings → Users & Groups) and **Remote Login**
(System Settings → General → Sharing). Auto-login is not optional: `safaridriver`
needs an active GUI session, and Safari has no headless mode.

Then, inside the VM, freeze Safari before it updates itself out from under you:

```sh
sudo softwareupdate --schedule off
sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled -bool false
sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticDownload -bool false
sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticallyInstallMacOSUpdates -bool false
printf '0.0.0.0 gdmf.apple.com\n0.0.0.0 swscan.apple.com\n' | sudo tee -a /etc/hosts
```

Finally enable automation: Safari → Settings → Advanced → *Show features for web
developers*, then **Develop → Allow Remote Automation**, then `sudo safaridriver --enable`.

Treat `safari17-golden` as read-only from here on and clone per run — tart clones are
APFS copy-on-write, so they cost nothing until they diverge. (Apple's EULA allows at
most 2 macOS VMs per host, so golden + one clone is the budget.)

### Running it

`safaridriver -p N` has no `--host` flag — it only ever binds loopback inside the VM —
so tunnel it. One command starts the driver and forwards the port:

```sh
tart clone safari17-golden safari17-run && tart run safari17-run &
ssh -L 4444:127.0.0.1:4444 admin@$(tart ip safari17-run) 'safaridriver -p 4444'
```

In the other direction the VM has to reach the CPO server, so `BASE_URL` must be the
host's address on the VM's subnet — and the server has to have been **started** with it,
since `BASE_URL` is baked into the served page as `PYRET=.../cpo-main.jarr`:

With tart's default NAT that address is **192.168.64.1**. Read it off `ifconfig
bridge100` — *not* `ipconfig getifaddr bridge100`, which returns empty for a bridge
interface:

```sh
ifconfig bridge100 | awk '/inet /{print $2}'      # -> 192.168.64.1
make stop-server                                  # if one is up on localhost
make cpo-safari BASE_URL=http://192.168.64.1:4999 SAFARI_EXPECT_VERSION=17 \
  PYRET_STATIC_HOST=192.168.64.1 SUITES=check-blocks
```

`SAFARI_WEBDRIVER_URL` (default `http://127.0.0.1:4444`) points at the driver.
`make cpo` is unaffected and still runs Chromium.

**`PYRET_STATIC_HOST` is required for the VM**, and is easy to forget because it
fails so indirectly. `run.js` starts its own fixture server for the url-file specs
and, by default, binds it to `127.0.0.1` — which from inside the guest means *the
guest*. Safari fetches into the void, the import never resolves, and the specs die
on `timed out waiting for: window.PA.doneRendering()` rather than on anything that
mentions the network. Setting it widens the bind to `0.0.0.0` and advertises the
given address. Only the remote-browser path needs it; Chromium and Safari-on-a-CI-
runner are same-machine and keep the loopback default.

### Which Safari actually answered?

Every Safari run prints the browser it got, e.g.
`browser: Safari 17.0 (macOS) via http://127.0.0.1:4444`. **Read that line.**

There is a silent failure mode worth knowing about: if a `safaridriver` is already
running *on the host* on the tunnel's local port, `ssh -L` cannot bind, and every
request quietly goes to the host's current Safari instead of the VM's. `GET /status`
answers `ready:true` either way, so the run goes green against completely the wrong
browser. Session capabilities are the only thing that distinguishes them.

`SAFARI_EXPECT_VERSION=17` turns that into a hard failure. Set it whenever the point
of the run is an old Safari. To check by hand:

```sh
lsof -nP -iTCP:4444 -sTCP:LISTEN     # should be ssh, not safaridriver
```

Because the VM has a real display, this is also the good way to *debug* a Safari-only
failure: let the suite stall on a failing spec and open Web Inspector on the automated
tab.

### Status

As of 2026-07-27 (at `ff450bc45`), all six suites pass in Safari 17.0 under
`--env=cpo`: **243/243**, per-test outcomes identical to Chromium. Safari is ~2×
slower (178s vs 85s) because every `eval` is an HTTP round trip through the tunnel
rather than a CDP call.

Modern Safari also runs in CI — see the `safari` job in
`.github/workflows/browser-test.yml`. That is the only WebKit coverage the project
has (Playwright cannot drive Apple's Safari), but it is Safari 26.x and cannot
catch old-Safari compatibility bugs: the GitHub runner images track Safari forward
regardless of which macOS they pin. Old Safari needs the VM above.

## Results

See `RESULTS.md` and `results/`.
