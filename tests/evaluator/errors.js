var r = require("requirejs")
define(["js/runtime-anf", "./eval-matchers"], function(rtLib, e) {

  var _ = require('jasmine-node');
  var rt;
  var P;
  var err;
  var same;

  function performTest() {

    beforeEach(function() {
      rt = rtLib.makeRuntime({ stdout: function(str) { process.stdout.write(str); } });
      P =  e.makeEvalCheckers(this, rt);
      err = P.checkError;
      same = P.checkEvalsTo;
    });

    describe("run-task", function() {
      it("should work for normal computation", function(done) {
        var prog =
"cases(Either) run-task(lam(): 5 end):\n" +
"    | left(v) => v\n" +
"    | right(exn) => 'fail'\n" +
"end";
        same(prog, rt.makeNumber(5));

        P.wait(done);
        
      }, 10000);
      it("should work for exceptional computation", function(done) {
        var prog =
"cases(Either) run-task(lam(): raise('ahoy') end):\n" +
"    | left(v) => 'fail'\n" +
"    | right(exn) => exn\n" +
"end";
        same(prog, rt.makeString('ahoy'));

        P.wait(done);
      }, 10000);

      it("should work when nested", function(done) {
        var prog =
"fun f(n):\n" +
"  cases(Either) run-task(lam(): if n < 1: 0 else: raise(f(n - 1));;):\n" +
"      | left(v) => v\n" +
"      | right(exn) => n + exn\n" +
"  end\n" +
"end\n" +
"f(5)";
        same(prog, rt.makeNumber(15));

        P.wait(done);
      }, 20000);
    });

    xdescribe("lookup-number", function() {
      it("should signal an error for looking up fields on numbers", function(done) {
        err("5.x", function(e) {
          return rt.unwrap(e.exn).indexOf("looked up field x on 5, which does not have any fields") !== -1;
        });
        P.wait(done);
      });
    });

    describe("contracts", function() {
      var isFail = function(err) { return err.exn && rt.ffi.isFail(err.exn); }
      it("should fail if the contract is not bound", function(done) {
        P.checkCompileErrorMsg("x :: NotAType = 5", "not defined as a type");
        P.checkCompileErrorMsg("x :: (Number -> Fail) = 5", "not defined as a type");
        P.checkCompileErrorMsg("x :: (Number -> { x:: Fail }) = 5", "not defined as a type");
        P.checkCompileErrorMsg("x :: Numba % (is-even) = 5", "not defined as a type");
        P.checkCompileErrorMsg("x :: lisst.List = 10", "not defined as a type");

        P.checkCompileErrorMsg("y = 5 x :: y = 5", "not defined as a type");
        P.wait(done);
      });

      it("should work for flat contracts", function(done) {
        P.checkError("x :: String = 5", isFail);
        P.checkError("x :: Number = 'foo'", isFail);
        P.wait(done);
      });

      xit("should work for arrow contracts, by checking function-ness", function(done) {
        P.checkError("x :: (String -> Number) = 5", isFail);
        P.checkError("x :: (String, Number -> Number) = { x: 'not-an-arrow' }", isFail);
        P.wait(done);
      });

      it("should bind types", function(done) {
        P.checkError("type-let N = Number: x :: N = 'foo' x end", isFail);
        P.checkError("type-let S = String, N = Number: x :: (S -> N) = 'foo' x end", isFail);

        P.checkEvalsTo("type-let N = Number: x :: N = 5 x end", 5);
        P.wait(done);
      });
    })

    describe("compiler", function() {
      it("should signal an error when the compile fails", function(done) {
        P.checkCompileError("lam(): x = 5 y = 10 end", function(e) {
            expect(e.length).toEqual(1);
            return true;
          });
        P.wait(done);
      });
    });

    describe("unbound ids", function() {
      it("should notice unbound ids", function(done) {
        P.checkCompileError("z", function(e) {
          expect(e.length).toEqual(1);
          return true;
        });
        P.wait(done);
      });
    });


    describe("shadowing", function() {
      it("should notice shadowed builtins", function(done) {
        P.checkCompileError("lam(x): x = 5 x end", function(e) {
          expect(e.length).toEqual(1);
          return true;
        });
        P.checkCompileError("string-contains = 5", function(e) {
          expect(e.length).toEqual(1);
          return true;
        });
        P.checkEvalsTo("shadow string-contains = 5\nstring-contains", rt.makeNumber(5));
        P.wait(done);
      });
    });

  }
  return { performTest: performTest };
});
