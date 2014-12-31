#lang scribble/base

@(require
  "../../scribble-api.rkt"
  (only-in racket/list add-between)
  (only-in scriblib/footnote note)
  scribble/core)

@title[#:tag "s:running"]{Running Code (Safely)}

In order to support both responsive evaluation and simulate an arbitrarily deep
stack, Pyret has an evaluation model that does not exactly match JavaScript's.

When a Pyret function is compiled, it gets an extra @tt{try/catch} handler
wrapped around it that listens for special Pyret-specific exceptions.  That
means when it's running, we can think of the stack frame of the function as
having an extra layer around it: 

@image[#:scale 0.5 "internal/frames.png"]

When a Pyret function detects (via a counter stored in the runtime) that the
stack depth is approaching the maximum that JavaScript can tolerate, it throws
an exception:

@image[#:scale 0.5 "internal/exception.png"]

When the exception is encountered by one of the handlers, it attaches enough
information to the exception to restart the handler's frame before allowing the
exception to coninue:

@image[#:scale 0.5 "internal/first-frame.png"]

This continues through the entire stack, storing a list of Pyret stack frames
stored on the exception object:

@image[#:scale 0.5 "internal/many-frames.png"]

Until finally, the entire Pyret stack is reified on the exception object, and
all the JavaScript frames from the Pyret functions are gone:

@image[#:scale 0.5 "internal/stack.png"]

This exception is caught by Pyret's toplevel, which restarts the
@emph{bottommost} element of the stack, which now has nothing above it, instead
of a full stack.  It can make progress with the available JS stack.  The
runtime can store the existing Pyret stack and add to it if the JS stack runs
out again.

This works just fine if all that's running is Pyret code.  However, there are
two cases where JavaScript code that interacts with Pyret needs to be handled
delicately.

@section{JS Pretending to be Pyret}

Many library use cases, like data structures and convenience functions, are
written as JavaScript code that emulates Pyret function calls.  However, if JS
code calls back into Pyret code, care is in order.  Here's what the stack looks
like if Pyret calls JavaScript that calls Pyret again:

@image[#:scale 0.5 "internal/callback.png"]

If the stack limit is reached and an exception thrown, the bottom Pyret frames
will have their intermediate state stored:

@image[#:scale 0.5 "internal/callback-bottom.png"]

But the pure JavaScript frames have no stack management handlers installed, so
they are skipped without consideration for any intermediate state they may
contain.

@image[#:scale 0.5 "internal/callback-middle.png"]

The resulting stack doesn't accurately represent the program that was being
executed.  It is, quite literally, nonsense, because a Pyret function will
return directly to another Pyret function, ignoring all of the intermediate
JavaScript logic.  Using this pattern without any guards or protection will
create programs that simply produce wrong answers.

@image[#:scale 0.5 "internal/callback-final.png"]

Pyret's runtime defines a function called @internal-id["Runtime" "safeCall"]
that allows pure JavaScript to participate in the Pyret stack.

@doc-internal["Runtime" "safeCall" (list "(→ a)" "(a → b)") "b" #:stack-unsafe #t]

@internal-id["Runtime" "safeCall"] combines the two provided functions in a
special stack frame:

@image[#:scale 0.5 "internal/safe-call.png"]

The first argument is called, and in normal execution, its return value is
passed to the second function.  The second function's return value is then the
return value of the whole call.  However, if a stack exception occurs, the
@emph{second} function is registered as the frame stored on the Pyret stack:

@image[#:scale 0.5 "internal/safe-call-catch.png"]

This means that in the simulated stack, the second callback (blue in the
picture), will receive the result of the last call to a stack-managed function
from the first callback (pink in the picture):

@image[#:scale 0.5 "internal/return-1.png"]

Then, when the second callback (blue) is run, it's return value will be passed
up the stack to the Pyret function that called into the use of @tt{safeCall}:

@image[#:scale 0.5 "internal/return-2.png"]

The usual pattern for using @internal-id["Runtime" "safeCall"] is with a single
call to a Pyret function, or another function that calls a Pyret function.  As
long as all the calls to Pyret functions are in tail position in safeCalls, no
information will be lost.

@bold{Examples}

Calling @tt{torepr} can consume a lot of stack (for serializing large data
structures), so JavaScript-implemented @tt{torepr} methods often need to use
@tt{safeCall}.  For example, a function that does work with the result of a
@tt{torepr} call needs to use @tt{safeCall} to capture the result correctly:

@verbatim{
function makeDataType(val) {
  function torepr(self, toreprRecursive) {
    return runtime.safeCall(function() {
      return toreprRecursive.app(val); 
    }, function(valAsString) {
      return "Value was: " + valAsString 
    })
  }
  return runtime.makeObject({
    _torepr: runtime.makeMethod1(torepr)
  });
}
}

@note{
We haven't found a way to turn this into an error, so testing and code review
are the only real protections.  The best way to test for this kind of problem
is to pass deeply recursive callbacks into the JS library, which can trigger
odd behavior.  If you have suggestions for patterns or tools to make this less
error-prone, let us know.
}
If instead it was written as:

@verbatim{
function makeDataType(val) {
  function torepr(self, toreprRecursive) {
    var valAsString = toreprRecursive.app(val); 
    return "Value was: " + valAsString;
  }
  return runtime.makeObject({
    _torepr: runtime.makeMethod1(torepr)
  });
}
}

then, a @tt{torepr} call on the resulting object could use up all the stack
while evaluating @tt{toreprRecursive.app(val)}, causing the string
concatenation in the return to simply be ignored.


@section{Asynchronous JS and Pyret}

Lots of JavaScript code works asynchronously, with callbacks that are
registered to be invoked after the stack clears.  The control flow of these
callbacks interacts with Pyret's stack infrastructure.  Most callback-using
JavaScript code simply returns @tt{undefined} immediately, and all further
computation happens in either success or failure continuations.  This doesn't
play nicely with Pyret's stack-based control flow, because Pyret functions
expect a meaningful return value.@note{We could require that all Pyret code
that uses JS callback libraries use Pyret callbacks, but it's hardly elegant to
require that all students learn to use callbacks before they can import an
image.}

@image[#:scale 0.5 "internal/ajax.png"]

In order to weave the control flow of Pyret through the success and failure
continuations of callbacks, the runtime provides a way to pause and reify the
Pyret stack for later resumption.

@doc-internal["Runtime" "pauseStack" (list "(Restarter → Undefined)") "Undefined"]

When @tt{pauseStack} is called, a special @emph{pause} exception is thrown,
that stores the callback passed in as the argument to @tt{pauseStack}.  The
pause exception collects Pyret stack frames in the same way as a stack
exception, it just keeps track of the callback as well:

@image[#:scale 0.5 "internal/pause.png"]

The pause exception is handled specially at the toplevel, by creating a
@tt{Restarter} object that is capable of resuming, stopping, or signalling an
error at the point the Pyret stack was paused.  This @tt{Restarter} is passed
into the callback argument to @tt{pauseStack}, which can then
@emph{asynchronously} restart the Pyret process:

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
  var request = $.ajax("/api");
  request.then(function(answer) {
    restarter.resume(toPyretResponse(answer));
  });
  request.fail(function(err) {
    restarter.error(myRuntime.ffi.makeMessageException("Request failed"));
  });
});
}






