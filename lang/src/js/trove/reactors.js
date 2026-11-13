({
  requires: [
    { "import-type": "builtin", "name": "reactor-events" },
    { "import-type": "builtin", "name": "valueskeleton" },
    { "import-type": "builtin", "name": "table" }
  ],
  nativeRequires: [
  ],
  provides: {
    shorthands: {
      "RofA": ["tyapp", ["local", "Reactor"], [["tid", "a"]]],
      "ESofE": ["tyapp", ["local", "EventSource"], [["tid", "e"]]],
      "EHofA": ["tyapp", ["local", "EventHandler"], [["tid", "a"]]],
      "SinkofM": ["tyapp", ["local", "EventSink"], [["tid", "m"]]],
      "ReactorEvent": { tag: "name",
                 origin: { "import-type": "uri", uri: "builtin://reactor-events" },
                 name: "Event" },
      "RawKeyEventType": { tag: "name",
                 origin: { "import-type": "uri", uri: "builtin://reactor-events" },
                 name: "RawKeyEventType" },
      "Image": { tag: "name",
                 origin: { "import-type": "uri", uri: "builtin://image-lib" },
                 name: "Image" },
      "ValueSkeleton": { tag: "name",
                         origin: { "import-type": "uri", uri: "builtin://valueskeleton" },
                         name: "ValueSkeleton" },
      "Table": { tag: "name",
                 origin: { "import-type": "uri", uri: "builtin://global" },
                 name: "Table" }
    },
    values: {
      "keypress": ["arrow", ["String"], "ReactorEvent"],
      "mouse": ["arrow", ["Number", "Number", "String"], "ReactorEvent"],
      "time-tick": "ReactorEvent",
      "raw-key": "ReactorEvent",
      "key-up": ["local", "RawKeyEventType"],
      "key-down": ["local", "RawKeyEventType"],
      "key-press": ["local", "RawKeyEventType"],
      "custom-event": ["forall", ["e"], ["arrow", ["ESofE", ["tid", "e"]], "ReactorEvent"]],
      "on": ["forall", ["a", "e"], ["arrow", ["ESofE", ["arrow", [["tid", "a"], ["tid", "e"]], ["tid", "a"]]], "EHofA"]],
      "every": ["arrow", ["Number"], ["tyapp", ["local", "EventSource"], ["Number"]]],
      "event-source-name": ["forall", ["e"], ["arrow", ["ESofE"], "String"]],
      "to": ["forall", ["a", "m"], ["arrow", ["SinkofM", ["arrow", [["tid", "a"]], ["tid", "m"]]], "EHofA"]],
      "on-to": ["forall", ["a", "e", "m"], ["arrow",
        ["ESofE", "SinkofM", ["arrow", [["tid", "a"], ["tid", "e"]], ["tuple", [["tid", "a"], ["tid", "m"]]]]],
        "EHofA"]],
      "event-sink-name": ["forall", ["m"], ["arrow", ["SinkofM"], "String"]],
      "spy-on": ["forall", ["m"], "SinkofM"],

      "get-value": ["forall", ["a"], ["arrow", ["RofA"], ["tid", "a"]]],
      "get-instance": ["forall", ["a"], ["arrow", ["RofA"], ["tid", "a"]]],
      "draw": ["forall", ["a"], ["arrow", ["RofA"], "Image"]],
      "interact": ["forall", ["a"], ["arrow", ["RofA"], "RofA"]],
      "interact-trace": ["forall", ["a"], ["arrow", ["RofA"], "Table"]],
      "simulate-trace": ["forall", ["a"], ["arrow", ["RofA", "Number"], "Table"]],
      "start-trace": ["forall", ["a"], ["arrow", ["RofA"], "RofA"]],
      "stop-trace": ["forall", ["a"], ["arrow", ["RofA"], "RofA"]],
      "get-trace": ["forall", ["a"], ["arrow", ["RofA"], ["List", ["tid", "a"]]]],
      "get-trace-as-table": ["forall", ["a"], ["arrow", ["RofA"], "Table"]],
      "get-message-trace-as-table": ["forall", ["a"], ["arrow", ["RofA"], "Table"]],
      "react": ["forall", ["a"], ["arrow", ["RofA", "ReactorEvent"], "RofA"]]
    },
    aliases: {
      "Event": "ReactorEvent",
      "RawKeyEventType": "RawKeyEventType",
      "Reactor": ["local", "Reactor"],
      "EventSource": ["local", "EventSource"],
      "EventSink": ["local", "EventSink"],
      "EventHandler": ["local", "EventHandler"]
    },
    datatypes: {
      "EventSource": ["data", "EventSource", ["e"], [], {}],
      "EventSink": ["data", "EventSink", ["m"], [], {}],
      "EventHandler": ["data", "EventHandler", ["a"], [], {}],
      "Reactor": ["data", "Reactor", ["a"], [], {
        "get-value": ["arrow", [], ["tid", "a"]],
        "draw": ["arrow", [], "Image"],
        "interact": ["arrow", [], "RofA"],
        "interact-trace": ["forall", ["a"], ["arrow", [], "Any"]],
        "simulate-trace": ["forall", ["a"], ["arrow", ["Number"], "Any"]],
        "start-trace": ["arrow", [], "RofA"],
        "stop-trace": ["arrow", [], "RofA"],
        "get-trace": ["arrow", [], ["List", ["tid", "a"]]],
        "get-trace-as-table": ["arrow", [], "Any"],
        "react": ["arrow", ["ReactorEvent"], "RofA"],
        "get-message-trace-as-table": ["arrow", [], "Any"],
        "is-stopped": ["arrow", [], "Boolean"],
        "_output": ["arrow", [], "ValueSkeleton"]
      }]
    },
  },

  theModule: function(runtime, _, uri, reactorEvents, VSlib, tables) {
    var jsnums = runtime.jsnums;
    var gf = runtime.getField;
    var gmf = function(m, f) { return gf(runtime.getField(m, "values"), f); }
    var gtf = function(m, f) { return gf(m, "types")[f]; }
    var VS = runtime.getField(VSlib, "values");

    var brandReactor = runtime.namedBrander("reactors", ["reactors"]);
    var annReactor = runtime.makeBranderAnn(brandReactor, "Reactor");
    var brandEventSource = runtime.namedBrander("event-source", ["reactors"]);
    var annEventSource = runtime.makeBranderAnn(brandEventSource, "EventSource");
    var brandEventSink = runtime.namedBrander("event-sink", ["reactors"]);
    var annEventSink = runtime.makeBranderAnn(brandEventSink, "EventSink");
    var brandEventHandler = runtime.namedBrander("event-handler", ["reactors"]);
    var annEventHandler = runtime.makeBranderAnn(brandEventHandler, "EventHandler");

    var checkArity = runtime.ffi.checkArity;

    const c = function(name, ...argsAndAnns) {
      runtime.checkArgsInternalInline("reactors", name, ...argsAndAnns);
    };
    const c1 = function(name, arg, ann) {
      runtime.checkArgsInternal1("reactors", name, arg, ann);
    };
    const c2 = function(name, arg1, ann1, arg2, ann2) {
      runtime.checkArgsInternal2("reactors", name, arg1, ann1, arg2, ann2);
    };
    const c3 = function(name, arg1, ann1, arg2, ann2, arg3, ann3) {
      runtime.checkArgsInternal3("reactors", name, arg1, ann1, arg2, ann2, arg3, ann3);
    };

    var ann = function(name, pred) {
      return runtime.makePrimitiveAnn(name, pred);
    };

    var annEvent = gtf(reactorEvents, "Event");
    var annNatural = runtime.makeFlatPredAnn(runtime.Number, runtime.makeFunction(function(val) {
        return jsnums.isInteger(val) && jsnums.greaterThanOrEqual(val, 0);
    }, "Natural Number"), "Natural Number");
    var annObject = runtime.Object;
    
    function applyBrand(brand, val) {
      return gf(brand, "brand").app(val);
    }
    function hasBrand(brand, val) {
      return gf(brand, "test").app(val);
    }

    var isEvent = gmf(reactorEvents, "is-Event");

    var sourceInfo = new WeakMap();

    function outputMethod(defaultConstr, name, shownAs) {
      var constr = shownAs ? shownAs.constr : defaultConstr;
      var args = shownAs ? shownAs.args : [name];
      return runtime.makeMethod0(function(self) {
        checkArity(1, arguments, "_output", true);
        return gf(VS, "vs-constr").app(constr,
          runtime.ffi.makeList(args.map(function(a) { return gf(VS, "vs-value").app(a); })));
      });
    }

    function makeEventSource(name, subscribe, shownAs) {
      if(typeof name !== "string") { throw new Error("makeEventSource: name must be a string"); }
      if(typeof subscribe !== "function") { throw new Error("makeEventSource: subscribe must be a function"); }
      var o = runtime.makeObject({
        name: name,
        _output: outputMethod("event-source", name, shownAs),
        _equals: runtime.makeMethod2(function(self, other, rec) {
          checkArity(3, arguments, "_equals", true);
          return runtime.ffi.notEqual.app("", self, other);
        })
      });
      var branded = applyBrand(brandEventSource, o);
      sourceInfo.set(branded, { name: name, subscribe: subscribe });
      return branded;
    }
    function isEventSource(v) {
      return runtime.isObject(v) && runtime.isPyretTrue(hasBrand(brandEventSource, v));
    }
    function getSourceInfo(source) {
      c1("event-source", source, annEventSource);
      return sourceInfo.get(source);
    }

    var sinkInfo = new WeakMap();

    function makeEventSink(name, open, shownAs) {
      if(typeof name !== "string") { throw new Error("makeEventSink: name must be a string"); }
      if(typeof open !== "function") { throw new Error("makeEventSink: open must be a function"); }
      var o = runtime.makeObject({
        name: name,
        _output: outputMethod("event-sink", name, shownAs),
        _equals: runtime.makeMethod2(function(self, other, rec) {
          checkArity(3, arguments, "_equals", true);
          return runtime.ffi.notEqual.app("", self, other);
        })
      });
      var branded = applyBrand(brandEventSink, o);
      sinkInfo.set(branded, { name: name, open: open });
      return branded;
    }
    function isEventSink(v) {
      return runtime.isObject(v) && runtime.isPyretTrue(hasBrand(brandEventSink, v));
    }
    function getSinkInfo(sink) {
      c1("event-sink", sink, annEventSink);
      return sinkInfo.get(sink);
    }
    function openSink(sink, context) {
      var info = getSinkInfo(sink);
      var session = info.open(context);
      if(typeof session === "function") { session = { send: session }; }
      if(!session || typeof session.send !== "function") {
        throw new Error("The event sink " + JSON.stringify(info.name) + " did not provide a send function");
      }
      return session;
    }

    var bindingInfo = new WeakMap();

    function makeBinding(constrName, kind, source, sink, handler) {
      var fields = { handler: handler };
      var shown = [];
      if(source !== undefined) { fields.source = source; shown.push(source); }
      if(sink !== undefined) { fields.sink = sink; shown.push(sink); }
      shown.push(handler);
      fields._output = runtime.makeMethod0(function(self) {
        checkArity(1, arguments, "_output", true);
        return gf(VS, "vs-constr").app(constrName,
          runtime.ffi.makeList(shown.map(function(v) { return gf(VS, "vs-value").app(v); })));
      });
      var branded = applyBrand(brandEventHandler, runtime.makeObject(fields));
      bindingInfo.set(branded, { kind: kind, source: source, sink: sink, handler: handler });
      return branded;
    }

    function on(source, handler) {
      checkArity(2, arguments, "on", false);
      c2("on", source, annEventSource, handler, runtime.Function);
      return makeBinding("on", "on", source, undefined, handler);
    }

    function to(sink, handler) {
      checkArity(2, arguments, "to", false);
      c2("to", sink, annEventSink, handler, runtime.Function);
      return makeBinding("to", "to", undefined, sink, handler);
    }

    function onTo(source, sink, handler) {
      checkArity(3, arguments, "on-to", false);
      c3("on-to", source, annEventSource, sink, annEventSink, handler, runtime.Function);
      return makeBinding("on-to", "on-to", source, sink, handler);
    }

    function splitReply(sourceName, sinkName, result) {
      if(!runtime.isTuple(result) || result.vals.length !== 2) {
        runtime.ffi.throwMessageException("The on-to handler for the event source " + JSON.stringify(sourceName)
          + " and the sink " + JSON.stringify(sinkName)
          + " must return a tuple {new-state; message}");
      }
      return { state: result.vals[0], message: result.vals[1] };
    }

    function every(seconds) {
      checkArity(1, arguments, "every", false);
      c1("every", seconds, runtime.NumPositive);
      var delay = jsnums.toFixnum(seconds) * 1000;
      return makeEventSource("every " + String(seconds) + "s", function(emit) {
        var count = 0;
        var id = setInterval(function() {
          count += 1;
          emit(runtime.makeNumber(count));
        }, delay);
        return function() { clearInterval(id); };
      }, { constr: "every", args: [seconds] });
    }

    function eventSourceName(source) {
      checkArity(1, arguments, "event-source-name", false);
      return getSourceInfo(source).name;
    }

    var spyOn = makeEventSink("spy-on", function() {
      return { send: function(message) {
        return new Promise(function(resolve, reject) {
          runtime.run(function() {
            return runtime.spy(["reactors"], "spy-on", [["reactors"]], ["sent"], [message]);
          }, runtime.namespace, { sync: false }, function(result) {
            if(runtime.isSuccessResult(result)) { resolve(); } else { reject(result.exn); }
          });
        });
      } };
    });

    function eventSinkName(sink) {
      checkArity(1, arguments, "event-sink-name", false);
      return getSinkInfo(sink).name;
    }

    function toBindings(arr) {
      if(!Array.isArray(arr)) { runtime.ffi.throwInternalError("Expected an array of event handlers", runtime.ffi.makeList([arr])); }
      return arr.map(function(h) {
        c1("on-event", h, annEventHandler);
        var b = bindingInfo.get(h);
        var binding = { kind: b.kind, handler: b.handler, value: h };
        var paired = b.kind === "on-to";
        if(b.source !== undefined) {
          var info = getSourceInfo(b.source);
          var sourceContext = paired ? { paired: true, sink: b.sink } : { paired: false };
          binding.source = b.source;
          binding.name = info.name;
          binding.subscribe = function(emit) { return info.subscribe(emit, sourceContext); };
        }
        if(b.sink !== undefined) {
          var sink = b.sink;
          var sinkContext = paired ? { paired: true, source: b.source } : { paired: false };
          binding.sink = sink;
          binding.sinkName = getSinkInfo(sink).name;
          binding.openSink = function() { return openSink(sink, sinkContext); };
        }
        if(b.kind === "on-to") {
          binding.splitReply = function(result) { return splitReply(binding.name, binding.sinkName, result); };
        }
        return binding;
      });
    }

    var externalInteractionHandler = null;
    var setInteract = function(newInteract) {
      externalInteractionHandler = newInteract;
    }
    var makeReactor = function(init, fields, eventHandlers) {
      c1("make-reactor", fields, annObject);
      var handlerDict = {};
      Object.keys(fields.dict).forEach(function(f) {
        if(runtime.ffi.isSome(gf(fields, f))) {
          handlerDict[f] = gf(gf(fields, f), "value");
        }
      });
      var bindings = (eventHandlers === undefined) ? [] : toBindings(eventHandlers);
      if(handlerDict.hasOwnProperty("on-event")) {
        runtime.checkList(handlerDict["on-event"]);
        bindings = bindings.concat(toBindings(runtime.ffi.toArray(handlerDict["on-event"])));
      }
      var onBindings = bindings.filter(function(b) { return b.kind !== "to"; });
      var toSinkBindings = bindings.filter(function(b) { return b.kind === "to"; });
      delete handlerDict["on-event"];
      if(onBindings.length > 0) { handlerDict["on-event"] = onBindings; }
      if(toSinkBindings.length > 0) { handlerDict["to-sink"] = toSinkBindings; }
      return makeReactorRaw(init, handlerDict, false, [], []);
    }
    var makeReactorRaw = function(init, handlers, tracing, trace, messages) {
      function project(state, tick, messagesSoFar, k) {
        var tos = handlers["to-sink"] || [];
        function go(i, acc) {
          if(i >= tos.length) { return k(acc); }
          return runtime.safeCall(function() {
            return tos[i].handler.app(state);
          }, function(message) {
            return go(i + 1, tracing ? acc.concat([{ tick: tick, handler: tos[i].value, message: message }]) : acc);
          }, "react:to:" + tos[i].sinkName);
        }
        return go(0, messagesSoFar);
      }
      var o = runtime.makeObject({
        "get-value": runtime.makeMethod0(function(self) {
          checkArity(1, arguments, "get-value", true);
          return init;
        }),
        "draw": runtime.makeMethod0(function(self) {
          checkArity(1, arguments, "draw", true);
          if(!handlers.hasOwnProperty("to-draw")) {
            runtime.ffi.throwMessageException("Cannot draw() because no to-draw was specified on this reactor.");
          }
          var drawer = handlers["to-draw"];
          return drawer.app(init);
        }),
        "interact-trace": runtime.makeMethod0(function(self) {
          checkArity(1, arguments, "interact-trace", true);
          return runtime.safeThen(function() {
            return gf(self, "start-trace").app();
          }).then(function(val) {
            return gf(val, "interact").app();
          }).then(function(val) {
            return gf(val, "get-trace-as-table").app(); 
          }).start();
        }),
        "simulate-trace": runtime.makeMethod1(function(self, limit) {
          checkArity(2, arguments, "simulate-trace", true);
          c1("simulate-trace", limit, annNatural);
          function help(r, i) {
            return r.then(function(rval) {
              if(i <= 0) {
                return gf(rval, "get-trace-as-table").app()
              }
              else {
                return runtime.safeThen(function() {
                  return gf(rval, "is-stopped").app();
                }).then(function(isStopped) {
                  if(isStopped) {
                    return gf(rval, "get-trace-as-table").app()
                  }
                  else {
                    return help(runtime.safeThen(function() {
                      return gf(rval, "react").app(gmf(reactorEvents, "time-tick"));
                    }), i - 1).start();
                  }
                }).start()
              }
            });
          }
          var withTracing = runtime.safeThen(function() {
            return gf(self, "start-trace").app();
          });
          return help(withTracing, limit).start();
        }),
        interact: runtime.makeMethod0(function(self) {
          checkArity(1, arguments, "interact", true);
          if(externalInteractionHandler === null) {
            runtime.ffi.throwMessageException("No interaction set up for this context (please report a bug if you are using code.pyret.org and see this message)");
          }
          var thisInteractTrace = [];
          var thisInteractMessages = [];
          var tracer = null;
          var messageTracer = null;
          if(tracing) {
            tracer = function(newVal, oldVal, k) {
              thisInteractTrace.push(newVal);
              k();
            };
            messageTracer = function(binding, message) {
              var current = trace.length + thisInteractTrace.length - 2;
              var tick = binding.kind === "on-to" ? current + 1 : current;
              thisInteractMessages.push({ tick: tick, handler: binding.value, message: message });
            };
          }
          return runtime.safeCall(function() {
            return externalInteractionHandler(init, handlers, tracer, messageTracer);
          }, function(newVal) {
            // This unshift prevents duplicate first elements
            thisInteractTrace.shift();
            return makeReactorRaw(newVal, handlers, tracing, trace.concat(thisInteractTrace), messages.concat(thisInteractMessages));
          }, "interact");
        }),
        "start-trace": runtime.makeMethod0(function(self) {
          checkArity(1, arguments, "start-trace", true);
          return makeReactorRaw(init, handlers, true, [init], []);
        }),
        "stop-trace": runtime.makeMethod0(function(self) {
          checkArity(1, arguments, "stop-trace", true);
          return makeReactorRaw(init, handlers, false, [], []);
        }),
        "get-trace": runtime.makeMethod0(function(self) {
          checkArity(1, arguments, "get-trace", true);
          if(tracing) {
            return runtime.ffi.makeList(trace);
          }
          else {
            runtime.ffi.throwMessageException("Tried to get trace of a reactor that isn't tracing; try calling start-trace() first");
          }
        }),
        "get-trace-as-table": runtime.makeMethod0(function(self) {
          checkArity(1, arguments, "get-trace-as-table", true);
          if(tracing) {
            var i = 0;
            var rows = trace.map(function(state) {
              var ans = [i, state];
              i += 1;
              return ans;
            });
            // console.log('tables =', tables);
            return gf(tables, "internal").makeTable(["tick", "state"], rows);
            // return runtime.makeTable(["tick", "state"], rows);
          }
          else {
            runtime.ffi.throwMessageException("Tried to get trace of a reactor that isn't tracing; try calling start-trace() first");
          }
        }),
        react: runtime.makeMethod1(function(self, event) {
          checkArity(2, arguments, "react", true);
          c1("react", event, annEvent);
          function callOrError(handlerName, args) {
            if(handlers.hasOwnProperty(handlerName)) {
              var funObj = handlers[handlerName].app;
              return runtime.safeCall(function() {
                return funObj.apply(funObj, args);
              }, function(newVal) {
                if(tracing) {
                  var newTrace = trace.concat([newVal]);
                }
                else {
                  var newTrace = trace;
                }
                return project(newVal, newTrace.length - 1, messages, function(newMessages) {
                  return makeReactorRaw(newVal, handlers, tracing, newTrace, newMessages);
                });
              }, "react:" + handlerName);
            }
            else {
              runtime.ffi.throwMessageException("No " + handlerName + " handler defined");
            }
          }
          return runtime.safeCall(function() {
              if(handlers["stop-when"]) {
                return handlers["stop-when"].app(init);
              }
              else {
                return false;
              }
            }, function(stop) {
              if(stop) {
                return self;
              }
              else {
                return runtime.ffi.cases(isEvent, "Event", event, {
                  keypress: function(key) {
                    return callOrError("on-key", [init, key]);
                  },
                  "time-tick": function() {
                    return callOrError("on-tick", [init]);
                  },
                  mouse: function(x, y, kind) {
                    return callOrError("on-mouse", [init, x, y, kind]);
                  },
                  "raw-key": function(key, type, caps, shift, alt, command, control) {
                    // NOTE(joe): we intentionally don't use all the fields above, assuming
                    // that users of on-raw-key are OK with consuming an event object
                    // rather than the fields of the event. This is mainly because typing
                    // out 8 parameters is pretty unreasonable, and this fancy version
                    // will mainly be used by folks who have gone through at least Reactive
                    return callOrError("on-raw-key", [init, event]);
                  },
                  "custom-event": function(source, value) {
                    var info = getSourceInfo(source);
                    var bindings = (handlers["on-event"] || []).filter(function(b) {
                      return b.source === source;
                    });
                    if(bindings.length === 0) {
                      runtime.ffi.throwMessageException("No on-event handler defined for the event source " + JSON.stringify(info.name));
                    }
                    function dispatch(i, current, currentTrace, currentMessages) {
                      if(i >= bindings.length) {
                        return makeReactorRaw(current, handlers, tracing, currentTrace, currentMessages);
                      }
                      var binding = bindings[i];
                      var funObj = binding.handler.app;
                      return runtime.safeCall(function() {
                        return funObj.apply(funObj, [current, value]);
                      }, function(result) {
                        var newVal = result;
                        var withReply = currentMessages;
                        if(binding.kind === "on-to") {
                          var reply = binding.splitReply(result);
                          newVal = reply.state;
                          if(tracing) {
                            withReply = currentMessages.concat([{ tick: currentTrace.length, handler: binding.value, message: reply.message }]);
                          }
                        }
                        var newTrace = tracing ? currentTrace.concat([newVal]) : currentTrace;
                        return project(newVal, newTrace.length - 1, withReply, function(newMessages) {
                          return dispatch(i + 1, newVal, newTrace, newMessages);
                        });
                      }, "react:on-event:" + info.name);
                    }
                    return dispatch(0, init, trace, messages);
                  }
                });
              }
            }, "react:stop-when");
        }),
        "get-message-trace-as-table": runtime.makeMethod0(function(self) {
          checkArity(1, arguments, "get-message-trace-as-table", true);
          if(tracing) {
            var rows = messages.map(function(m) { return [m.tick, m.handler, m.message]; });
            return gf(tables, "internal").makeTable(["tick", "handler", "message"], rows);
          }
          else {
            runtime.ffi.throwMessageException("Tried to get the message trace of a reactor that isn't tracing; try calling start-trace() first");
          }
        }),
        "is-stopped": runtime.makeMethod0(function(self) {
          checkArity(1, arguments, "is-stopped", true);
          if(handlers["stop-when"]) {
            return handlers["stop-when"].app(init);
          }
          else {
            return false;
          }
        }),
        _output: runtime.makeMethod0(function(self) {
          checkArity(1, arguments, "_output", true);
          return runtime.getField(VS, "vs-constr").app(
            "reactor",
            runtime.ffi.makeList([ gf(VS, "vs-value").app(init) ]));
        })
      });
      return applyBrand(brandReactor, o);
    }

    function getValue(reactor) {
      checkArity(1, arguments, "reactors", false);
      c1("get-value", reactor, annReactor);
      return runtime.getField(reactor, "get-value").app();
    }

    function draw(reactor) {
      checkArity(1, arguments, "reactors", false);
      c1("draw", reactor, annReactor);
      return runtime.getField(reactor, "draw").app();
    }

    function interact(reactor) {
      checkArity(1, arguments, "reactors", false);
      c1("interact", reactor, annReactor);
      return runtime.getField(reactor, "interact").app();
    }

    function react(reactor, event) {
      checkArity(2, arguments, "reactors", false);
      c2("react", reactor, annReactor, event, annEvent);
      return runtime.getField(reactor, "react").app(event);
    }

    function getMessageTraceAsTable(reactor) {
      checkArity(1, arguments, "reactors", false);
      c1("get-message-trace-as-table", reactor, annReactor);
      return runtime.getField(reactor, "get-message-trace-as-table").app();
    }

    function getTrace(reactor) {
      checkArity(1, arguments, "reactors", false);
      c1("get-trace", reactor, annReactor);
      return runtime.getField(reactor, "get-trace").app();
    }

    function getTraceAsTable(reactor) {
      checkArity(1, arguments, "reactors", false);
      c1("get-trace-as-table", reactor, annReactor);
      return runtime.getField(reactor, "get-trace-as-table").app();
    }

    function startTrace(reactor) {
      checkArity(1, arguments, "reactors", false);
      c1("start-trace", reactor, annReactor);
      return runtime.getField(reactor, "start-trace").app();
    }

    function interactTrace(reactor) {
      checkArity(1, arguments, "reactors", false);
      c1("interact-trace", reactor, annReactor);
      return runtime.getField(reactor, "interact-trace").app();
    }

    function simulateTrace(reactor, limit) {
      checkArity(2, arguments, "reactors", false);
      c2("simulate-trace", reactor, annReactor, limit, runtime.NumInteger);
      return runtime.getField(reactor, "simulate-trace").app(limit);
    }

    function stopTrace(reactor) {
      checkArity(1, arguments, "reactors", false);
      c1("stop-trace", reactor, annReactor);
      return runtime.getField(reactor, "stop-trace").app();
    }

    var F = runtime.makeFunction;

    var values = {
      mouse: gmf(reactorEvents, "mouse"),
      keypress: gmf(reactorEvents, "keypress"),
      "time-tick": gmf(reactorEvents, "time-tick"),
      "raw-key": gmf(reactorEvents, "raw-key"),
      "key-up": gmf(reactorEvents, "key-up"),
      "key-down": gmf(reactorEvents, "key-down"),
      "key-press": gmf(reactorEvents, "key-press"),
      "custom-event": gmf(reactorEvents, "custom-event"),
      "on": F(on, "on"),
      "to": F(to, "to"),
      "on-to": F(onTo, "on-to"),
      "event-sink-name": F(eventSinkName, "event-sink-name"),
      "spy-on": spyOn,
      "get-message-trace-as-table": F(getMessageTraceAsTable, "get-message-trace-as-table"),
      "every": F(every, "every"),
      "event-source-name": F(eventSourceName, "event-source-name"),
      "make-reactor": F(makeReactor, "make-reactor"),

      "get-value": F(getValue, "get-value"),
      "get-instance": F(getValue, "get-instance"),
      "draw": F(draw, "draw"),
      "get-trace": F(getTrace, "get-trace"),
      "get-trace-as-table": F(getTraceAsTable, "get-trace-as-table"),
      "start-trace": F(startTrace, "start-trace"),
      "stop-trace": F(stopTrace, "stop-trace"),
      "interact-trace": F(interactTrace, "interact-trace"),
      "simulate-trace": F(simulateTrace, "simulate-trace"),
      "react": F(react, "react"),
      "interact": F(interact, "interact")

    };

    var types = {
      Event: gtf(reactorEvents, "Event"),
      Reactor: annReactor,
      EventSource: annEventSource,
      EventSink: annEventSink,
      EventHandler: annEventHandler
    };

    var internal = {
      setInteract: setInteract,
      makeEventSource: makeEventSource,
      isEventSource: isEventSource,
      getSourceInfo: getSourceInfo,
      makeEventSink: makeEventSink,
      isEventSink: isEventSink,
      getSinkInfo: getSinkInfo
    };
    return runtime.makeModuleReturn(values, types, internal);
  }
})
