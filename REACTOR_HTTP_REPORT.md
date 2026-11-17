# Reactors that serve HTTP: `import http`, the CLI, and the VS Code extension

Agent-written report (Claude Opus 5.5, 2026-11-15). Not written by Joe Politz.
Uncommitted work on `reactor-custom-events` (on top of `0de67cf37`), plus a demo repo at
`~/reactor-http-demo`.

## What a program writes

```
import http as HTTP

r = reactor:
  init: {url: "", hits: 0},
  on(HTTP.started): lam(s, url): s.{url: url} end,
  on-to(HTTP.request, HTTP.respond): lam(s, req):
      {s.{hits: s.hits + 1}; HTTP.text(req, "hello from " + req.path)}
    end,
  to-draw: draw
end
r.interact()
```

The same file runs in two places:

- **CLI** (`node prog.jarr`): a real node `http` server on port 8000. `to-draw` is ignored.
  It stops on `stop-when`, an error, or Ctrl-C, and `interact()` returns the state at that point.
- **VS Code extension, in a codespace or desktop VS Code**: the program runs in the webview,
  and the server runs in the extension host (node), on the codespace machine. Requests reach the reactor
  over the existing webview RPC bridge. `HTTP.started` gives the forwarded URL
  (`vscode.env.asExternalUri`, i.e. `https://<codespace>-8000.app.github.dev/`).

| Name | Type | Meaning |
|---|---|---|
| `HTTP.request` | `EventSource<Any>` | one event per HTTP request: `{id, http-method, path, query, headers, body}` (all strings; `headers` is a record keyed by lowercase header name) |
| `HTTP.respond` | `EventSink<Any>` | accepts a response record; only valid as `on-to(HTTP.request, HTTP.respond)`, otherwise the interaction fails to start |
| `HTTP.started` | `EventSource<String>` | emits the server's URL once it is listening |
| `HTTP.response(req, status, content-type, body)` | `-> Any` | a response record `{request, status, content-type, body}` |
| `HTTP.text(req, body)`, `HTTP.html(req, body)` | `-> Any` | 200 with `text/plain` / `text/html` |

## Layering (same shape as `filesystem` / `filesystem-internal`)

```
 Pyret program
     │  import http
     ▼
 lang/src/js/trove/http.js            sources/sinks, request records, response helpers
     │  requires builtin http-internal: listen(port) / nextRequest(server) / respond(id, ...) / close(server)
     ├───────────────────────────────┐
     ▼ CLI / node                    ▼ code.pyret.org bundle (override)
 lang/src/js/trove/                code.pyret.org/src/web/js/trove/http-internal.js
   http-internal.js                  window.MESSAGES.sendRpc('http', method, args)
   node http.createServer                │  postMessage (protocol "pyret-rpc")
                                         ▼
                                   vscode/src/httpBridge.ts  (node extension host only)
                                     node http.createServer + asExternalUri
```

The RPC bridge only carries webview-initiated request/response pairs, so requests are delivered
by long polling. `nextRequest(server)` resolves when a request arrives, or with `null` once the
server is closed, and `http.js` calls it again after each emit. No change to `events.js` or the
RPC protocol was needed.

Server lifecycle: `request` and `started` share one server per module instance, with a reference
count. Subscribing starts it, and the last unsubscribe closes it (interaction stop, error, Ctrl-C, or
the webview being disposed). If port 8000 is taken the backends try 8001..8019. An unanswered
request gets a 504 after 30 s, and requests still open when the server closes get a 503. Bodies
over 1 MB get a 413.

## Headless `interact` (new, needed for the CLI)

Before this, node had no `interact` at all ("No interaction set up"). `reactors.js` now has
`internal.headlessInteract`, and `post-load-hooks` installs it when the runner passes
`headlessInteract: true`. Only `handalone.js` does that, which covers CLI standalones and
`make pyret-test`. `load-lib` (what code.pyret.org runs programs through) does not, and
code.pyret.org still uses `world.js`.

Semantics, matching world.js where both apply:

- runs `on(...)`, `on-to(...)`, `to(...)`, `on-tick` (+ `seconds-per-tick`), `stop-when`;
  ignores `to-draw`, `on-key`, `on-mouse`, `title`, `close-when-stop`;
- initial `to` projections, then `stop-when` on the initial state, then subscriptions;
- one queue across all sources, so the total order is arrival order (world.js has per-source FIFO queues);
- `on-to`: reply sent, then state committed, then `to` projections (same order as the browser);
- calls `tracer` / `messageTracer` so `start-trace().interact()` and the message trace work;
- at most one pending tick in the queue, so a slow handler can't build a tick backlog;
- `SIGINT` ends the interaction normally with the current state.

This is the minimal version of `REACTOR_EVENTS_FUTURE_WORK.md` section 2. It uses the real clock,
not an injectable one.

## Decisions for you to review

1. **Five existing test assertions removed.** `r.interact() raises "No interaction set up"` in
   `test-reactor.arr` (2, which predate this branch), `test-reactor-events.arr` (1) and
   `test-reactor-sinks.arr` (2). They asserted that node has no interact, which is no longer true,
   and some would now hang (an `on-tick` reactor with no `stop-when`). The new
   `test-reactor-headless.arr` covers node `interact` instead. The alternative is to make headless
   opt-in (a flag, or only when `http` is imported), which would keep the tests as they were.
2. **`headlessInteract: true` in handalone**, i.e. on by default for every CLI program.
3. **`http-method`, not `method`**: `method` is a Pyret keyword, so `req.method` does not parse.
4. **Duplicated server code.** `lang/src/js/trove/http-internal.js` and
   `vscode/src/httpBridge.ts` implement the same four calls with the same limits and messages. The
   extension can't load a trove module file directly. A shared CommonJS file would remove the copy.
5. **Untyped payloads** (`EventSource<Any>`, `EventSink<Any>`): no record types for request/response yet.
6. **Fixed port 8000** (with fallback). No `HTTP.server(port)` yet; per the identity rule it would
   need to return the same values for the same port.
7. **The extension now has a `main` (node) entry** next to `browser`. In a codespace, VS Code then
   runs it in the remote node extension host. In github.dev the web build is used as before, and
   `http-internal` RPCs get "Unknown module http".
8. **Async failures are only logged.** If `listen` fails (all 20 ports busy) or the RPC module is
   missing, `http.js` writes to `console.error` and the reactor keeps running without a server. A source
   can only fail the interaction synchronously from `subscribe`, so this needs a reactors API to
   report a late failure (or `on(HTTP.error)`).
9. `respond` returns the RPC/`respond` promise, so the world waits for each response to be written.

Prose I put in the system (error strings): "The Pyret reactor did not respond in time.", "The Pyret
reactor serving this request stopped.", "HTTP.respond can only be used as on-to(HTTP.request,
HTTP.respond)", "http-internal: METHOD needs an embedding context that provides an http RPC module,
such as the Pyret VS Code extension", the `HTTP: ...` console messages, and the reused world.js
"The event source/sink ... failed to start/send" strings in the headless interact.

## Files

- `lang/src/js/trove/http.js`, `lang/src/js/trove/http-internal.js` (new)
- `lang/src/js/trove/reactors.js`: `headlessInteract`, exported under `internal`; `setInteract` returns the previous handler
- `lang/tests/pyret/tests/test-event-source.js`: the fake interacts restore the previous handler instead of `null`
- `lang/src/js/base/post-load-hooks.js`, `lang/src/js/base/handalone.js`: install it for standalones
- `lang/tests/pyret/tests/test-reactor-headless.arr` (new, in `main2.arr`); the removals in item 1
- `code.pyret.org/src/web/js/trove/http-internal.js` (new, RPC override);
  `cpo-builtins.js`: `http` added so it is in the editor bundle
- `vscode/src/httpBridge.ts`, `vscode/src/nodeExtension.ts` (new); `pyretCPOWebEditor.ts`:
  `addPaneModules` so the node entry can add RPC modules per pane; `webpack.config.js`: second
  (node) bundle; `package.json`: `main` and `dist/node` in `files`

Uncommitted changes that were already here before this session and are not mine: the edits to
`REACTOR_EVENTS_REPORT.md`, `REACTOR_SINKS_REPORT.md`, `reactor-events-report/*`, the
untracked `REACTOR_EVENTS_CHECKLIST.md` / `REACTOR_EVENTS_FUTURE_WORK.md`, and the one-line
`get-message-trace-as-table` return type in `reactors.js`.

## Demo repo: `~/reactor-http-demo`

`server.arr` is a voting page: `/` lists five colours, `/vote/<colour>` counts a vote, and
anything else gets a 404. `to-draw` shows the URL, the request count, a bar per colour and the
last eight requests. `.devcontainer/devcontainer.json` forwards port 8000, and
`pyret-parley-http.vsix` is the extension built from this tree. Not committed yet (the repo is
`git init`ed only).

To use it in a codespace: push the repo, open a codespace, right-click the `.vsix` and choose
"Install Extension VSIX", reload, then open `server.arr` and press Run. Set port 8000 to
Public in the Ports panel if you want to `curl` it without being logged in.

## Verification

| Check | Result |
|---|---|
| CLI, small program: `started`, 3 requests via `on-to`, `to(R.spy-on)`, `stop-when` | responses `hit 1/2/3`, every transition spied, `interact()` returned `{hits: 3, url: "http://localhost:8000/"}`, process exited |
| CLI, Ctrl-C on a reactor with no `stop-when` | `interact()` returned the state (2), the port was closed, exit 0 |
| CLI, `on-to(R.every(1), HTTP.respond)` | "The event sink "respond" failed to start: HTTP.respond can only be used as on-to(HTTP.request, HTTP.respond)" |
| CLI, demo `server.arr` | `/` HTML with counts after two `/vote/red`, `/nope` 404, clean Ctrl-C |
| Reactor test files only (`test-reactor*.arr`) | 150 passed, including 5 new headless tests |
| `make pyret-test`, clean `tests/compiled` | 12444 passed, 6 not: the 5 new headless tests, because `ES.fake-run`/`ES.attach-log` reset the interact handler to `null` after use. Fixed by having `setInteract` return the previous handler and the two helpers restore it |
| `make pyret-test` again, after the fix (reused cache) | 12455 passed, 2 failed: `test-import-variable.arr` got 43/44, the stale-cache ordering failure `REACTOR_SINKS_REPORT.md` describes; it didn't occur in the clean run |
| `tsc --noEmit` on the extension; webpack web + node bundles | clean; both built |
| CPO bundle rebuilt with `http` | contains the RPC override (`cpo-main.jarr.gz.js` rebuilt by hand with the Makefile's commands, without `make`, to avoid rebuilding phaseA during the test run) |
| **Extension path (webview → RPC → node server)** | **not run.** The plan was openvscode-server on this VM (browser client + remote node extension host, like a codespace), driven by Playwright. Starting it was refused by the session's permission check |
