// Agent-written template (Claude Fable 5.2): the smallest raw JS module that
// provides an event sink a Pyret reactor can send to. Load it with
//   import js-file("/lamp") as Lamp
// and use it as
//   reactor: init: 0, to(Lamp.lamp): lam(w): if w > 3: some("on") else: none end end end
({
  requires: [
    { "import-type": "builtin", "name": "reactors" }
  ],
  provides: {
    shorthands: {
      "EventSink": { tag: "name",
                     origin: { "import-type": "uri", uri: "builtin://reactors" },
                     name: "EventSink" },
      "Option": { tag: "name",
                  origin: { "import-type": "uri", uri: "builtin://option" },
                  name: "Option" }
    },
    values: {
      "lamp": ["tyapp", "EventSink", [["tyapp", "Option", ["String"]]]]
    },
    types: {}
  },
  nativeRequires: [],
  theModule: function(runtime, _, uri, reactors) {
    var Reactors = runtime.getField(reactors, "internal");

    // open(context) runs when a reactor that sends to this sink starts
    // interacting, once per binding. context is { paired: false } under
    // to(sink) and { paired: true, source: <source> } under
    // on-to(source, sink). It returns the send function for this binding and,
    // optionally, a close function called when the reactor stops.
    //
    // send receives the Pyret value the handler produced. This sink declares
    // Option<String>, so the message is some(string) or none. Reactors sends
    // on every transition and does not dedupe; this sink only acts when the
    // message changes. send may return a Promise, and may throw to end the
    // interaction with an error.
    var lamp = Reactors.makeEventSink("lamp", function(context) {
      var last = null;
      return {
        send: function(message) {
          var text = runtime.ffi.isSome(message) ? runtime.getField(message, "value") : null;
          if (text !== last) {
            last = text;
            if (text !== null) { console.log("lamp: " + text); }
          }
        },
        close: function() { console.log("lamp: closed"); }
      };
    });

    return runtime.makeModuleReturn({ "lamp": lamp }, {});
  }
})
