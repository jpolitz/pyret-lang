#lang scribble/base

@(require
  "../../scribble-api.rkt"
  (only-in racket/list add-between)
  scribble/core)

@title[#:tag "runtime"]{Runtime API}

Pyret exposes most of its internal operations on the @tt{runtime} object; most
JavaScript code that interacts with Pyret will need to know about the runtime.

The library that defines runtimes is in @tt{src/js/base/runtime-anf.js}, and it
is configured to be importable with @tt{js/runtime-anf} via RequireJS:

@verbatim{
define(["js/runtime-anf"], function(runtimeLib) {
  // use runtimeLib
});
}

@doc-internal["RuntimeLib" "create" (list "options") "Runtime"]

Create a new Pyret runtime.  The @tt{RuntimeLib} value itself only exports
this interface, and most other useful functions are referenced from the
runtime objecs it creates.  The options are:

@verbatim{
  options :: {
    initialGas: Number,
    stdout: String → Undefined,
    stderr: String → Undefined
  }
}

The size of the Pyret stack is constrained to @tt{initialGas} frames; most
applications have little need to set this.

For applications that need control over printing, they can set @tt{stdout} and
@tt{stderr} to get called whenever Pyret would print strings (e.g. via
@tt{print}).  This interface may change to accept all Pyret values at some
point, to allow for richer rendering interfaces.

@section{The Pyret Runtime}

The return value of @internal-id["RuntimeLib" "create"] is a runtime
object with many useful methods for programmatically interacting with Pyret.

@subsection{Loading Pyret Modules}

Pyret modules' source can be located with RequireJS by referencing them as
dependencies in @tt{define}.  To instantiate the modules, the Pyret runtime
provides a special mechanism.

@doc-internal["Runtime" "loadModules" (list "JSNamespace" "JSArray<PyretModule>" "(PyretModuleResult ... → a)") "a" #:stack-unsafe #t]

This call runs the body of the given modules in order, and passes the results
to the provided callback.  Any return value of the callback is ignored.  In
most cases, the value of @tt{runtime.namespace} is appropriate for the first
argument.

Example:

@verbatim{
define(["js/runtime-anf", "trove/lists"], function(runtimeLib, listLib) {
  var myRuntime = runtimeLib.create({});
  myRuntime.loadModules(myRuntime.namespace, [listLib], function(list) {
    // list has fields like "link", "map", etc. from the lists module
  });
});
}

@subsection{Creating Values}

@doc-internal["Runtime" "makeNumber" (list "JSNumber") "PyretNumber"]

@doc-internal["Runtime" "makeNumberFromString" (list "JSString") "PyretNumber"]

Parses the string and creates a representation of the number that avoids float
overflows and can represent very large and very small rationals exactly.

@doc-internal["Runtime" "makeString" (list "JSString") "PyretString"]

@doc-internal["Runtime" "pyretTrue" #f "PyretBoolean"]
@doc-internal["Runtime" "pyretFalse" #f "PyretBoolean"]

@doc-internal["Runtime" "makeArray" (list "JSString") "PyretRawArray"]

@doc-internal["Runtime" "makeObject" (list "JSObj") "PyretObject"]

@doc-internal["Runtime" "makeFunction" (list "JSFunction") "PyretFunction"]

@doc-internal["Runtime" "makeMethodN" (list "JSFunction") "PyretMethod"]

@subsection{Interacting with Objects}

@doc-internal["Runtime" "getField" (list "PyretObject" "JSString") "PyretValue"]

@doc-internal["Runtime" "getFields" (list "PyretObject") "JSArray<String>"]

