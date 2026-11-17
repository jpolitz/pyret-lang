({
  requires: [
    { "import-type": "builtin", "name": "reactors" },
    { "import-type": "builtin", "name": "http-internal" }
  ],
  provides: {
    shorthands: {
      "EventSource": { tag: "name",
                       origin: { "import-type": "uri", uri: "builtin://reactors" },
                       name: "EventSource" },
      "EventSink": { tag: "name",
                     origin: { "import-type": "uri", uri: "builtin://reactors" },
                     name: "EventSink" }
    },
    values: {
      "request": ["tyapp", "EventSource", ["Any"]],
      "started": ["tyapp", "EventSource", ["String"]],
      "respond": ["tyapp", "EventSink", ["Any"]],
      "response": ["arrow", ["Any", "Number", "String", "String"], "Any"],
      "text": ["arrow", ["Any", "String"], "Any"],
      "html": ["arrow", ["Any", "String"], "Any"]
    },
    types: {}
  },
  nativeRequires: [],
  theModule: function(runtime, _, uri, reactors, httpInternal) {
    var R = runtime.getField(reactors, "internal");
    var gf = runtime.getField;
    var DEFAULT_PORT = 8000;

    var users = 0;
    var serverPromise = null;
    function acquire() {
      users += 1;
      if(serverPromise === null) {
        serverPromise = httpInternal.listen(DEFAULT_PORT);
        serverPromise.catch(function(e) { console.error("HTTP: could not start a server:", e); });
      }
      return serverPromise;
    }
    function release() {
      users -= 1;
      if(users > 0 || serverPromise === null) { return; }
      var p = serverPromise;
      serverPromise = null;
      p.then(function(info) { return httpInternal.close(info.server); }, function() {});
    }

    function stringRecord(o) {
      var fields = {};
      Object.keys(o).forEach(function(k) { fields[k] = runtime.makeString(String(o[k])); });
      return runtime.makeObject(fields);
    }
    function toPyretRequest(r) {
      return runtime.makeObject({
        id: runtime.makeString(r.id),
        "http-method": runtime.makeString(r.method),
        path: runtime.makeString(r.path),
        query: runtime.makeString(r.query),
        headers: stringRecord(r.headers),
        body: runtime.makeString(r.body)
      });
    }

    var request = R.makeEventSource("request", function(emit) {
      var stopped = false;
      acquire().then(function loop(info) {
        if(stopped) { return; }
        return httpInternal.nextRequest(info.server).then(function(r) {
          if(stopped || r === null) { return; }
          emit(toPyretRequest(r));
          return loop(info);
        });
      }).catch(function(e) { console.error("HTTP: request stream failed:", e); });
      return function() { stopped = true; release(); };
    });

    var started = R.makeEventSource("started", function(emit) {
      var stopped = false;
      acquire().then(function(info) {
        if(!stopped) { emit(runtime.makeString(info.url)); }
      }, function() {});
      return function() { stopped = true; release(); };
    });

    var respond = R.makeEventSink("respond", function(context) {
      if(!(context.paired && context.source === request)) {
        throw new Error("HTTP.respond can only be used as on-to(HTTP.request, HTTP.respond)");
      }
      return {
        send: function(message) {
          var req = gf(message, "request");
          var status = runtime.jsnums.toFixnum(gf(message, "status"));
          var headers = { "content-type": gf(message, "content-type") };
          return httpInternal.respond(gf(req, "id"), status, headers, gf(message, "body"));
        }
      };
    });

    function makeResponse(req, status, contentType, body) {
      return runtime.makeObject({
        request: req,
        status: status,
        "content-type": runtime.makeString(contentType),
        body: body
      });
    }

    var F = runtime.makeFunction;
    var values = {
      request: request,
      started: started,
      respond: respond,
      response: F(function(req, status, contentType, body) {
        runtime.ffi.checkArity(4, arguments, "response", false);
        runtime.checkNumber(status);
        runtime.checkString(contentType);
        runtime.checkString(body);
        return makeResponse(req, status, contentType, body);
      }, "response"),
      text: F(function(req, body) {
        runtime.ffi.checkArity(2, arguments, "text", false);
        runtime.checkString(body);
        return makeResponse(req, runtime.makeNumber(200), "text/plain; charset=utf-8", body);
      }, "text"),
      html: F(function(req, body) {
        runtime.ffi.checkArity(2, arguments, "html", false);
        runtime.checkString(body);
        return makeResponse(req, runtime.makeNumber(200), "text/html; charset=utf-8", body);
      }, "html")
    };
    return runtime.makeModuleReturn(values, {});
  }
})
