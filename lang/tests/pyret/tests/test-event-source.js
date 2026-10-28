({
  requires: [
    { "import-type": "builtin", "name": "reactors" }
  ],
  provides: {
    shorthands: {
      "EventSource": { tag: "name",
                       origin: { "import-type": "uri", uri: "builtin://reactors" },
                       name: "EventSource" }
    },
    values: {
      "counter": ["tyapp", "EventSource", ["Number"]],
      "words": ["tyapp", "EventSource", ["String"]],
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
    var counter = internal.makeEventSource("counter", function(emit) {
      subscribers.push(emit);
      return function() {
        subscribers = subscribers.filter(function(e) { return e !== emit; });
      };
    });
    var words = internal.makeEventSource("words", function(emit) {
      return function() {};
    });
    return runtime.makeModuleReturn({
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
