// Agent-written template (Claude): the smallest raw JS module that provides an
// event source a Pyret reactor can subscribe to. Load it with
//   import js-file("/clock") as Clock
// and use it as
//   reactor: init: 0, on-event: [list: R.on(Clock.seconds, lam(w, s): s end)] end
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
      "seconds": ["tyapp", "EventSource", ["Number"]]
    },
    types: {}
  },
  nativeRequires: [],
  theModule: function(runtime, _, uri, reactors) {
    var Reactors = runtime.getField(reactors, "internal");

    // subscribe(emit) runs when a reactor that listens to this source starts
    // interacting; it returns the function that stops the stream. emit takes a
    // Pyret value (numbers, strings and booleans are plain JS values; build
    // lists with runtime.ffi.makeList and objects with runtime.makeObject) and
    // may be called from any JS context: a timer, a WebSocket message, a
    // serial-port read, a DOM listener.
    var seconds = Reactors.makeEventSource("wall-clock seconds", function(emit) {
      var id = setInterval(function() {
        emit(runtime.makeNumber(new Date().getSeconds()));
      }, 1000);
      return function() { clearInterval(id); };
    });

    return runtime.makeModuleReturn({ "seconds": seconds }, {});
  }
})
