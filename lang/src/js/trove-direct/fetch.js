({
  requires: [ ],
  provides: {
    shorthands: {
        "Either": { tag: "name",
            origin: { "import-type": "uri", uri: "builtin://either" },
            name: "Either" },
    },
    values: {
        "fetch": ["arrow", ["String"], ["tyapp", "Either", ["String", "String"]]]
    },
    types: {}
  },
  nativeRequires: [],
  /**
   * DIRECT-MODE OVERRIDE of fetch: synchronous fetching, since direct mode
   * cannot capture the stack to wait for a promise.
   *
   * - On node: spawn a child node process that performs the (async) fetch
   *   and prints the result; the parent blocks on spawnSync.
   * - In a browser/worker: synchronous XMLHttpRequest.
   *
   * Same success/error message texts as the stock fetch.js.
   */
  theModule: function(RUNTIME, NAMESPACE, uri) {
    const FETCH_TIMEOUT = 20000;

    function fetchViaSubprocess(url) {
      const cp = require("child_process");
      const script = `
        const url = process.argv[1];
        const timeout = Number(process.argv[2]);
        fetch(url, { signal: AbortSignal.timeout(timeout) }).then(async (result) => {
          if (result.ok) {
            const text = await result.text();
            process.stdout.write("K" + text);
          } else {
            process.stdout.write("S" + JSON.stringify({ status: result.status, statusText: result.statusText }));
          }
        }).catch((e) => {
          process.stdout.write("E" + String(e));
        });
      `;
      const res = cp.spawnSync(process.execPath, ["-e", script, url, String(FETCH_TIMEOUT)],
        { encoding: "utf8", timeout: FETCH_TIMEOUT + 5000, maxBuffer: 256 * 1024 * 1024 });
      if (res.error || res.status !== 0 || typeof res.stdout !== "string" || res.stdout.length === 0) {
        return { kind: "error", message: String((res.error && res.error.message) || res.stderr || "fetch subprocess failed") };
      }
      const tag = res.stdout[0];
      const rest = res.stdout.slice(1);
      if (tag === "K") { return { kind: "ok", text: rest }; }
      if (tag === "S") {
        const info = JSON.parse(rest);
        return { kind: "status", status: info.status, statusText: info.statusText };
      }
      return { kind: "error", message: rest };
    }

    function fetchViaSyncXHR(url) {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, false); // synchronous
        xhr.send(null);
        if (xhr.status >= 200 && xhr.status < 300) {
          return { kind: "ok", text: xhr.responseText };
        }
        return { kind: "status", status: xhr.status, statusText: xhr.statusText };
      } catch(e) {
        return { kind: "error", message: String(e) };
      }
    }

    const doFetch = (typeof XMLHttpRequest !== "undefined") ? fetchViaSyncXHR :
      (typeof require !== "undefined") ? fetchViaSubprocess :
      function(url) { return { kind: "error", message: "no synchronous fetch mechanism available" }; };

    return RUNTIME.makeModuleReturn({
        "fetch": RUNTIME.makeFunction(function(url) {
            RUNTIME.ffi.checkArity(1, arguments, "fetch", false);
            RUNTIME.checkString(url);
            const result = doFetch(url);
            if (result.kind === "ok") {
                return RUNTIME.ffi.makeLeft(result.text);
            }
            if (result.kind === "status") {
                const message = `Fetching ${url} failed with status ${result.status}: ${result.statusText}`;
                return RUNTIME.ffi.makeRight(message);
            }
            const message = result.message;
            const error = `Fetch of ${url} failed with an error. This may mean that the server you're fetching from does not support fetch requests from the browser, the URL has a formatting issue, or the request took longer than ${FETCH_TIMEOUT}ms. The system-level error was "${message}"`;
            return RUNTIME.ffi.makeRight(error);
        })
    }, {});
  }
})
