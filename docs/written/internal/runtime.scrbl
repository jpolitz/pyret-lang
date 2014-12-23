#lang scribble/base

@(require
  "../../scribble-api.rkt"
  (only-in racket/list add-between)
  scribble/core)

@(define (doc-internal base-obj name args return #:stack-unsafe [stack-unsafe #f])
  (define tag (list 'part (tag-name base-obj name)))
  (define toc-elt (toc-target-element code-style (tt (list base-obj "." name)) tag))
  (define args-part (if args (append (list "(") (add-between args ", ") (list ") → ")) (list " :: ")))
  (define stack-warning (if stack-unsafe (list (linebreak) "This function is not " (seclink "s:stack" "stack safe")) (list)))
  (nested #:style (div-style "function")
    (list
      (apply para #:style "boxed pyret-header"
        (append
          (map tt (append (list toc-elt) args-part (list return)))
          stack-warning)))))

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

@doc-internal["Runtime" "loadModules" (list "JSNamespace" "JSArray<PyretModule>" "(PyretModuleResult ... → Undefined)") "Undefined" #:stack-unsafe #t]

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

@doc-internal["Runtime" "makeNumber" (list "PyretObject" "JSNumber") "PyretNumber"]

@doc-internal["Runtime" "makeNumberFromString" (list "PyretObject" "JSString") "PyretNumber"]

Parses the string and creates a representation of the number that avoids float
overflows and can represent very large and very small rationals exactly.

@doc-internal["Runtime" "makeString" (list "PyretObject" "JSString") "PyretString"]

@doc-internal["Runtime" "pyretTrue" #f "PyretBoolean"]
@doc-internal["Runtime" "pyretFalse" #f "PyretBoolean"]

@doc-internal["Runtime" "makeArray" (list "PyretObject" "JSString") "PyretString"]

@doc-internal["Runtime" "makeObject" (list "PyretObject" "JSObj") "PyretObject"]

@doc-internal["Runtime" "makeFunction" (list "PyretObject" "JSFunction") "PyretFunction"]

@doc-internal["Runtime" "makeMethodN" (list "PyretObject" "JSFunction") "PyretMethod"]

@subsection{Interacting with Objects}

@doc-internal["Runtime" "getField" (list "PyretObject" "JSString") "PyretValue"]

@doc-internal["Runtime" "getFields" (list "PyretObject") "JSArray<String>"]

@subsection[#:tag "s:stack"]{Running Code (Safely)}

There are a few different models for running code in a runtime:

@itemlist[

  @item{If library code is called from Pyret and re-enters Pyret, for example
  in a library that is trying to "act like" Pyret, it needs to participate in
  the same stack as the current running Pyret thread.}

  @item{If Javascript wants to @emph{register Pyret code as a callback} for
  some event, it needs to keep track of the current Pyret stack while the
  asynchronous operation occurs, and then reinstate it for the Pyret callback.}

  @item{If JavaScript is trying to @emph{start} Pyret in a new runtime, it
  needs to start a new Pyret thread.}

]

Each of these cases has specific helpers written for it.

@subsubsection{JS Pretending to be Pyret}

Most library use cases, like data structures and convenience functions, are
written as JavaScript code that emulates Pyret function calls.  Because of
Pyret's unique stack management, calling back into Pyret code requires some
care.

@doc-internal["Runtime" "safeCall" (list "(→ a)" "(a -> Undefined)") "Undefined" #:stack-unsafe #t]

The JavaScript representation of a Pyret function has a @tt{.app} field that
can be used to explicitly call the function.  However, directly calling it can
lead to incorrect behavior.  The correct pattern to use is with @tt{safeCall}:

@verbatim{
define(["js/runtime-anf", "trove/lists"], function(runtimeLib, listLib) {
  var myRuntime = runtimeLib.create({});
  myRuntime.loadModules(myRuntime.namespace, [listLib], function(lists) {
    myRuntime.safeCall(function() {
      myRuntime.getField(myRuntime.getField(lists, "list"), "make").app(
          myRuntime.makeArray([1, 2, 3].map(myRuntime.makeNumber))
        );
    }, function(val) {
      // val is a Pyret list containing 1, 2, 3
    });
  });
});
}

Here, we're looking up the constructor @tt{make} that turns raw arrays into
lists, and wrapping the call to it in @tt{safeCall}.  If we didn't, and
instead wrote something like:

@verbatim{
  var l =
    myRuntime.getField(myRuntime.getField(lists, "list"), "make").app(
      myRuntime.makeArray([1, 2, 3].map(myRuntime.makeNumber))
    );
  // do things with l
}

Then the program might run out of stack space while calling the @tt{.app}, and
throw an exception, and @tt{// do things with l} would never happen.  The call
to @tt{safeCall} installs an appropriate wrapper so the continuation always
gets called.

Note that the context around @tt{safeCall} may also need to be protected; the
only guarantee it provides is that the provided continuation is called.  So
something like this is not safe:

@verbatim{
var val = runtime.safeCall(
  function() { /* some pyret call */ },
  function(v) { /* ... */ });
// This may NOT be reached
}

Because of limitations of JavaScript, we haven't found a way to turn this into
an error, so testing and code review are the only real protections.  The best
way to test for this kind of problem is to pass deeply recursive callbacks
into the JS library, which can trigger odd behavior. 


@subsubsection{Asynchronous JS and Pyret}

Lots of JavaScript code works asynchronously, with callbacks that are
registered to be invoked after the stack clears.  Pyret's stack management
requires that we use a special pattern in order to not forget the running
Pyret computation when clearing the stack for a callback.

@doc-internal["Runtime" "pauseStack" (list "(Restarter → Undefined)") "Undefined"]

A @tt{Restarter} has a few fields:

@verbatim{
Restarter :: {
  resume: PyretVal → Undefined,
  error: (PyretError U PyretVal) → Undefined,
  break: → Undefined
}
}

Example:

@verbatim{
myRuntime.pauseStack(function(restarter) {
  var request = $.ajax("http://example.com");
  request.then(function(answer) {
    restarter.resume(toPyretResponse(answer));
  });
  request.fail(function(err) {
    restarter.resume(myRuntime.ffi.makeMessageException("Request failed"));
  });
});
}


