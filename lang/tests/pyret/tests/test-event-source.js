({
  requires: [
    { "import-type": "builtin", "name": "reactors" }
  ],
  provides: {
    shorthands: {
      "EventSource": { tag: "name",
                       origin: { "import-type": "uri", uri: "builtin://reactors" },
                       name: "EventSource" },
      "EventSink": { tag: "name",
                     origin: { "import-type": "uri", uri: "builtin://reactors" },
                     name: "EventSink" },
      "Option": { tag: "name",
                  origin: { "import-type": "uri", uri: "builtin://option" },
                  name: "Option" }
    },
    values: {
      "counter": ["tyapp", "EventSource", ["Number"]],
      "words": ["tyapp", "EventSource", ["String"]],
      "lamp": ["tyapp", "EventSink", ["String"]],
      "beeper": ["tyapp", "EventSink", [["tyapp", "Option", ["Number"]]]],
      "sink-open-count": ["arrow", [], "Number"],
      "attach-log": ["arrow", ["Any"], "Any"],
      "fake-run": ["arrow", ["Any", "Number"], "Any"],
      "subscriber-count": ["arrow", [], "Number"],
      "last-emit": ["arrow", [], "Any"],
      "fire-counter": ["arrow", ["Number"], "Nothing"]
    },
    types: {}
  },
  nativeRequires: [],
  theModule: function(runtime, _, uri, reactors) {
    var internal = runtime.getField(reactors, "internal");
    var subscribers = [];
    var lastEmit = runtime.nothing;
    var attachLog = [];
    var counter = internal.makeEventSource("counter", function(emit, context) {
      attachLog.push("counter " + (context.paired ? "paired with " + internal.getSinkInfo(context.sink).name : "single"));
      subscribers.push(emit);
      return function() {
        subscribers = subscribers.filter(function(e) { return e !== emit; });
      };
    });
    var words = internal.makeEventSource("words", function(emit) {
      return function() {};
    });
    var openSinks = 0;
    function recordingSink(name) {
      return internal.makeEventSink(name, function(context) {
        attachLog.push(name + " " + (context.paired ? "paired with " + internal.getSourceInfo(context.source).name : "single"));
        openSinks += 1;
        return {
          send: function(message) {},
          close: function() { openSinks -= 1; }
        };
      });
    }
    return runtime.makeModuleReturn({
      "lamp": recordingSink("lamp"),
      "beeper": recordingSink("beeper"),
      "attach-log": runtime.makeFunction(function(reactor) {
        attachLog = [];
        internal.setInteract(function(init, handlers, tracer) {
          (handlers["on-event"] || []).forEach(function(b) {
            var unsubscribe = b.subscribe(function() {});
            if(b.kind === "on-to") {
              var session = b.openSink();
              if(session.close) { session.close(); }
            }
            unsubscribe();
          });
          (handlers["to-sink"] || []).forEach(function(b) {
            var session = b.openSink();
            if(session.close) { session.close(); }
          });
          return init;
        });
        try {
          runtime.getField(reactor, "interact").app();
        } finally {
          internal.setInteract(null);
        }
        return runtime.ffi.makeList(attachLog.map(runtime.makeString));
      }, "attach-log"),
      "fake-run": runtime.makeFunction(function(reactor, n) {
        internal.setInteract(function(init, handlers, tracer, messageTracer) {
          var world = init;
          var toSinks = handlers["to-sink"] || [];
          function changed() {
            tracer(world, world, function() {});
            toSinks.forEach(function(b) { messageTracer(b, b.handler.app(world)); });
          }
          changed();
          (handlers["on-event"] || []).forEach(function(b) {
            var result = b.handler.app(world, n);
            if(b.kind === "on-to") {
              var parts = b.splitReply(result);
              messageTracer(b, parts.message);
              result = parts.state;
            }
            world = result;
            changed();
          });
          return world;
        });
        try {
          return runtime.getField(reactor, "interact").app();
        } finally {
          internal.setInteract(null);
        }
      }, "fake-run"),
      "sink-open-count": runtime.makeFunction(function() {
        return runtime.makeNumber(openSinks);
      }, "sink-open-count"),
      "counter": counter,
      "words": words,
      "subscriber-count": runtime.makeFunction(function() {
        return runtime.makeNumber(subscribers.length);
      }, "subscriber-count"),
      "last-emit": runtime.makeFunction(function() {
        return lastEmit;
      }, "last-emit"),
      "fire-counter": runtime.makeFunction(function(n) {
        subscribers.forEach(function(emit) { emit(n); });
        return runtime.nothing;
      }, "fire-counter")
    }, {});
  }
})
