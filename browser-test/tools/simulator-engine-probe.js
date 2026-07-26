#!/usr/bin/env node
/*
 * simulator-engine-probe.js -- what JS engine does this simulator ACTUALLY run?
 *
 *   node tools/simulator-engine-probe.js [--udid=<udid>] [--expect-old]
 *
 * The --env=ios-safari tier exists to run the suite against the engine an old
 * iPad has. It reported a clean 236/236 on a branch whose built cpo-main.jarr
 * contained an iterator-helpers call that Safari did not ship until 18.4 -- so
 * the engine behind the "iOS 17.0.1" label was not a 17.x engine. The iOS
 * Simulator runs against the HOST's frameworks, and CI hosts carry a current
 * Safari.
 *
 * This answers that question directly, with no Appium, no WebDriverAgent and no
 * WebDriver session -- all of which are slow, flaky, and irrelevant to it. It
 * serves one page, opens it in the simulator's Safari with `simctl openurl`,
 * and waits for the page to POST its results back. Runs in seconds, and it
 * still works when the driver stack is broken, which is exactly when you most
 * want to know whether the tier is worth debugging.
 *
 * With --expect-old it exits nonzero if the engine has iterator helpers, i.e.
 * if the simulator is not giving us the old engine it advertises.
 */
const http = require("http");
const { execFileSync } = require("child_process");
const { PROBES } = require("../shared/engine-probes");

function arg(name) {
  for (const a of process.argv.slice(2)) {
    if (a === "--" + name) return "true";
    if (a.startsWith("--" + name + "=")) return a.slice(name.length + 3);
  }
  return undefined;
}

const UDID = arg("udid") || process.env.SIM_UDID || "booted";
const EXPECT_OLD = !!arg("expect-old");
const TIMEOUT_MS = parseInt(arg("timeout") || "60000", 10);

// The probe expressions are shared with the in-session fidelity check so the two
// can't disagree about what "old engine" means.
const PAGE = `<!doctype html><meta charset="utf-8"><title>engine probe</title>
<body><pre id="out">running…</pre><script>
var probes = ${JSON.stringify(PROBES.map((p) => ({ key: p.key, expr: p.expr })))};
var results = {};
probes.forEach(function (p) {
  try { results[p.key] = !!eval(p.expr); }
  catch (e) { results[p.key] = "error: " + (e && e.message); }
});
results._userAgent = navigator.userAgent;
document.getElementById("out").textContent = JSON.stringify(results, null, 2);
var xhr = new XMLHttpRequest();
xhr.open("POST", "/results", true);
xhr.setRequestHeader("Content-Type", "application/json");
xhr.send(JSON.stringify(results));
</script></body>`;

function main() {
  let resolveResults;
  const got = new Promise((r) => { resolveResults = r; });

  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/results") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        res.writeHead(204).end();
        try { resolveResults(JSON.parse(body)); }
        catch (e) { resolveResults({ _parseError: String(e), _raw: body }); }
      });
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE);
  });

  server.listen(0, "127.0.0.1", async () => {
    const url = "http://127.0.0.1:" + server.address().port + "/";
    console.log("probe page: " + url + "  (simulator " + UDID + ")");
    try {
      execFileSync("xcrun", ["simctl", "openurl", UDID, url], { stdio: "inherit" });
    } catch (e) {
      console.error("could not open the probe URL in the simulator: " + e.message);
      process.exit(2);
    }

    const timer = setTimeout(() => {
      console.error(
        "no results after " + TIMEOUT_MS + "ms -- Safari never loaded the page, " +
        "or the simulator cannot reach the host's loopback."
      );
      process.exit(2);
    }, TIMEOUT_MS);

    const results = await got;
    clearTimeout(timer);
    server.close();

    console.log("\n=== engine probes (iOS Simulator, no WebDriver involved) ===");
    console.log("userAgent: " + results._userAgent);
    for (const p of PROBES) {
      const label = results[p.key] === true ? "PRESENT" : results[p.key] === false ? "absent " : results[p.key];
      console.log("  " + label + "  " + p.key + "  (shipped in " + p.shippedIn + ")");
    }

    if (EXPECT_OLD && results["iterator-helpers"] === true) {
      console.error(
        "\nFAIL: this simulator has iterator helpers, which Safari did not ship " +
        "until 18.4. The runtime is labelled old but the engine is not -- the " +
        "iOS Simulator runs against the host's frameworks. Any pass from " +
        "--env=ios-safari on this host is meaningless."
      );
      process.exit(1);
    }
    console.log("\nOK: engine looks consistent with the runtime it advertises.");
    process.exit(0);
  });
}

main();
