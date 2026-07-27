/*
 * webdriver.js -- a minimal W3C WebDriver client, for driving real Safari.
 *
 * Playwright cannot drive Apple's Safari (its "webkit" is a separate WebKit
 * build, not the shipped browser), and Safari's automation interface is
 * safaridriver: a plain W3C WebDriver HTTP service. The harness needs exactly
 * five endpoints to run the cpo env -- new session, set timeouts, navigate,
 * execute a script, delete session -- so this is hand-rolled over global fetch
 * rather than pulling in selenium-webdriver. (code.pyret.org already pins
 * selenium-webdriver@3 for its own mocha suite; a second, different major in
 * the tree would be a maintenance liability for ~90 lines of HTTP.)
 *
 * See shared/webdriver-page.js for the `page` adapter built on top of this, and
 * browser-test/README.md for how to stand up a Safari 17 VM to point it at.
 */
const DEFAULT_URL = "http://127.0.0.1:4444";

// safaridriver's own default script timeout is 30s, but cpo-assertions.js waits
// as long as 900s on slow programs. These are the ceilings for a single
// command, not for a spec, so they can be generous.
const TIMEOUTS = { script: 300000, pageLoad: 120000, implicit: 0 };

async function request(base, method, path, body) {
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(
      "WebDriver " + method + " " + path + " could not reach " + base + ": " + e.message +
        "\nIs safaridriver running and reachable? With a tart VM that means:" +
        "\n  ssh -L 4444:127.0.0.1:4444 admin@$(tart ip <vm>) 'safaridriver -p 4444'" +
        "\n(safaridriver has no --host flag, so it only ever binds loopback inside the VM.)"
    );
  }
  // Every W3C response is a JSON envelope: {"value": ...}. Errors keep that
  // shape but carry {error, message, stacktrace} and a 4xx/5xx status.
  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    throw new Error(
      "WebDriver " + method + " " + path + " returned non-JSON (status " + res.status + "): " +
        text.slice(0, 500)
    );
  }
  if (!res.ok) {
    const v = (payload && payload.value) || {};
    throw new Error(
      "WebDriver " + method + " " + path + " failed: " + (v.error || res.status) +
        (v.message ? " -- " + v.message : "")
    );
  }
  return payload.value;
}

/*
 * Open a Safari session. `url` is the WebDriver service endpoint, NOT a page to
 * visit. Returns the small surface shared/webdriver-page.js needs.
 */
async function newSafariSession(url) {
  const base = (url || process.env.SAFARI_WEBDRIVER_URL || DEFAULT_URL).replace(/\/+$/, "");

  // Preflight: a refused connection here is by far the most common failure, and
  // the message from /status is much clearer than one from POST /session.
  await request(base, "GET", "/status");

  // firstMatch: [{}] is sent alongside alwaysMatch because some drivers reject a
  // capabilities object with neither member populated.
  const value = await request(base, "POST", "/session", {
    capabilities: { alwaysMatch: { browserName: "safari" }, firstMatch: [{}] },
  });
  const sessionId = value.sessionId || (value.value && value.value.sessionId);
  if (!sessionId) {
    throw new Error("WebDriver POST /session returned no sessionId: " + JSON.stringify(value));
  }
  const at = "/session/" + sessionId;

  // ALWAYS report which browser actually answered. The whole point of this
  // backend is running an OLD Safari, and "am I talking to the browser I think
  // I am" has a nasty silent failure mode: safaridriver on the HOST listening
  // on the same port the VM tunnel wants. The tunnel then fails to bind, the
  // requests quietly go to the host's current Safari, and the suite passes
  // against the wrong browser. /status looks identical either way -- the
  // session capabilities are the only thing that distinguishes them.
  // SAFARI_EXPECT_VERSION turns that into a hard failure (e.g. "17" or "17.0").
  const caps = (value.capabilities || value) || {};
  const version = caps.browserVersion || "unknown";
  console.log(
    "browser: " + (caps.browserName || "Safari") + " " + version +
      " (" + (caps.platformName || "?") + ") via " + base
  );
  const want = process.env.SAFARI_EXPECT_VERSION;
  if (want && String(version) !== want && !String(version).startsWith(want + ".")) {
    await request(base, "DELETE", at).catch(() => {});
    throw new Error(
      "expected Safari " + want + " but the driver at " + base + " is Safari " + version +
        ".\nIs a safaridriver running on the HOST and holding that port, so the VM " +
        "tunnel never bound? Check: lsof -nP -iTCP:4444 -sTCP:LISTEN"
    );
  }

  await request(base, "POST", at + "/timeouts", TIMEOUTS);

  return {
    sessionId,
    async navigate(pageUrl) {
      await request(base, "POST", at + "/url", { url: pageUrl });
    },
    // Runs `script` as a function body -- so it must `return` to produce a
    // value, exactly like Playwright's evaluate(new Function(...)).
    async execute(script) {
      return request(base, "POST", at + "/execute/sync", { script, args: [] });
    },
    async close() {
      // Best effort: a session that already died shouldn't fail the run's teardown.
      try {
        await request(base, "DELETE", at);
      } catch (e) {
        console.error("warning: could not delete WebDriver session: " + e.message);
      }
    },
  };
}

module.exports = { newSafariSession };
