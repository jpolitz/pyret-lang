// The direct-mode Pyret runtime.
//
// Implements the runtime surface consumed by direct-codegen.arr's generated
// code, plus enough of the stock runtime's API that unmodified builtin JS
// trove modules (string-dict.js, parse-pyret.js, ...) run against it.
//
// Value representations (see lang/direct-work/DESIGN.md):
//   Number   -> js-numbers values (JS double fixnums, boxed big/rat/rough)
//   String   -> JS string        Boolean -> JS boolean
//   nothing  -> NOTHING singleton object
//   Function -> plain JS function (arity checked in its own prelude)
//   Method   -> JS function using `this` as self, marked  $m === true
//   Object   -> null-prototype JS object, fields as properties
//   Data     -> object whose prototype carries $name/$fields/$muts/$arity/
//               $brands, shared+with members, and _match
//   Tuple    -> JS array marked $tuple === true
//   RawArray -> JS array         Ref -> { $ref: true, v: ... }
//
// No stack management: safeCall is synchronous, pauseStack only supports
// synchronous resumption and otherwise throws (programs that would capture
// the stack in normal mode must error in direct mode).

define("pyret-base/js/runtime-direct",
  ["pyret-base/js/js-numbers", "pyret-base/js/codePoint", "seedrandom"],
  function(jsnums, codePoint, seedrandom) {

  function makeRuntime(theOutsideWorld) {
    var stdout = theOutsideWorld.stdout;
    var stderr = theOutsideWorld.stderr;

    var modules = Object.create(null);
    var params = Object.create(null);

    //////////////////////////////////////////////////////////////////////
    // Exceptions

    function PyretException(val) {
      this.val = val;
      this.pyretStack = [];
      var e = new Error();
      this.stack = e.stack;
    }
    PyretException.prototype = Object.create(Error.prototype);
    PyretException.prototype.name = "PyretException";
    Object.defineProperty(PyretException.prototype, "message", {
      get: function() {
        try { return toReprJS(this.val, "tostring"); }
        catch(e) { return String(this.val); }
      },
      configurable: true
    });

    function raise(val) {
      throw new PyretException(val);
    }
    function isPyretException(e) { return e instanceof PyretException; }

    // Internal (non-user) errors.  Once the real ffi module (builtin://ffi)
    // is installed by its post-load hook, errors are raised as genuine
    // error.arr data values — matching stock behavior for `raises` tests and
    // error rendering.  Before that (early linking), fall back to strings.
    var DUMMY_LOC = ["direct-mode"];
    function realFfi(name) {
      var f = thisRuntime.ffi;
      if (f && f.$isDirectStub !== true && typeof f[name] === "function") { return f[name]; }
      return null;
    }
    function interr(msg) {
      var t = realFfi("throwMessageException");
      if (t) { t(msg); }
      var e = new PyretException("Error: " + msg);
      e.$isInternal = true;
      throw e;
    }
    function checkArgAnn(v, ann) {
      if (ann === null || ann === undefined || ann.name === "Any") { return; }
      var pred = ann.pred;
      if (typeof pred !== "function") { return; }
      if (!pred(v)) {
        // Numeric refinements report "Number" first for non-numbers
        if (ann.name !== "Number" && ann.name.lastIndexOf("Num", 0) === 0 && !isNumber(v)) {
          typeMismatch(v, "Number");
        }
        typeMismatch(v, ann.name);
      }
    }
    function checkNumAnn(v, pred, name) {
      if (!isNumber(v)) { typeMismatch(v, "Number"); }
      if (!pred(v)) { typeMismatch(v, name); }
      return v;
    }
    function typeMismatch(val, typeName) {
      var t = realFfi("throwTypeMismatch");
      if (t) { t(val, typeName); }
      interr("expected " + typeName + ", got " + safeRepr(val));
    }

    function ffiError(name /*, args */) {
      // Called for stock ffi.throwXYZ(...) equivalents
      var parts = [];
      for (var i = 1; i < arguments.length; i++) {
        var a = arguments[i];
        try { parts.push(typeof a === "string" ? a : toReprJS(a, "torepr")); }
        catch(e) { parts.push(String(a)); }
      }
      interr(name + ": " + parts.join(", "));
    }

    //////////////////////////////////////////////////////////////////////
    // Core singletons

    var NOTHING = Object.create(null);
    NOTHING.$nothing = true;

    var ANY = { $ann: true, name: "Any" };

    function Opaque(val) { this.val = val; }
    function makeOpaque(v) { return new Opaque(v); }
    function isOpaque(v) { return v instanceof Opaque; }

    //////////////////////////////////////////////////////////////////////
    // Type tests

    function isNumber(v) {
      return typeof v === "number" || jsnums.isPyretNumber(v);
    }
    function isString(v) { return typeof v === "string"; }
    function isBoolean(v) { return v === true || v === false; }
    function isNothing(v) { return v === NOTHING; }
    function isFunction(v) { return typeof v === "function" && v.$m !== true; }
    function isMethod(v) { return typeof v === "function" && v.$m === true; }
    function isPTuple(v) { return Array.isArray(v) && v.$tuple === true; }
    function isRawArray(v) { return Array.isArray(v) && v.$tuple !== true; }
    function isRef(v) { return typeof v === "object" && v !== null && v.$ref === true; }
    function isDataValue(v) {
      return typeof v === "object" && v !== null && v.$name !== undefined;
    }
    function isObject(v) {
      return typeof v === "object" && v !== null && !Array.isArray(v) &&
        v.$ref !== true && v !== NOTHING && !(v instanceof Opaque) && !isNumber(v);
    }
    function isPyretVal(v) {
      return isNumber(v) || isString(v) || isBoolean(v) || v === NOTHING ||
        typeof v === "function" || (typeof v === "object" && v !== null);
    }

    //////////////////////////////////////////////////////////////////////
    // Numbers

    var NumberErrbacks = {
      throwDivByZero: function(msg) { interr(String(msg)); },
      throwToleranceError: function(msg) { interr(String(msg)); },
      throwRelToleranceError: function(msg) { interr(String(msg)); },
      throwGeneralError: function(msg) { interr(String(msg)); },
      throwDomainError: function(msg) { interr(String(msg)); },
      throwSqrtNegative: function(msg) { interr(String(msg)); },
      throwLogNonPositive: function(msg) { interr(String(msg)); },
      throwIncomparableValues: function(msg) { interr(String(msg)); },
      throwInternalError: function(msg) { interr(String(msg)); }
    };

    function checkNumber(v) {
      if (!isNumber(v)) { typeMismatch(v, "Number"); }
      return v;
    }
    function checkString(v) {
      if (typeof v !== "string") { typeMismatch(v, "String"); }
      return v;
    }
    function checkBoolean(v) {
      if (v !== true && v !== false) { typeMismatch(v, "Boolean"); }
      return v;
    }
    function checkFunction(v) {
      if (typeof v !== "function" || v.$m === true) { typeMismatch(v, "Function"); }
      return v;
    }
    function checkArray(v) {
      if (!isRawArray(v)) { typeMismatch(v, "RawArray"); }
      return v;
    }
    function checkTuple(v) {
      if (!isPTuple(v)) { typeMismatch(v, "Tuple"); }
      return v;
    }
    function checkNothing(v) {
      if (v !== NOTHING) { typeMismatch(v, "Nothing"); }
      return v;
    }
    function checkObject(v) {
      if (!isObject(v)) { typeMismatch(v, "Object"); }
      return v;
    }
    function checkMethod(v) {
      if (!isMethod(v)) { typeMismatch(v, "Method"); }
      return v;
    }
    function checkPyretVal(v) { return v; }

    function numToString(n) {
      if (typeof n === "number") { return String(n); }
      return n.toString();
    }

    //////////////////////////////////////////////////////////////////////
    // Module registry

    function getModuleField(uri, which, name) {
      var mod = modules[uri];
      if (mod === undefined) { interr("module not loaded: " + uri); }
      var ppt = mod["provide-plus-types"];
      if (ppt === undefined) { interr("module has no provides: " + uri); }
      var dict = ppt[which];
      if (dict === undefined) { interr("module " + uri + " has no " + which); }
      var v = dict[name];
      if (v === undefined && !(name in dict)) {
        interr("module " + uri + " does not provide " + which + " member " + name);
      }
      return v;
    }

    function lazyModVal(uri, name) {
      // For runtime-internal access to trove module exports (srcloc,
      // equality, lists, option, either, valueskeleton)
      return getModuleField(uri, "values", name);
    }

    //////////////////////////////////////////////////////////////////////
    // Field access (generated-code hot path)

    function fieldNotFound(obj, field) {
      if (obj === null || typeof obj !== "object") {
        var tl = realFfi("throwLookupNonObject");
        if (tl) { tl(makeSrcloc(DUMMY_LOC), obj, field); }
      } else {
        var t = realFfi("throwFieldNotFound");
        if (t) { t(makeSrcloc(DUMMY_LOC), obj, field); }
      }
      interr("field " + field + " not found on " + safeRepr(obj));
    }

    function bindMeth(obj, m) {
      var f = function() {
        return m.apply(obj, arguments);
      };
      f.$boundMethod = true;
      f.$name = m.$name;
      return f;
    }

    // a-dot
    function g(obj, field) {
      if (typeof obj === "object" && obj !== null) {
        var v = obj[field];
        if (v === undefined) {
          if (!(field in obj)) { fieldNotFound(obj, field); }
        }
        if (typeof v === "function" && v.$m === true) { return bindMeth(obj, v); }
        return v;
      }
      fieldNotFound(obj, field);
    }

    // a-colon (raw access, no method binding)
    function gc(obj, field) {
      if (typeof obj === "object" && obj !== null) {
        var v = obj[field];
        if (v === undefined && !(field in obj)) { fieldNotFound(obj, field); }
        return v;
      }
      fieldNotFound(obj, field);
    }

    // a-get-bang: derefs ref fields, returns non-ref fields as-is (stock
    // getFieldRef semantics)
    function gb(obj, field) {
      var r = gc(obj, field);
      if (r !== null && r !== undefined && r.$ref === true) { return r.v; }
      if (typeof r === "function" && r.$m === true) { return bindMeth(obj, r); }
      return r;
    }

    //////////////////////////////////////////////////////////////////////
    // Refs

    function ref(v) { return { $ref: true, v: v, frozen: false }; }
    function makeGraphableRef() { return { $ref: true, v: undefined, frozen: false, graphable: true }; }
    function refGet(r) {
      if (!isRef(r)) { interr("ref-get on non-ref"); }
      return r.v;
    }
    function refSet(r, v) {
      if (!isRef(r)) { interr("ref-set on non-ref"); }
      if (r.frozen) { interr("ref-set on frozen ref"); }
      r.v = v;
      return r;
    }
    function refFreeze(r) {
      if (!isRef(r)) { interr("ref-freeze on non-ref"); }
      r.frozen = true;
      return r;
    }

    //////////////////////////////////////////////////////////////////////
    // Tuples

    function tup(arr) {
      arr.$tuple = true;
      return arr;
    }
    function getTuple(t, i, loc) {
      if (!isPTuple(t)) { interr("tuple-get on non-tuple " + safeRepr(t)); }
      if (i >= t.length) { interr("tuple index " + i + " too large for " + safeRepr(t)); }
      return t[i];
    }

    //////////////////////////////////////////////////////////////////////
    // Object extension / update

    function ext(obj, fields) {
      if (obj === null || typeof obj !== "object") {
        var t = realFfi("throwExtendNonObject");
        if (t) { t(makeSrcloc(DUMMY_LOC), obj); }
        interr("cannot extend " + safeRepr(obj));
      }
      var res = Object.create(Object.getPrototypeOf(obj));
      var keys = Object.keys(obj);
      for (var i = 0; i < keys.length; i++) { res[keys[i]] = obj[keys[i]]; }
      var fkeys = Object.keys(fields);
      for (var j = 0; j < fkeys.length; j++) {
        var k = fkeys[j];
        // Overriding an existing ref field via extension is an error (stock
        // extendWith)
        if ((k in obj) && isRef(obj[k])) {
          interr("Cannot update ref field " + k);
        }
        res[k] = fields[k];
      }
      return res;
    }

    function upd(obj, fields) {
      if (obj === null || typeof obj !== "object") {
        interr("cannot update " + safeRepr(obj));
      }
      var fkeys = Object.keys(fields);
      // Validate everything before mutating anything (updates are atomic)
      for (var i = 0; i < fkeys.length; i++) {
        var k = fkeys[i];
        var r = obj[k];
        if (r === undefined && !(k in obj)) {
          var tn = realFfi("throwUpdateNonExistentField");
          if (tn) { tn(makeSrcloc(DUMMY_LOC), obj, makeSrcloc(DUMMY_LOC), k, makeSrcloc(DUMMY_LOC)); }
          interr("update of non-existent field " + k);
        }
        if (r === null || r === undefined || r.$ref !== true) {
          var t = realFfi("throwUpdateNonRef");
          if (t) { t(makeSrcloc(DUMMY_LOC), obj, makeSrcloc(DUMMY_LOC), k, makeSrcloc(DUMMY_LOC)); }
          interr("update of non-ref field " + k);
        }
        if (r.frozen) {
          var tf = realFfi("throwUpdateFrozenRef");
          if (tf) { tf(makeSrcloc(DUMMY_LOC), obj, makeSrcloc(DUMMY_LOC), k, makeSrcloc(DUMMY_LOC)); }
          interr("update of frozen ref field " + k);
        }
      }
      for (var j = 0; j < fkeys.length; j++) {
        obj[fkeys[j]].v = fields[fkeys[j]];
      }
      return obj;
    }

    //////////////////////////////////////////////////////////////////////
    // Methods

    function mkM(fullFun, name) {
      fullFun.$m = true;
      fullFun.$name = name;
      return fullFun;
    }

    //////////////////////////////////////////////////////////////////////
    // Data support

    // cases field access, normal bind: plain binding of a ref field is an
    // error (mirrors stock derefField(value, fieldIsRef, lookupIsRef=false))
    function cf(v, i) {
      var f = v[v.$fields[i]];
      if (v.$muts[i]) { interr("Cases on ref field needs to use ref"); }
      return f;
    }
    // cases field access, ref bind: dereferences the ref
    function cr(v, i) {
      var f = v[v.$fields[i]];
      if (!v.$muts[i]) { interr("Cannot use ref in cases to access non-ref field"); }
      return f.v;
    }
    function cerr(v, branchName, wanted) {
      var t = realFfi("throwCasesArityErrorC");
      if (t) { t(DUMMY_LOC, wanted, (v.$fields ? v.$fields.length : 0), DUMMY_LOC, DUMMY_LOC); }
      interr("cases branch " + branchName + " expects " + wanted +
        " arguments, but the variant has " + (v.$fields ? v.$fields.length : 0) + " fields");
    }
    function ae(name, expected, args) {
      // args is the caller's `arguments` object (or a plain count)
      if (typeof args !== "number") {
        var t = realFfi("throwArityErrorC");
        if (t) { t([name], expected, Array.prototype.slice.call(args), false); }
        args = args.length;
      }
      interr("arity mismatch calling " + name + ": expected " + expected + " arguments, got " + args);
    }
    function uninit(name) {
      var t = realFfi("throwUninitializedIdMkLoc");
      if (t) { t(DUMMY_LOC, name); }
      interr("the identifier " + name + " was used before it was defined");
    }

    var brandCounter = 0;
    function namedBrander(name, loc) {
      var key = "$brand" + (++brandCounter) + "$" + name;
      var brander = {
        __proto__: null,
        _brand: key,
        test: function(v) {
          if (arguments.length !== 1) { ae("brand-test", 1, arguments); }
          return hb(v, key);
        },
        brand: function(v) {
          if (arguments.length !== 1) { ae("brand", 1, arguments); }
          return genericBrand(v, key);
        }
      };
      return brander;
    }
    function brander() {
      return namedBrander("anon");
    }
    function hb(v, key) {
      return !!(v !== null && typeof v === "object" && v.$brands !== undefined && v.$brands[key] === true);
    }
    function genericBrand(v, key) {
      if (v === null || typeof v !== "object") { interr("cannot brand " + safeRepr(v)); }
      var res = Object.create(Object.getPrototypeOf(v));
      var keys = Object.keys(v);
      for (var i = 0; i < keys.length; i++) { res[keys[i]] = v[keys[i]]; }
      var newBrands = Object.create(null);
      if (v.$brands !== undefined) {
        for (var b in v.$brands) { newBrands[b] = v.$brands[b]; }
      }
      newBrands[key] = true;
      res.$brands = newBrands;
      return res;
    }
    function makeBranderAnn(brander, name) {
      return { $ann: true, name: name, brander: brander, pred: brander.test };
    }

    // Generic _match method installed on every data prototype
    var vMatch = mkM(function(visitor, elseFn) {
      var self = this;
      var h = visitor === null || typeof visitor !== "object" ? undefined : visitor[self.$name];
      if (h === undefined) { return elseFn(); }
      var fields = self.$fields;
      var isM = typeof h === "function" && h.$m === true;
      if (fields === undefined) {
        return isM ? h.call(visitor) : h();
      }
      var args = new Array(fields.length);
      for (var i = 0; i < fields.length; i++) {
        args[i] = self.$muts[i] ? self[fields[i]].v : self[fields[i]];
      }
      if (isM) { return h.apply(visitor, args); }
      return h.apply(undefined, args);
    }, "_match");

    //////////////////////////////////////////////////////////////////////
    // Srclocs

    function sr(L, i) {
      var cache = L.$locs || (L.$locs = []);
      var cached = cache[i];
      if (cached !== undefined) { return cached; }
      var arr = L[i];
      var v;
      if (arr.length === 1) {
        v = lazyModVal("builtin://srcloc", "builtin")(arr[0]);
      } else {
        var f = lazyModVal("builtin://srcloc", "srcloc");
        v = f(arr[0], arr[1], arr[2], arr[3], arr[4], arr[5], arr[6]);
      }
      cache[i] = v;
      return v;
    }
    function makeSrcloc(arr) {
      if (arr.length === 1) {
        return lazyModVal("builtin://srcloc", "builtin")(arr[0]);
      }
      var f = lazyModVal("builtin://srcloc", "srcloc");
      return f(arr[0], arr[1], arr[2], arr[3], arr[4], arr[5], arr[6]);
    }

    //////////////////////////////////////////////////////////////////////
    // Equality

    function eqEqual() { return lazyModVal("builtin://equality", "Equal"); }
    function eqNotEqual(reason, v1, v2) {
      return lazyModVal("builtin://equality", "NotEqual")(reason, v1, v2);
    }
    function eqUnknown(reason, v1, v2) {
      return lazyModVal("builtin://equality", "Unknown")(reason, v1, v2);
    }

    // tolMode: "abs" | "rel" | "smooth" (stock TOL_IS_ABS/REL/SMOOTH)
    function numEquals(l, r, tol, tolMode) {
      if (tol === undefined) {
        return jsnums.equals(l, r, NumberErrbacks);
      } else if (tolMode === "rel") {
        return jsnums.roughlyEqualsRel(l, r, tol, false, NumberErrbacks);
      } else if (tolMode === "smooth") {
        return jsnums.roughlyEqualsRel(l, r, tol, true, NumberErrbacks);
      } else {
        return jsnums.roughlyEquals(l, r, tol, NumberErrbacks);
      }
    }

    function sameBrands(lb, rb) {
      var lkeys = lb === undefined ? [] : Object.keys(lb);
      var rkeys = rb === undefined ? [] : Object.keys(rb);
      if (lkeys.length !== rkeys.length) { return false; }
      for (var i = 0; i < lkeys.length; i++) {
        if (rb[lkeys[i]] !== true) { return false; }
      }
      return true;
    }

    // Core structural equality.  now: deref refs / compare array contents.
    // tol/rel: numeric tolerance.  Returns an equality.arr EqualityResult.
    function equalCore(left, right, now, tol, rel) {
      var worklist = [[left, right]];
      var seenL = [];
      var seenR = [];

      function seen(l, r) {
        for (var i = 0; i < seenL.length; i++) {
          if (seenL[i] === l && seenR[i] === r) { return true; }
        }
        return false;
      }

      while (worklist.length > 0) {
        var pair = worklist.pop();
        var l = pair[0];
        var r = pair[1];
        if (l === r && typeof l !== "number") {
          if (typeof l === "function") {
            // Functions/methods are incomparable even to themselves
            return eqUnknown(l.$m === true ? "Methods" : "Functions", l, r);
          }
          continue;
        }
        if (isNumber(l) && isNumber(r)) {
          if (tol === undefined &&
              (jsnums.isRoughnum(l) || jsnums.isRoughnum(r))) {
            return eqUnknown("Roughnums", l, r);
          }
          if (!numEquals(l, r, tol, rel)) { return eqNotEqual("Numbers", l, r); }
          continue;
        }
        if (typeof l === "string" || typeof r === "string" ||
            typeof l === "boolean" || typeof r === "boolean") {
          if (l !== r) { return eqNotEqual("Primitives", l, r); }
          continue;
        }
        if (typeof l === "function" || typeof r === "function") {
          if (isMethod(l) && isMethod(r)) { return eqUnknown("Methods", l, r); }
          if (typeof l === "function" && typeof r === "function") { return eqUnknown("Functions", l, r); }
          return eqNotEqual("Function", l, r);
        }
        if (l === NOTHING || r === NOTHING) {
          if (l !== r) { return eqNotEqual("Nothing", l, r); }
          continue;
        }
        if (l === null || r === null || typeof l !== "object" || typeof r !== "object") {
          if (l !== r) { return eqNotEqual("Values", l, r); }
          continue;
        }
        // Both objects now
        if (isRef(l) || isRef(r)) {
          if (!isRef(l) || !isRef(r)) { return eqNotEqual("Ref", l, r); }
          if (now || (l.frozen && r.frozen)) {
            if (seen(l, r)) { continue; }
            seenL.push(l); seenR.push(r);
            worklist.push([l.v, r.v]);
          } else {
            return eqNotEqual("Refs", l, r);
          }
          continue;
        }
        if (isPTuple(l) || isPTuple(r)) {
          if (!isPTuple(l) || !isPTuple(r)) { return eqNotEqual("Tuple", l, r); }
          if (l.length !== r.length) { return eqNotEqual("Tuple length", l, r); }
          for (var ti = 0; ti < l.length; ti++) { worklist.push([l[ti], r[ti]]); }
          continue;
        }
        if (Array.isArray(l) || Array.isArray(r)) {
          if (!Array.isArray(l) || !Array.isArray(r)) { return eqNotEqual("RawArray", l, r); }
          if (!now) { return eqNotEqual("RawArrays", l, r); }
          if (l.length !== r.length) { return eqNotEqual("RawArray length", l, r); }
          if (seen(l, r)) { continue; }
          seenL.push(l); seenR.push(r);
          for (var ai = 0; ai < l.length; ai++) { worklist.push([l[ai], r[ai]]); }
          continue;
        }
        if (l instanceof Opaque || r instanceof Opaque) {
          if (l !== r) { return eqNotEqual("Opaques", l, r); }
          continue;
        }
        if (seen(l, r)) { continue; }
        seenL.push(l); seenR.push(r);

        // Brand sets must agree before any deeper comparison (stock equal3)
        if (!sameBrands(l.$brands, r.$brands)) {
          return eqNotEqual("Brands", l, r);
        }

        // _equals override (only after the brands agree)
        var eqMeth = l["_equals"];
        if (eqMeth !== undefined && typeof eqMeth === "function" && eqMeth.$m === true) {
          var recEq = function(a, b) {
            return equalCore(a, b, now, tol, rel);
          };
          var res = eqMeth.call(l, r, recEq);
          if (!(isDataValue(res) &&
                (res.$name === "Equal" || res.$name === "NotEqual" || res.$name === "Unknown"))) {
            typeMismatch(res, "EqualityResult");
          }
          if (res.$name === "Equal") { continue; }
          return res;
        }

        if (isDataValue(l) || isDataValue(r)) {
          if (Object.getPrototypeOf(l) !== Object.getPrototypeOf(r)) {
            return eqNotEqual("Data", l, r);
          }
          var fields = l.$fields;
          if (fields !== undefined) {
            for (var fi = 0; fi < fields.length; fi++) {
              worklist.push([l[fields[fi]], r[fields[fi]]]);
            }
          }
          continue;
        }

        // Plain objects: compare field sets and contents
        var lkeys = Object.keys(l).sort();
        var rkeys = Object.keys(r).sort();
        if (lkeys.length !== rkeys.length) { return eqNotEqual("Object keys", l, r); }
        for (var ki = 0; ki < lkeys.length; ki++) {
          if (lkeys[ki] !== rkeys[ki]) { return eqNotEqual("Object keys", l, r); }
          worklist.push([l[lkeys[ki]], r[rkeys[ki]]]);
        }
      }
      return eqEqual();
    }

    function eqResultToBool(res, l, r) {
      if (res.$name === "Equal") { return true; }
      if (res.$name === "NotEqual") { return false; }
      var t = realFfi("throwEqualityException");
      if (t) { t(g(res, "reason"), g(res, "value1"), g(res, "value2")); }
      interr("Attempted to compare incomparable values " + safeRepr(l) + " and " + safeRepr(r));
    }

    function equalAlways(l, r) {
      if (arguments.length !== 2) { ae("equal-always", 2, arguments); }
      return eqResultToBool(equalCore(l, r, false, undefined, "abs"), l, r);
    }
    function equalAlways3(l, r) { return equalCore(l, r, false, undefined, "abs"); }
    function equalNow(l, r) {
      if (arguments.length !== 2) { ae("equal-now", 2, arguments); }
      return eqResultToBool(equalCore(l, r, true, undefined, "abs"), l, r);
    }
    function equalNow3(l, r) { return equalCore(l, r, true, undefined, "abs"); }

    function identical(l, r) {
      if (arguments.length !== 2) { ae("identical", 2, arguments); }
      return eqResultToBool(identical3(l, r), l, r);
    }
    function identical3(l, r) {
      if (isFunction(l) && isFunction(r)) { return eqUnknown("Functions", l, r); }
      if (isMethod(l) && isMethod(r)) { return eqUnknown("Methods", l, r); }
      if (isNumber(l) && isNumber(r)) {
        var lRough = jsnums.isRoughnum(l);
        var rRough = jsnums.isRoughnum(r);
        if (lRough && rRough) { return eqUnknown("Roughnums", l, r); }
        if (lRough || rRough) { return eqNotEqual("Numbers", l, r); }
        return jsnums.equals(l, r, NumberErrbacks) ? eqEqual() : eqNotEqual("Numbers", l, r);
      }
      return l === r ? eqEqual() : eqNotEqual("Values", l, r);
    }

    var ROUGH_TOL = jsnums.fromFixnum(0.000001, NumberErrbacks);
    function roughlyEqualAlways(l, r) {
      return eqResultToBool(equalCore(l, r, false, ROUGH_TOL, "smooth"), l, r);
    }
    function roughlyEqualAlways3(l, r) { return equalCore(l, r, false, ROUGH_TOL, "smooth"); }
    function roughlyEqualNow(l, r) {
      return eqResultToBool(equalCore(l, r, true, ROUGH_TOL, "smooth"), l, r);
    }
    function roughlyEqualNow3(l, r) { return equalCore(l, r, true, ROUGH_TOL, "smooth"); }

    function withinFam(now, tolMode, three, checkNonNeg) {
      return function(tol) {
        if (arguments.length !== 1) { ae("within", 1, arguments); }
        if (checkNonNeg === true) {
          checkNumAnn(tol, function(v) { return jsnums.greaterThanOrEqual(v, 0, NumberErrbacks); }, "NumNonNegative");
        } else {
          checkNumber(tol);
        }
        return function(l, r) {
          if (arguments.length !== 2) { ae("within-pred", 2, arguments); }
          var res = equalCore(l, r, now, tol, tolMode);
          return three ? res : eqResultToBool(res, l, r);
        };
      };
    }

    //////////////////////////////////////////////////////////////////////
    // torepr / tostring

    function safeRepr(v) {
      try { return toReprJS(v, "torepr"); }
      catch(e) { return "<value>"; }
    }

    // Identical escaping to the stock runtime's replaceUnprintableStringChars
    // (load-bearing: js-ast.arr serializes string literals via torepr, so the
    // self-compiled compiler's output bytes depend on this)
    function quoteString(s) {
      var ret = ['"'], i;
      for (i = 0; i < s.length; i++) {
        var val = s.charCodeAt(i);
        switch(val) {
        case 9: ret.push('\\t'); break;
        case 10: ret.push('\\n'); break;
        case 13: ret.push('\\r'); break;
        case 34: ret.push('\\"'); break;
        case 92: ret.push('\\\\'); break;
        default:
          if (val >= 32 && val <= 126) {
            ret.push( s.charAt(i) );
          }
          else {
            var numStr = val.toString(16).toUpperCase();
            while (numStr.length < 4) {
              numStr = '0' + numStr;
            }
            ret.push('\\u' + numStr);
          }
          break;
        }
      }
      ret.push('"');
      return ret.join('');
    }

    function toReprJS(val, method) {
      // method: "torepr" or "tostring" ("tostring" leaves top-level strings raw)
      var seen = [];
      var cyclicCounters = { object: 1, ref: 1, array: 1 };
      function findSeen(v) {
        for (var i = 0; i < seen.length; i++) {
          if (seen[i].v === v) { return seen[i]; }
        }
        return null;
      }
      function enter(v, type) {
        var entry = findSeen(v);
        if (entry !== null) {
          if (entry.name === null) {
            entry.name = "<cyclic-" + entry.type + "-" + (cyclicCounters[entry.type]++) + ">";
          }
          return entry;
        }
        seen.push({ v: v, name: null, type: type });
        return null;
      }
      function help(v, depth, mode) {
        if (typeof v === "string") {
          return (mode === "tostring" && depth === 0) ? v : quoteString(v);
        }
        if (typeof v === "boolean") { return String(v); }
        if (isNumber(v)) { return numToString(v); }
        if (v === NOTHING) { return "nothing"; }
        if (v === undefined) { return "undefined"; }
        if (v === null) { return "null"; }
        if (typeof v === "function") {
          return v.$m === true ? "<method>" : "<function>";
        }
        if (v instanceof Opaque) { return "<internal value>"; }
        if (isRef(v)) {
          // bare refs render as ref(contents)
          if (v.graphable === true && v.v === undefined) { return "<uninitialized-ref>"; }
          var rhit = enter(v, "ref");
          if (rhit !== null) { return rhit.name; }
          try { return "ref(" + help(v.v, depth + 1, mode) + ")"; }
          finally { seen.pop(); }
        }
        var type = Array.isArray(v) ? "array" : "object";
        var hit = enter(v, type);
        if (hit !== null) { return hit.name; }
        try {
          if (isPTuple(v)) {
            var tparts = [];
            for (var i = 0; i < v.length; i++) { tparts.push(help(v[i], depth + 1, mode)); }
            return "{ " + tparts.join("; ") + " }";
          }
          if (Array.isArray(v)) {
            var aparts = [];
            for (var j = 0; j < v.length; j++) { aparts.push(help(v[j], depth + 1, mode)); }
            return "[raw-array: " + aparts.join(", ") + "]";
          }
          var outputMeth = v["_output"];
          if (outputMeth !== undefined && typeof outputMeth === "function" && outputMeth.$m === true) {
            var skel = outputMeth.call(v);
            return renderSkeleton(skel, depth, mode);
          }
          if (isDataValue(v)) {
            var fields = v.$fields;
            if (fields === undefined || fields.length === 0) {
              if (fields === undefined) { return v.$name; }
              return v.$name + "()";
            }
            var dparts = [];
            for (var k = 0; k < fields.length; k++) {
              var fv = v[fields[k]];
              if (v.$muts[k]) {
                // mutable data fields render dereferenced (no ref(...)
                // wrapper) but still participate in ref cycle detection
                var mhit = enter(fv, "ref");
                if (mhit !== null) { dparts.push(mhit.name); continue; }
                try { dparts.push(help(fv.v, depth + 1, mode)); }
                finally { seen.pop(); }
              } else {
                dparts.push(help(fv, depth + 1, mode));
              }
            }
            return v.$name + "(" + dparts.join(", ") + ")";
          }
          // Plain object
          var keys = Object.keys(v);
          var oparts = [];
          for (var m = 0; m < keys.length; m++) {
            if (keys[m].charAt(0) === "$") { continue; }
            oparts.push(keys[m] + ": " + help(v[keys[m]], depth + 1, mode));
          }
          return "{" + oparts.join(", ") + "}";
        } finally {
          seen.pop();
        }
      }
      function renderSkeleton(sk, depth, mode) {
        // Items/args of skeleton nodes are themselves ValueSkeletons
        switch (sk.$name) {
          case "vs-str": return sk[sk.$fields[0]];
          // depth is preserved: a top-level value's _output -> vs-value(str)
          // still renders the string raw under tostring
          case "vs-value": return help(sk[sk.$fields[0]], depth, mode);
          case "vs-collection": {
            var name = sk[sk.$fields[0]];
            var items = listToArray(sk[sk.$fields[1]]);
            var parts = [];
            for (var i = 0; i < items.length; i++) { parts.push(renderSkeleton(items[i], depth + 1, mode)); }
            return "[" + name + ": " + parts.join(", ") + "]";
          }
          case "vs-constr": {
            var cname = sk[sk.$fields[0]];
            var argsl = listToArray(sk[sk.$fields[1]]);
            var cparts = [];
            for (var ci = 0; ci < argsl.length; ci++) { cparts.push(renderSkeleton(argsl[ci], depth + 1, mode)); }
            return cname + "(" + cparts.join(", ") + ")";
          }
          case "vs-seq": {
            var sitems = listToArray(sk[sk.$fields[0]]);
            var sparts = [];
            for (var si = 0; si < sitems.length; si++) {
              sparts.push(renderSkeleton(sitems[si], depth + 1, mode));
            }
            return sparts.join("");
          }
          case "vs-table": {
            return "<table>";
          }
          case "vs-row": {
            return "<row>";
          }
          case "vs-matrix": {
            return "<matrix>";
          }
          default:
            return help(sk, depth + 1, mode);
        }
      }
      return help(val, 0, method);
    }

    function torepr(v) {
      if (arguments.length !== 1) { ae("torepr", 1, arguments); }
      return toReprJS(v, "torepr");
    }
    function tostring(v) {
      if (arguments.length !== 1) { ae("tostring", 1, arguments); }
      return toReprJS(v, "tostring");
    }

    //////////////////////////////////////////////////////////////////////
    // Lists interop

    function listToArray(l) {
      var arr = [];
      var cur = l;
      while (true) {
        if (cur.$name === "empty") { return arr; }
        if (cur === null || cur === undefined || cur.$name !== "link") { typeMismatch(l, "List"); }
        arr.push(cur.first);
        cur = cur.rest;
      }
    }
    function arrayToList(arr) {
      var empty = lazyModVal("builtin://lists", "empty");
      var link = lazyModVal("builtin://lists", "link");
      var res = empty;
      for (var i = arr.length - 1; i >= 0; i--) {
        res = link(arr[i], res);
      }
      return res;
    }

    //////////////////////////////////////////////////////////////////////
    // Printing

    function displayToString(v) {
      return typeof v === "string" ? v : toReprJS(v, "tostring");
    }
    function print(v) {
      if (arguments.length !== 1) { ae("print", 1, arguments); }
      stdout(displayToString(v));
      return v;
    }
    function display(v) {
      if (arguments.length !== 1) { ae("display", 1, arguments); }
      stdout(displayToString(v));
      return v;
    }
    function printError(v) {
      if (arguments.length !== 1) { ae("print-error", 1, arguments); }
      stderr(displayToString(v));
      return v;
    }
    function displayError(v) {
      if (arguments.length !== 1) { ae("display-error", 1, arguments); }
      stderr(displayToString(v));
      return v;
    }

    //////////////////////////////////////////////////////////////////////
    // run-task & exceptions to user code

    function execThunk(thunk) {
      if (arguments.length !== 1) { ae("run-task", 1, arguments); }
      try {
        var v = thunk();
        return lazyModVal("builtin://either", "left")(v);
      } catch(e) {
        if (e instanceof PyretException) {
          return lazyModVal("builtin://either", "right")(makeOpaque(e));
        }
        var pe = new PyretException("Error: " + String(e && e.message ? e.message : e));
        pe.$isInternal = true;
        return lazyModVal("builtin://either", "right")(makeOpaque(pe));
      }
    }
    function exnUnwrap(v) {
      if (arguments.length !== 1) { ae("exn-unwrap", 1, arguments); }
      if (v instanceof Opaque && v.val instanceof PyretException) { return v.val.val; }
      if (v instanceof PyretException) { return v.val; }
      return v;
    }

    //////////////////////////////////////////////////////////////////////
    // Binary operators (globals _plus etc.)

    function hasMeth(v, name) {
      return isObject(v) && typeof v[name] === "function" && v[name].$m === true;
    }
    function binopErr(l, r, opname, opdesc, methodname, numString) {
      var t = realFfi(numString ? "throwNumStringBinopError" : "throwNumericBinopError");
      if (t) { t(l, r, opname, opdesc, methodname); }
      interr("invalid operands " + safeRepr(l) + ", " + safeRepr(r) + " for " + opname);
    }
    function numBinop(l, r, f, opname, opdesc, methodname) {
      if (isNumber(l) && isNumber(r)) { return f(l, r, NumberErrbacks); }
      if (hasMeth(l, methodname)) { return l[methodname](r); }
      binopErr(l, r, opname, opdesc, methodname, false);
    }
    function _plus(l, r) {
      if (arguments.length !== 2) { ae("_plus", 2, arguments); }
      if (typeof l === "string" && typeof r === "string") { return l + r; }
      if (isNumber(l) && isNumber(r)) { return jsnums.add(l, r, NumberErrbacks); }
      if (hasMeth(l, "_plus")) { return l["_plus"](r); }
      binopErr(l, r, "+", "Plus", "_plus", true);
    }
    function _minus(l, r) {
      if (arguments.length !== 2) { ae("_minus", 2, arguments); }
      return numBinop(l, r, jsnums.subtract, "-", "Minus", "_minus");
    }
    function _times(l, r) {
      if (arguments.length !== 2) { ae("_times", 2, arguments); }
      return numBinop(l, r, jsnums.multiply, "*", "Times", "_times");
    }
    function _divide(l, r) {
      if (arguments.length !== 2) { ae("_divide", 2, arguments); }
      return numBinop(l, r, jsnums.divide, "/", "Divide", "_divide");
    }
    function cmpBinop(l, r, numF, strF, opname, opdesc, methodname) {
      if (isNumber(l) && isNumber(r)) { return numF(l, r, NumberErrbacks); }
      if (typeof l === "string" && typeof r === "string") { return strF(l, r); }
      if (hasMeth(l, methodname)) { return l[methodname](r); }
      binopErr(l, r, opname, opdesc, methodname, true);
    }
    function _lessthan(l, r) {
      if (arguments.length !== 2) { ae("_lessthan", 2, arguments); }
      return cmpBinop(l, r, jsnums.lessThan, function(a, b) { return a < b; }, "<", "Less-than", "_lessthan");
    }
    function _lessequal(l, r) {
      if (arguments.length !== 2) { ae("_lessequal", 2, arguments); }
      return cmpBinop(l, r, jsnums.lessThanOrEqual, function(a, b) { return a <= b; }, "<=", "Less-than-or-equal", "_lessequal");
    }
    function _greaterthan(l, r) {
      if (arguments.length !== 2) { ae("_greaterthan", 2, arguments); }
      return cmpBinop(l, r, jsnums.greaterThan, function(a, b) { return a > b; }, ">", "Greater-than", "_greaterthan");
    }
    function _greaterequal(l, r) {
      if (arguments.length !== 2) { ae("_greaterequal", 2, arguments); }
      return cmpBinop(l, r, jsnums.greaterThanOrEqual, function(a, b) { return a >= b; }, ">=", "Greater-than-or-equal", "_greaterequal");
    }

    //////////////////////////////////////////////////////////////////////
    // Raw arrays

    // Mirrors stock checkArrayIndex: reason order is too-large, negative,
    // non-integer
    function checkArrayIndex(methodName, arr, ix) {
      var reason;
      if (ix >= arr.length) { reason = "is too large; the array length is " + arr.length; }
      else if (ix < 0) { reason = "is a negative number."; }
      else if (!(typeof ix === "number" ? Math.floor(ix) === ix : jsnums.isInteger(ix))) { reason = "is not an integer."; }
      else { return; }
      var t = realFfi("throwInvalidArrayIndex");
      if (t) { t(methodName, arr, ix, reason); }
      interr(methodName + ": index " + ix + " " + reason);
    }
    function rawArrayGet(arr, i) {
      if (arguments.length !== 2) { ae("raw-array-get", 2, arguments); }
      checkArray(arr); checkNumber(i);
      checkArrayIndex("raw-array-get", arr, i);
      return arr[i];
    }
    function rawArraySet(arr, i, v) {
      if (arguments.length !== 3) { ae("raw-array-set", 3, arguments); }
      checkArray(arr); checkNumber(i);
      checkArrayIndex("raw-array-set", arr, i);
      arr[i] = v;
      return arr;
    }
    function checkArraySize(name, size) {
      if (!(isNumber(size) && jsnums.isInteger(size))) { typeMismatch(size, "NumInteger"); }
      if (!jsnums.isNonNegative(size)) { typeMismatch(size, "NumNonNegative"); }
      if (jsnums.greaterThan(size, 4294967295, NumberErrbacks)) {
        interr(name + ": cannot create array larger than 4294967295");
      }
    }
    function rawArrayOf(v, n) {
      if (arguments.length !== 2) { ae("raw-array-of", 2, arguments); }
      checkNumber(n);
      checkArraySize("raw-array-of", n);
      var len = jsnums.toFixnum(n, NumberErrbacks);
      var arr = new Array(len);
      for (var i = 0; i < len; i++) { arr[i] = v; }
      return arr;
    }
    function makeArrayN(n) {
      checkArraySize("array", n);
      return new Array(jsnums.toFixnum(n, NumberErrbacks));
    }
    function rawArrayLength(arr) {
      if (arguments.length !== 1) { ae("raw-array-length", 1, arguments); }
      checkArray(arr);
      return arr.length;
    }
    function rawArrayBuild(f, n) {
      if (arguments.length !== 2) { ae("raw-array-build", 2, arguments); }
      checkFunction(f); checkNumber(n);
      checkArraySize("raw-array-build", n);
      var len = jsnums.toFixnum(n, NumberErrbacks);
      var arr = new Array(len);
      for (var i = 0; i < len; i++) { arr[i] = f(i); }
      return arr;
    }
    function rawArrayBuildOpt(f, n) {
      if (arguments.length !== 2) { ae("raw-array-build-opt", 2, arguments); }
      checkFunction(f); checkNumber(n);
      checkArraySize("raw-array-build-opt", n);
      var len = jsnums.toFixnum(n, NumberErrbacks);
      var arr = [];
      for (var i = 0; i < len; i++) {
        var res = f(i);
        if (res.$name === "some") { arr.push(res.value); }
      }
      return arr;
    }
    function rawArrayConcat(a, b) {
      if (arguments.length !== 2) { ae("raw-array-concat", 2, arguments); }
      checkArray(a); checkArray(b);
      return a.concat(b);
    }
    function rawArrayDuplicate(a) {
      if (arguments.length !== 1) { ae("raw-array-duplicate", 1, arguments); }
      checkArray(a);
      return a.slice();
    }
    function rawArrayToList(a) {
      if (arguments.length !== 1) { ae("raw-array-to-list", 1, arguments); }
      checkArray(a);
      return arrayToList(a);
    }
    function rawArrayFromList(l) {
      if (arguments.length !== 1) { ae("raw-array-from-list", 1, arguments); }
      return listToArray(l);
    }
    function rawArrayMap(f, a) {
      if (arguments.length !== 2) { ae("raw-array-map", 2, arguments); }
      checkFunction(f); checkArray(a);
      var res = new Array(a.length);
      for (var i = 0; i < a.length; i++) { res[i] = f(a[i]); }
      return res;
    }
    function rawArrayMap1(f1, f, a) {
      if (arguments.length !== 3) { ae("raw-array-map1", 3, arguments); }
      checkFunction(f1); checkFunction(f); checkArray(a);
      var res = new Array(a.length);
      for (var i = 0; i < a.length; i++) { res[i] = (i === 0 ? f1 : f)(a[i]); }
      return res;
    }
    function rawArrayFilter(f, a) {
      if (arguments.length !== 2) { ae("raw-array-filter", 2, arguments); }
      checkFunction(f); checkArray(a);
      var res = [];
      for (var i = 0; i < a.length; i++) {
        var keep = f(a[i]);
        if (keep !== true && keep !== false) {
          var t = realFfi("throwNonBooleanCondition");
          if (t) { t(["raw-array-filter"], "Boolean", keep); }
          interr("expected a Boolean from the filter function, got " + safeRepr(keep));
        }
        if (keep === true) { res.push(a[i]); }
      }
      return res;
    }
    function rawArrayFold(f, init, a, start) {
      if (arguments.length !== 4) { ae("raw-array-fold", 4, arguments); }
      // `start` is an OFFSET added to the reported index; the whole array is
      // always folded (stock semantics)
      var acc = init;
      var st = jsnums.toFixnum(start, NumberErrbacks);
      for (var i = 0; i < a.length; i++) { acc = f(acc, a[i], i + st); }
      return acc;
    }
    function rawArrayAndMapi(f, a, start) {
      if (arguments.length !== 3) { ae("raw-array-and-mapi", 3, arguments); }
      for (var i = jsnums.toFixnum(start, NumberErrbacks); i < a.length; i++) {
        if (f(a[i], i) === false) { return false; }
      }
      return true;
    }
    function rawArrayOrMapi(f, a, start) {
      if (arguments.length !== 3) { ae("raw-array-or-mapi", 3, arguments); }
      for (var i = jsnums.toFixnum(start, NumberErrbacks); i < a.length; i++) {
        if (f(a[i], i) === true) { return true; }
      }
      return false;
    }
    function rawArrayJoinStr(a, sep) {
      var parts = [];
      for (var i = 0; i < a.length; i++) { parts.push(checkString(a[i])); }
      return parts.join(sep);
    }
    function numSortComp(asc) {
      return asc === true ?
        function(a, b) { return jsnums.lessThan(a, b, NumberErrbacks) ? -1 : (jsnums.roughlyEquals(a, b, 0, NumberErrbacks) ? 0 : 1); } :
        function(a, b) { return jsnums.greaterThan(a, b, NumberErrbacks) ? -1 : (jsnums.roughlyEquals(a, b, 0, NumberErrbacks) ? 0 : 1); };
    }
    function rawArraySortNums(arr, asc) {
      checkArray(arr); checkBoolean(asc);
      arr.sort(numSortComp(asc));
      return arr;
    }
    function rawArraySortBy(arr, key, asc) {
      checkArray(arr); checkFunction(key); checkBoolean(asc);
      var keys = rawArrayMap(key, arr);
      var mapped = arr.map(function(v, i) { return { v: v, k: keys[i] }; });
      var comp = numSortComp(asc);
      mapped.sort(function(a, b) { return comp(a.k, b.k); });
      return mapped.map(function(p) { return p.v; });
    }
    function rawEachLoop(f, start, stop) {
      var st = jsnums.toFixnum(start, NumberErrbacks);
      var sp = jsnums.toFixnum(stop, NumberErrbacks);
      for (var i = st; i < sp; i++) { f(i); }
      return NOTHING;
    }
    function rawListMap(f, l) {
      var arr = listToArray(l);
      var res = new Array(arr.length);
      for (var i = 0; i < arr.length; i++) { res[i] = f(arr[i]); }
      return arrayToList(res);
    }
    function rawListFilter(f, l) {
      var arr = listToArray(l);
      var res = [];
      for (var i = 0; i < arr.length; i++) { if (f(arr[i]) === true) { res.push(arr[i]); } }
      return arrayToList(res);
    }
    function rawListFold(f, init, l) {
      var cur = l;
      var acc = init;
      while (cur.$name === "link") {
        acc = f(acc, cur.first);
        cur = cur.rest;
      }
      return acc;
    }

    //////////////////////////////////////////////////////////////////////
    // Strings

    function stringToNumber(s) {
      if (arguments.length !== 1) { ae("string-to-number", 1, arguments); }
      checkString(s);
      var res = jsnums.fromString(s, NumberErrbacks);
      if (res === false || res === undefined) {
        return lazyModVal("builtin://option", "none");
      }
      return lazyModVal("builtin://option", "some")(res);
    }
    function stringToNumberOrNothing(s) {
      if (arguments.length !== 1) { ae("string-tonumber", 1, arguments); }
      checkString(s);
      var res = jsnums.fromString(s, NumberErrbacks);
      if (res === false || res === undefined) { return NOTHING; }
      return res;
    }
    function stringExplode(s) {
      if (arguments.length !== 1) { ae("string-explode", 1, arguments); }
      checkString(s);
      // per UTF-16 code unit, matching stock s.split("")
      return arrayToList(s.split(""));
    }
    function stringToCodePoint(s) {
      if (arguments.length !== 1) { ae("string-to-code-point", 1, arguments); }
      checkString(s);
      if (s.length !== 1) {
        interr("Expected a string of length exactly one, got " + s);
      }
      return s.charCodeAt(0);
    }
    function stringFromCodePoint(c) {
      if (arguments.length !== 1) { ae("string-from-code-point", 1, arguments); }
      if (!(isNumber(c) && jsnums.isInteger(c) && jsnums.greaterThanOrEqual(c, 0, NumberErrbacks))) {
        typeMismatch(c, "Natural Number");
      }
      var cc = jsnums.toFixnum(c, NumberErrbacks);
      if (cc > 65535) { interr("Invalid code point: " + cc); }
      try {
        var res = String.fromCodePoint(cc);
        if (typeof res !== "string") { interr("Invalid code point: " + cc); }
        return res;
      } catch(e) {
        interr("Invalid code point: " + cc);
      }
    }
    function stringToCodePoints(s) {
      if (arguments.length !== 1) { ae("string-to-code-points", 1, arguments); }
      checkString(s);
      var arr = [];
      // per code unit (stock calls string_to_code_point on each unit)
      for (var i = 0; i < s.length; i++) { arr.push(s.charCodeAt(i)); }
      return arrayToList(arr);
    }

    var gensymCounter = Math.floor(Math.random() * 1000);
    function gensym(base) {
      checkString(base);
      return base + String(gensymCounter++);
    }

    var rng = seedrandom("ahoy, world!");
    function numRandom(max) {
      if (arguments.length !== 1) { ae("num-random", 1, arguments); }
      checkNumber(max);
      return Math.floor(jsnums.toFixnum(max, NumberErrbacks) * rng());
    }

    //////////////////////////////////////////////////////////////////////
    // Spies

    function spy(message, locArr, exprLocs, names, vals) {
      var loc = "";
      try { loc = locArr[0] + ":" + locArr[1] + ":" + locArr[2]; } catch(e) {}
      var msg = message !== NOTHING ? displayToString(message) + " " : "";
      stderr("Spying " + msg + "(at " + loc + ")\n");
      for (var i = 0; i < names.length; i++) {
        stderr("  " + names[i] + ": " + toReprJS(vals[i], "torepr") + "\n");
      }
      return NOTHING;
    }

    //////////////////////////////////////////////////////////////////////
    // Stack-management shims

    function safeCall(fun, after, name) {
      return after(fun());
    }
    function pauseStack(fn) {
      var resumed = false;
      var result;
      var errored = false;
      var errval;
      fn({
        resume: function(v) { resumed = true; result = v; },
        error: function(e) { errored = true; errval = e; },
        "break": function() { interr("break during direct-mode pause"); }
      });
      if (errored) {
        if (errval instanceof PyretException) { throw errval; }
        interr("error during direct-mode pause: " + String(errval));
      }
      if (!resumed) {
        interr("this operation requires capturing the stack, which direct mode does not support");
      }
      return result;
    }
    function runThunk(f, then) {
      try {
        var v = f();
        then({ result: v, "$isSuccess": true });
      } catch(e) {
        then({ exn: e, "$isSuccess": false });
      }
    }
    function isSuccessResult(r) { return r && r.$isSuccess === true; }
    function isFailureResult(r) { return r && r.$isSuccess === false; }

    //////////////////////////////////////////////////////////////////////
    // Stock-runtime API shim (for unmodified builtin JS trove modules)

    function makeObject(dict) {
      var res = Object.create(null);
      var keys = Object.keys(dict);
      for (var i = 0; i < keys.length; i++) { res[keys[i]] = dict[keys[i]]; }
      return res;
    }
    function makeFunction(f, name) {
      if (name !== undefined) { f.$name = name; }
      return f;
    }
    function makeMethodFromFull(full, name) {
      var m = function() {
        var args = new Array(arguments.length + 1);
        args[0] = this;
        for (var i = 0; i < arguments.length; i++) { args[i + 1] = arguments[i]; }
        return full.apply(null, args);
      };
      return mkM(m, name);
    }
    function makeString(s) { return s; }
    function makeNumber(n) { return n; }
    function makeNumberBig(n) { return n; }
    function makeNumberFromString(s) {
      var res = jsnums.fromString(s, NumberErrbacks);
      if (res === false || res === undefined) { interr("bad number literal " + s); }
      return res;
    }
    function makeBoolean(b) { return b; }
    function makeTuple(arr) { return tup(arr); }
    function checkArity(n, args, name, isMethod) {
      var len = args.length;
      if (n !== len) {
        ae(typeof name === "string" ? name : "the function", n, len);
      }
    }
    function checkArityC(loc, n, args, isMethod) {
      if (n !== args.length) { ae("the function at " + String(loc), n, args.length); }
    }
    function makeCheckType(test, name) {
      return function(v) {
        if (!test(v)) { interr("expected " + name + ", got " + safeRepr(v)); }
        return true;
      };
    }
    function confirm(v, test) {
      if (!test(v)) { interr("bad value " + safeRepr(v)); }
      return v;
    }
    function makeMessageException(str) {
      return new PyretException("Error: " + str);
    }
    function throwMessageException(str) {
      throw makeMessageException(str);
    }

    var ffi = {
      $isDirectStub: true,
      throwMessageException: throwMessageException,
      makeMessageException: makeMessageException,
      checkArity: checkArity,
      toArray: listToArray,
      makeList: arrayToList,
      makeNone: function() { return lazyModVal("builtin://option", "none"); },
      makeSome: function(v) { return lazyModVal("builtin://option", "some")(v); },
      isNone: function(v) { return isDataValue(v) && v.$name === "none"; },
      isSome: function(v) { return isDataValue(v) && v.$name === "some"; },
      makeLeft: function(v) { return lazyModVal("builtin://either", "left")(v); },
      makeRight: function(v) { return lazyModVal("builtin://either", "right")(v); },
      isLeft: function(v) { return isDataValue(v) && v.$name === "left"; },
      isRight: function(v) { return isDataValue(v) && v.$name === "right"; },
      cases: function(pred, predName, val, visitor) {
        if (!pred(val)) { interr("expected " + predName + ", got " + safeRepr(val)); }
        return vMatch.call(val, visitor, function() {
          interr("no branch for " + val.$name + " in cases over " + predName);
        });
      },
      isEqualityResult: function(v) {
        return isDataValue(v) && (v.$name === "Equal" || v.$name === "NotEqual" || v.$name === "Unknown");
      },
      isUserBreak: function() { return false; },
      isList: function(v) { return isDataValue(v) && (v.$name === "link" || v.$name === "empty"); },
      throwParseErrorNextToken: function(loc, tok) { ffiError("parse-error-next-token", loc, tok); },
      throwParseErrorEOF: function(loc) { ffiError("parse-error-eof", loc); },
      throwParseErrorUnterminatedString: function(loc) { ffiError("parse-error-unterminated-string", loc); },
      throwParseErrorBadNumber: function(loc) { ffiError("parse-error-bad-number", loc); },
      throwParseErrorBadOper: function(loc) { ffiError("parse-error-bad-operator", loc); },
      throwParseErrorBadCheckOper: function(loc) { ffiError("parse-error-bad-check-operator", loc); },
      throwParseErrorColonColon: function(loc, str) { ffiError("parse-error-colon-colon", loc, str); },
      throwMessageExceptionLoc: function(loc, msg) { throwMessageException(msg); },
      throwInternalError: function(msg, args) { interr(msg + " " + String(args)); },
      throwFieldNotFound: function(loc, obj, field) { fieldNotFound(obj, field); },
      throwNumStringBinopError: function(l, r, op, opname, methname) {
        interr("invalid operands for " + opname + ": " + safeRepr(l) + ", " + safeRepr(r));
      },
      throwUninitializedIdMkLoc: function(loc, name) { uninit(name); },
      makePyretPos: function(fileName, p) {
        var srcloc = lazyModVal("builtin://srcloc", "srcloc");
        return srcloc(fileName, p.startRow, p.startCol, p.startChar, p.endRow, p.endCol, p.endChar);
      },
      combinePyretPos: function(fileName, p1, p2) {
        var srcloc = lazyModVal("builtin://srcloc", "srcloc");
        return srcloc(fileName, p1.startRow, p1.startCol, p1.startChar, p2.endRow, p2.endCol, p2.endChar);
      },
      unwrap: exnUnwrap
    };

    //////////////////////////////////////////////////////////////////////
    // Prims called from generated code (a-prim-app names)

    function checkWrapBoolean(v) {
      if (v === true || v === false) { return v; }
      interr("expected a Boolean for a condition, got " + safeRepr(v));
    }
    function checkWrapTable(v) { return v; }
    function throwNoBranchesMatched(loc, typ) {
      interr("no branches matched in " + typ + " expression");
    }
    function throwNonBooleanCondition(loc, typ, val) {
      interr("expected a Boolean for " + typ + ", got " + safeRepr(val));
    }
    function throwNonBooleanOp(loc, position, typ, val) {
      interr("expected a Boolean for " + position + " of " + typ + ", got " + safeRepr(val));
    }
    function throwUnfinishedTemplate(loc) {
      interr("unfinished template expression");
    }
    function makeReactor(init, fields) {
      interr("reactors are not supported in direct mode");
    }
    function makeTable(headers, rows) {
      interr("tables are not yet supported in direct mode");
    }
    function makeMatch(name, arity) {
      // Not used by direct codegen (vMatch is), but kept for API compat
      return vMatch;
    }
    function getMaker(constructorObj, name, l1, l2) {
      // [list: ...] style construction: fetch the maker field (e.g. "make2")
      return g(constructorObj, name);
    }
    function getLazyMaker(constructorObj, name, l1, l2) {
      return getMaker(constructorObj, name, l1, l2);
    }
    function makeSome(v) { return lazyModVal("builtin://option", "some")(v); }
    function makeNone() { return lazyModVal("builtin://option", "none"); }
    function traceValue(loc, v) { return v; }

    //////////////////////////////////////////////////////////////////////
    // The global module

    function notPyret(b) {
      if (arguments.length !== 1) { ae("not", 1, arguments); }
      checkBoolean(b);
      return !b;
    }

    function numUnop(f, name) {
      return function(n) {
        if (arguments.length !== 1) { ae(name, 1, arguments); }
        checkNumber(n);
        return f(n, NumberErrbacks);
      };
    }
    function numBinop2(f, name) {
      return function(a, b) {
        if (arguments.length !== 2) { ae(name, 2, arguments); }
        checkNumber(a); checkNumber(b);
        return f(a, b, NumberErrbacks);
      };
    }

    function strUnop(f, name) {
      return function(s) {
        if (arguments.length !== 1) { ae(name, 1, arguments); }
        checkString(s);
        return f(s);
      };
    }

    function numDigits(base, name) {
      return function(n, digits) {
        if (arguments.length !== 2) { ae(name, 2, arguments); }
        checkNumber(n);
        checkNumAnn(digits, function(v) { return jsnums.isInteger(v); }, "NumInteger");
        var tenX = jsnums.expt(10, digits, NumberErrbacks);
        return jsnums.divide(base(jsnums.multiply(n, tenX, NumberErrbacks), NumberErrbacks), tenX, NumberErrbacks);
      };
    }
    function numPlace(base, name) {
      return function(n, place) {
        if (arguments.length !== 2) { ae(name, 2, arguments); }
        checkNumber(n);
        checkNumAnn(place, function(v) { return jsnums.isInteger(v); }, "NumInteger");
        var tenX = jsnums.expt(10, place, NumberErrbacks);
        return jsnums.multiply(base(jsnums.divide(n, tenX, NumberErrbacks), NumberErrbacks), tenX, NumberErrbacks);
      };
    }

    var timeNow = (typeof performance !== "undefined" && performance.now) ?
      function() { return performance.now(); } :
      function() { return Date.now(); };

    // A checker that discards all tests; the default until the real checker
    // module's check context is installed (mirrors the stock nullChecker).
    var nullChecker = makeObject({
      "run-checks": function(moduleName, checks) { return NOTHING; },
      "check-is": function(left, right, loc) { return NOTHING; },
      "check-is-roughly": function(left, right, loc) { return NOTHING; },
      "check-satisfies": function(left, pred, loc) { return NOTHING; },
      "results": function() { return NOTHING; }
    });

    var globalValues = {
      "print": print,
      "display": display,
      "test-print": print,
      "print-error": printError,
      "display-error": displayError,
      "raise": function(v) {
        if (arguments.length !== 1) { ae("raise", 1, arguments); }
        raise(v);
      },
      "run-task": execThunk,
      "brander": brander,
      "nothing": NOTHING,
      "torepr": torepr,
      "to-repr": torepr,
      "tostring": tostring,
      "to-string": tostring,
      "not": notPyret,

      "is-boolean": function(v) { return isBoolean(v); },
      "is-function": function(v) { return isFunction(v); },
      "is-nothing": function(v) { return v === NOTHING; },
      "is-number": function(v) { return isNumber(v); },
      "is-object": function(v) { return isObject(v); },
      "is-raw-array": function(v) { return isRawArray(v); },
      "is-string": function(v) { return typeof v === "string"; },
      "is-table": function(v) { return false; },
      "is-row": function(v) { return false; },
      "is-tuple": function(v) { return isPTuple(v); },
      "isBoolean": function(v) { return isBoolean(v); },

      "builtins": makeObject({
        "trace-value": function(loc, v) { return v; },
        "has-field": function(obj, f) {
          checkString(f);
          return isObject(obj) && (f in obj);
        },
        "get-value": function(obj, key) {
          return g(obj, "get-value")(key);
        },
        "raw-list-join-str-last": function(lst, sep, lastSep) {
          if (arguments.length !== 3) { ae("raw-list-join-str-last", 3, arguments); }
          var arr = listToArray(lst).map(function(v) { return toReprJS(v, "tostring"); });
          if (arr.length <= 1) { return arr.join(sep); }
          var lastElem = arr.pop();
          return arr.join(sep) + lastSep + lastElem;
        },
        "record-concat": function(left, right) {
          if (!isObject(left) || !isObject(right)) {
            interr("(Internal merge) Tried to extend a non-object");
          }
          return ext(left, right);
        },
        "open-table": function(spec) { interr("tables are not supported in direct mode"); },
        "as-loader-option": function() { interr("loader options are not supported in direct mode"); },
        "raw-make-row": function(arr) { interr("tables are not supported in direct mode"); },
        "___debug": function() { return NOTHING; },
        "within-rel3": withinFam(false, "rel", true),
        "within3": withinFam(false, "smooth", true),
        "raw-array-to-list": rawArrayToList,
        "raw-array-from-list": rawArrayFromList,
        "raw-array-join-str": function(a) { return rawArrayJoinStr(a, ""); },
        "raw-array-sort-nums": rawArraySortNums,
        "raw-array-sort-by": rawArraySortBy,
        "raw-list-map": rawListMap,
        "raw-list-filter": rawListFilter,
        "raw-list-fold": rawListFold,
        "spy": spy,
        "current-checker": function() {
          return params["current-checker"] !== undefined ? params["current-checker"] : nullChecker;
        }
      }),

      "raw-each-loop": rawEachLoop,
      "raw-array-get": rawArrayGet,
      "raw-array-set": rawArraySet,
      "raw-array-of": rawArrayOf,
      "raw-array-build": rawArrayBuild,
      "raw-array-build-opt": rawArrayBuildOpt,
      "raw-array-length": rawArrayLength,
      "raw-array-join-str": rawArrayJoinStr,
      "raw-array-to-list": rawArrayToList,
      "raw-array-from-list": rawArrayFromList,
      "raw-array-filter": rawArrayFilter,
      "raw-array-and-mapi": rawArrayAndMapi,
      "raw-array-or-mapi": rawArrayOrMapi,
      "raw-array-map": rawArrayMap,
      "raw-array-map-1": rawArrayMap1,
      "raw-array-fold": rawArrayFold,
      "raw-array-duplicate": rawArrayDuplicate,
      "raw-array-concat": rawArrayConcat,
      "raw-array-sort-nums": rawArraySortNums,
      "raw-array-sort-by": rawArraySortBy,
      "raw-array": makeObject({
        "make": function(arr) { return arr; },
        "make0": function() { return []; },
        "make1": function(a) { return [a]; },
        "make2": function(a, b) { return [a, b]; },
        "make3": function(a, b, c) { return [a, b, c]; },
        "make4": function(a, b, c, d) { return [a, b, c, d]; },
        "make5": function(a, b, c, d, e) { return [a, b, c, d, e]; }
      }),

      "roughly-equal-always3": roughlyEqualAlways3,
      "roughly-equal-now3": roughlyEqualNow3,
      "equal-always3": equalAlways3,
      "equal-now3": equalNow3,
      "identical3": identical3,
      "roughly-equal-always": roughlyEqualAlways,
      "roughly-equal-now": roughlyEqualNow,
      "roughly-equal": roughlyEqualAlways,
      "equal-always": equalAlways,
      "equal-now": equalNow,
      "identical": identical,
      "within": withinFam(false, "smooth", false),
      "within-abs": withinFam(false, "abs", false),
      "within-rel": withinFam(false, "rel", false),
      "within-now": withinFam(true, "smooth", false),
      "within-abs-now": withinFam(true, "abs", false, true),
      "within-rel-now": withinFam(true, "rel", false),
      "within3": withinFam(false, "smooth", true),
      "within-abs3": withinFam(false, "abs", true, true),
      "within-rel3": withinFam(false, "rel", true),
      "within-now3": withinFam(true, "smooth", true),
      "within-abs-now3": withinFam(true, "abs", true, true),
      "within-rel-now3": withinFam(true, "rel", true),

      "num-is-fixnum": function(n) { checkNumber(n); return typeof n === "number" && Math.floor(n) === n; },
      "num-is-integer": numUnop(jsnums.isInteger, "num-is-integer"),
      "num-is-rational": numUnop(jsnums.isRational, "num-is-rational"),
      "num-is-roughnum": numUnop(jsnums.isRoughnum, "num-is-roughnum"),
      "num-is-positive": numUnop(jsnums.isPositive, "num-is-positive"),
      "num-is-negative": numUnop(jsnums.isNegative, "num-is-negative"),
      "num-is-non-positive": numUnop(jsnums.isNonPositive, "num-is-non-positive"),
      "num-is-non-negative": numUnop(jsnums.isNonNegative, "num-is-non-negative"),
      "string-to-number": stringToNumber,
      "string-tonumber": stringToNumberOrNothing,

      "num-equal": function(a, b) {
        if (arguments.length !== 2) { ae("num-equal", 2, arguments); }
        checkNumber(a); checkNumber(b);
        return jsnums.equals(a, b, NumberErrbacks);
      },
      "num-max": function(a, b) {
        checkNumber(a); checkNumber(b);
        return jsnums.greaterThanOrEqual(a, b, NumberErrbacks) ? a : b;
      },
      "num-min": function(a, b) {
        checkNumber(a); checkNumber(b);
        return jsnums.lessThanOrEqual(a, b, NumberErrbacks) ? a : b;
      },
      "num-within": function(tol) { return withinFam(false, "smooth", false)(tol); },
      "num-within-abs": function(tol) { return withinFam(false, "abs", false)(tol); },
      "num-within-rel": function(tol) { return withinFam(false, "rel", false)(tol); },

      "num-abs": numUnop(jsnums.abs, "num-abs"),
      "num-acos": numUnop(jsnums.acos, "num-acos"),
      "num-asin": numUnop(jsnums.asin, "num-asin"),
      "num-atan": numUnop(jsnums.atan, "num-atan"),
      "num-atan2": numBinop2(jsnums.atan2, "num-atan2"),
      "num-cos": numUnop(jsnums.cos, "num-cos"),
      "num-sin": numUnop(jsnums.sin, "num-sin"),
      "num-tan": numUnop(jsnums.tan, "num-tan"),
      "num-modulo": function(n, mod) {
        if (arguments.length !== 2) { ae("num-modulo", 2, arguments); }
        checkNumAnn(n, function(v) { return jsnums.isInteger(v); }, "NumInteger");
        checkNumAnn(mod, function(v) { return jsnums.isInteger(v); }, "NumInteger");
        return jsnums.modulo(n, mod, NumberErrbacks);
      },
      "num-remainder": numBinop2(jsnums.remainder, "num-remainder"),
      "num-exact": numUnop(jsnums.toExact, "num-exact"),
      "num-exp": numUnop(jsnums.exp, "num-exp"),
      "num-log": function(n) {
        if (arguments.length !== 1) { ae("num-log", 1, arguments); }
        checkNumAnn(n, function(v) { return jsnums.greaterThan(v, 0, NumberErrbacks); }, "NumPositive");
        return jsnums.log(n, NumberErrbacks);
      },
      "num-truncate": numUnop(function(n, e) {
        return jsnums.isInteger(n) ? n :
          (jsnums.isNegative(n) ? jsnums.ceiling(n, e) : jsnums.floor(n, e));
      }, "num-truncate"),
      "num-floor": numUnop(jsnums.floor, "num-floor"),
      "num-ceiling": numUnop(jsnums.ceiling, "num-ceiling"),
      "num-round": numUnop(jsnums.round, "num-round"),
      "num-round-even": numUnop(jsnums.roundEven, "num-round-even"),
      "num-truncate-digits": numDigits(function(n, e) {
        return jsnums.isNegative(n) ? jsnums.ceiling(n, e) : jsnums.floor(n, e);
      }, "num-truncate-digits"),
      "num-ceiling-digits": numDigits(jsnums.ceiling, "num-ceiling-digits"),
      "num-floor-digits": numDigits(jsnums.floor, "num-floor-digits"),
      "num-round-digits": numDigits(jsnums.round, "num-round-digits"),
      "num-round-even-digits": numDigits(jsnums.roundEven, "num-round-even-digits"),
      "num-truncate-place": numPlace(function(n, e) {
        return jsnums.isNegative(n) ? jsnums.ceiling(n, e) : jsnums.floor(n, e);
      }, "num-truncate-place"),
      "num-ceiling-place": numPlace(jsnums.ceiling, "num-ceiling-place"),
      "num-floor-place": numPlace(jsnums.floor, "num-floor-place"),
      "num-round-place": numPlace(jsnums.round, "num-round-place"),
      "num-round-even-place": numPlace(jsnums.roundEven, "num-round-even-place"),
      "num-sqr": numUnop(jsnums.sqr, "num-sqr"),
      "num-sqrt": function(n) {
        if (arguments.length !== 1) { ae("num-sqrt", 1, arguments); }
        checkNumAnn(n, function(v) { return jsnums.greaterThanOrEqual(v, 0, NumberErrbacks); }, "NumNonNegative");
        return jsnums.sqrt(n, NumberErrbacks);
      },
      "num-to-fixnum": numUnop(jsnums.toFixnum, "num-to-fixnum"),
      "num-to-rational": numUnop(jsnums.toExact, "num-to-rational"),
      "num-to-roughnum": numUnop(jsnums.toRoughnum, "num-to-roughnum"),
      "num-expt": numBinop2(jsnums.expt, "num-expt"),
      "num-to-string": function(n) {
        if (arguments.length !== 1) { ae("num-to-string", 1, arguments); }
        checkNumber(n);
        return numToString(n);
      },
      "num-tostring": function(n) { checkNumber(n); return numToString(n); },
      "num-to-string-digits": function(n, digits) {
        if (arguments.length !== 2) { ae("num-to-string-digits", 2, arguments); }
        checkNumber(n);
        checkNumAnn(digits, function(v) { return jsnums.isInteger(v); }, "NumInteger");
        return jsnums.toStringDigits(n, digits, NumberErrbacks);
      },

      "num-random": numRandom,
      "num-random-seed": function(n) {
        if (arguments.length !== 1) { ae("num-random-seed", 1, arguments); }
        checkNumber(n);
        rng = seedrandom(String(n));
        return NOTHING;
      },
      "random": function(n) {
        if (arguments.length !== 1) { ae("random", 1, arguments); }
        checkNumber(n);
        return numRandom(n);
      },

      "time-now": function() {
        if (arguments.length !== 0) { ae("time-now", 0, arguments); }
        return new Date().getTime();
      },

      "gensym": gensym,
      "string-repeat": function(s, n) {
        if (arguments.length !== 2) { ae("string-repeat", 2, arguments); }
        checkString(s); checkNumber(n);
        var res = "";
        for (var i = 0; i < jsnums.toFixnum(n, NumberErrbacks); i++) { res += s; }
        return res;
      },
      "string-substring": function(s, min, max) {
        if (arguments.length !== 3) { ae("string-substring", 3, arguments); }
        checkString(s);
        checkNumAnn(min, function(v) { return jsnums.isInteger(v); }, "NumInteger");
        checkNumAnn(max, function(v) { return jsnums.isInteger(v); }, "NumInteger");
        if (jsnums.greaterThan(min, max, NumberErrbacks)) {
          interr("substring: min index " + String(min) + " is greater than max index " + String(max));
        }
        if (jsnums.lessThan(min, 0, NumberErrbacks)) {
          interr("substring: min index " + String(min) + " is less than 0");
        }
        if (jsnums.greaterThan(max, s.length, NumberErrbacks)) {
          interr("substring: max index " + String(max) + " is larger than the string length " + String(s.length));
        }
        return s.substring(jsnums.toFixnum(min, NumberErrbacks), jsnums.toFixnum(max, NumberErrbacks));
      },
      "string-to-lower": strUnop(function(s) { return s.toLowerCase(); }, "string-to-lower"),
      "string-to-upper": strUnop(function(s) { return s.toUpperCase(); }, "string-to-upper"),
      "string-tolower": strUnop(function(s) { return s.toLowerCase(); }, "string-tolower"),
      "string-toupper": strUnop(function(s) { return s.toUpperCase(); }, "string-toupper"),
      "string-append": function(a, b) {
        if (arguments.length !== 2) { ae("string-append", 2, arguments); }
        checkString(a); checkString(b);
        return a + b;
      },
      "string-char-at": function(s, n) {
        if (arguments.length !== 2) { ae("string-char-at", 2, arguments); }
        checkString(s); checkNumber(n);
        if (!jsnums.isInteger(n) || (n < 0)) {
          interr("string-char-at: expected a positive integer for the index, but got " + String(n));
        }
        if (n > (s.length - 1)) {
          interr("string-char-at: index " + String(n) + " is greater than the largest index the string " + s);
        }
        return String(s.charAt(jsnums.toFixnum(n, NumberErrbacks)));
      },
      "string-contains": function(a, b) { checkString(a); checkString(b); return a.indexOf(b) !== -1; },
      "string-starts-with": function(a, b) { checkString(a); checkString(b); return a.startsWith(b); },
      "string-ends-with": function(a, b) { checkString(a); checkString(b); return a.endsWith(b); },
      "string-equal": function(a, b) { checkString(a); checkString(b); return a === b; },
      "string-explode": stringExplode,
      "string-from-code-point": stringFromCodePoint,
      "string-from-code-points": function(l) {
        if (arguments.length !== 1) { ae("string-from-code-points", 1, arguments); }
        var arr = listToArray(l);
        var res = "";
        for (var i = 0; i < arr.length; i++) { res += stringFromCodePoint(arr[i]); }
        return res;
      },
      "string-index-of": function(s, sub) { checkString(s); checkString(sub); return s.indexOf(sub); },
      "string-find": function(s, sub) {
        if (arguments.length !== 2) { ae("string-get-index", 2, arguments); }
        checkString(s); checkString(sub);
        var ix = s.indexOf(sub);
        if (ix < 0) {
          interr('string-find: Target string "' + sub + '" was not found inside source string "' + s + '"');
        }
        return ix;
      },
      "string-find-opt": function(s, sub) {
        checkString(s); checkString(sub);
        var ix = s.indexOf(sub);
        return ix === -1 ? makeNone() : makeSome(ix);
      },
      "string-find-index": function(s, sub) {
        checkString(s); checkString(sub);
        var ix = s.indexOf(sub);
        return ix === -1 ? makeNone() : makeSome(ix);
      },
      "string-get-index": function(s, sub) {
        if (arguments.length !== 2) { ae("string-get-index", 2, arguments); }
        checkString(s); checkString(sub);
        var ix = s.indexOf(sub);
        if (ix < 0) {
          interr('string-find: Target string "' + sub + '" was not found inside source string "' + s + '"');
        }
        return ix;
      },
      "string-is-number": function(s) {
        checkString(s);
        var res = jsnums.fromString(s, NumberErrbacks);
        return !(res === false || res === undefined);
      },
      "string-isnumber": function(s) {
        checkString(s);
        var res = jsnums.fromString(s, NumberErrbacks);
        return !(res === false || res === undefined);
      },
      "string-length": function(s) {
        if (arguments.length !== 1) { ae("string-length", 1, arguments); }
        checkString(s);
        return s.length;
      },
      "string-replace": function(s, find, replace) {
        checkString(s); checkString(find); checkString(replace);
        return s.split(find).join(replace);
      },
      "string-split": function(s, on) {
        checkString(s); checkString(on);
        var ix = s.indexOf(on);
        if (ix === -1) { return arrayToList([s]); }
        return arrayToList([s.substring(0, ix), s.substring(ix + on.length)]);
      },
      "string-split-all": function(s, on) {
        checkString(s); checkString(on);
        return arrayToList(s.split(on));
      },
      "string-to-code-point": stringToCodePoint,
      "string-to-code-points": stringToCodePoints,

      "_plus": _plus,
      "_minus": _minus,
      "_times": _times,
      "_divide": _divide,
      "_lessthan": _lessthan,
      "_lessequal": _lessequal,
      "_greaterthan": _greaterthan,
      "_greaterequal": _greaterequal,

      "ref-get": refGet,
      "ref-set": refSet,
      "ref-freeze": refFreeze,
      "exn-unwrap": exnUnwrap
    };

    var globalTypes = makeObject({
      "Any": ANY, "Method": ANY, "Object": ANY, "Function": ANY,
      "NumNonNegative": ANY, "NumNonPositive": ANY, "NumNegative": ANY,
      "NumPositive": ANY, "NumRational": ANY, "NumInteger": ANY,
      "Roughnum": ANY, "Exactnum": ANY, "Boolean": ANY, "Number": ANY,
      "String": ANY, "Nothing": ANY, "RawArray": ANY, "Row": ANY, "Table": ANY
    });

    var globalModuleObject = makeObject({
      "defined-values": globalValues,
      "defined-types": globalTypes,
      "provide-plus-types": makeObject({
        "values": makeObject(globalValues),
        "types": globalTypes,
        "modules": makeObject({}),
        "internal": {}
      })
    });

    //////////////////////////////////////////////////////////////////////
    // Namespace stub (generated code stores it; js modules rarely use it)

    var namespace = {
      get: function(name) { return globalValues[name]; },
      hasBinding: function(name) { return Object.prototype.hasOwnProperty.call(globalValues, name); },
      set: function() { interr("namespace.set not supported in direct mode"); },
      merge: function() { return namespace; }
    };

    //////////////////////////////////////////////////////////////////////
    // Module linking (used by handalone-direct)

    function depToString(d) {
      if (d["import-type"] === "builtin") {
        return d["import-type"] + "(" + d.name + ")";
      } else if (d["import-type"] === "dependency") {
        return d["protocol"] + "(" + d["args"].join(", ") + ")";
      } else {
        throw new Error("Unknown dependency description: " + String(d));
      }
    }

    function JSModuleReturn(jsmod) { this.jsmod = jsmod; }
    function makeJSModuleReturn(jsmod) { return new JSModuleReturn(jsmod); }
    function isJSModReturn(v) { return v instanceof JSModuleReturn; }
    function makeModuleReturn(values, types, internal) {
      return makeObject({
        "defined-values": values,
        "defined-types": types,
        "provide-plus-types": makeObject({
          "values": makeObject(values),
          "types": types,
          "modules": makeObject({}),
          "internal": internal || {}
        })
      });
    }

    function getExported(m) {
      if (isJSModReturn(m)) { return m.jsmod; }
      return makeObject({
        "values": m["provide-plus-types"]["values"],
        "types": m["provide-plus-types"]["types"],
        "internal": m["provide-plus-types"]["internal"],
        "defined-values": m["defined-values"],
        "defined-types": m["defined-types"]
      });
    }

    function runStandalone(staticMods, realm, depMap, toLoad, postLoadHooks) {
      for (var i = 0; i < toLoad.length; i++) {
        var uri = toLoad[i];
        var mod = staticMods[uri];
        var deps = mod.requires.map(function(d) {
          var duri = depMap[uri][depToString(d)];
          if (duri === undefined) { throw new Error("Unmapped dependency " + depToString(d) + " in " + uri); }
          var dmod = realm.instantiated[duri];
          if (dmod === undefined) { throw new Error("Dependency not instantiated: " + duri); }
          return getExported(dmod);
        });
        var natives = (mod.nativeRequires || []).map(function(n) {
          return theOutsideWorld.requireNative(n);
        });
        var theMod = mod.theModule;
        if (typeof theMod === "string") {
          theMod = theOutsideWorld.evalModule(theMod);
        }
        var r = theMod.apply(null, [thisRuntime, namespace, uri].concat(deps).concat(natives));
        realm.instantiated[uri] = r;
        modules[uri] = r;
        if (postLoadHooks && postLoadHooks[uri]) { postLoadHooks[uri](r); }
      }
      return { complete: "runStandalone completed successfully" };
    }

    //////////////////////////////////////////////////////////////////////
    // Params

    function setParam(name, v) { params[name] = v; }
    function getParam(name) {
      if (!(name in params)) { throw new Error("Missing runtime parameter " + name); }
      return params[name];
    }
    function hasParam(name) { return name in params; }
    function getParamOrSetDefault(name, def) {
      if (!(name in params)) { params[name] = def; }
      return params[name];
    }

    //////////////////////////////////////////////////////////////////////
    // The runtime object

    var thisRuntime = {
      // direct-codegen API (short names)
      g: g, gc: gc, gb: gb,
      ae: ae, cerr: cerr, uninit: uninit,
      cf: cf, cr: cr,
      sr: sr,
      tup: tup,
      ext: ext, upd: upd,
      mkM: mkM,
      hb: hb,
      ref: ref,
      vMatch: vMatch,

      // prim-app names & runtime fields used by generated code
      namedBrander: namedBrander,
      makeBranderAnn: makeBranderAnn,
      makeGraphableRef: makeGraphableRef,
      makeNumberFromString: makeNumberFromString,
      getModuleField: getModuleField,
      checkWrapBoolean: checkWrapBoolean,
      checkWrapTable: checkWrapTable,
      throwNoBranchesMatched: throwNoBranchesMatched,
      throwNonBooleanCondition: throwNonBooleanCondition,
      throwNonBooleanOp: throwNonBooleanOp,
      throwUnfinishedTemplate: throwUnfinishedTemplate,
      makeReactor: makeReactor,
      makeTable: makeTable,
      makeArrayN: makeArrayN,
      makeSome: makeSome,
      makeNone: makeNone,
      getMaker: getMaker,
      getMaker0: getMaker, getMaker1: getMaker, getMaker2: getMaker,
      getMaker3: getMaker, getMaker4: getMaker, getMaker5: getMaker,
      getLazyMaker: getLazyMaker,
      traceValue: traceValue,
      not: notPyret,
      builtins: globalValues["builtins"],
      Any: ANY,
      nothing: NOTHING,
      "undefined": undefined,

      // value tests
      isNumber: isNumber, isString: isString, isBoolean: isBoolean,
      isNothing: isNothing, isFunction: isFunction, isMethod: isMethod,
      isPTuple: isPTuple, isRawArray: isRawArray, isArray: isRawArray,
      isRef: isRef, isDataValue: isDataValue, isObject: isObject,
      isPyretVal: isPyretVal, isOpaque: isOpaque,
      isPyretException: isPyretException,
      isTuple: isPTuple,

      // constructors / shim
      makeObject: makeObject,
      makeFunction: makeFunction,
      makeMethod: makeMethodFromFull,
      makeMethod0: makeMethodFromFull, makeMethod1: makeMethodFromFull,
      makeMethod2: makeMethodFromFull, makeMethod3: makeMethodFromFull,
      makeMethod4: makeMethodFromFull, makeMethod5: makeMethodFromFull,
      makeMethod6: makeMethodFromFull, makeMethod7: makeMethodFromFull,
      makeMethod8: makeMethodFromFull,
      makeMethodN: makeMethodFromFull,
      makeMethodFromFull: makeMethodFromFull,
      makeString: makeString,
      makeNumber: makeNumber,
      makeNumberBig: makeNumberBig,
      makeBoolean: makeBoolean,
      makeTuple: makeTuple,
      makeOpaque: makeOpaque,
      makeSrcloc: makeSrcloc,
      makeModuleReturn: makeModuleReturn,
      makeJSModuleReturn: makeJSModuleReturn,
      makeMatch: makeMatch,

      // field access, stock names
      getField: g,
      getFieldLoc: function(obj, field, loc) { return g(obj, field); },
      getFields: function(obj) { return Object.keys(obj).filter(function(k) { return k.charAt(0) !== "$"; }); },
      getColonField: gc,
      getColonFieldLoc: function(obj, field, loc) { return gc(obj, field); },
      getBracket: function(loc, obj, field) { return g(obj, checkString(field)); },
      getDotAnn: function(loc, name, obj, field) { return ANY; },
      getTuple: getTuple,
      extendObj: function(loc, obj, fields) { return ext(obj, fields); },
      hasField: function(obj, field) { return isObject(obj) && (field in obj); },
      hasBrand: function(v, brand) { return hb(v, brand); },

      // errors and checks
      ffi: ffi,
      raise: raise,
      checkArity: checkArity,
      checkArityC: checkArityC,
      checkNumber: checkNumber,
      checkString: checkString,
      checkBoolean: checkBoolean,
      checkFunction: checkFunction,
      checkMethod: checkMethod,
      checkArray: checkArray,
      checkTuple: checkTuple,
      checkNothing: checkNothing,
      checkObject: checkObject,
      checkPyretVal: checkPyretVal,
      makeCheckType: makeCheckType,
      confirm: confirm,
      "throwMessageException": throwMessageException,

      // equality
      equal_always: equalAlways,
      equal_always3: equalAlways3,
      equal_now: equalNow,
      equal_now3: equalNow3,
      identical: identical,
      identical3: identical3,
      eqEqual: eqEqual,
      combineEquality: function(a, b) {
        if (a.$name === "Equal") { return b; }
        return a;
      },

      // repr
      toReprJS: toReprJS,
      torepr: torepr,
      tostring: tostring,
      safeRepr: safeRepr,

      // numbers (for js modules)
      jsnums: jsnums,
      NumberErrbacks: NumberErrbacks,
      num_to_string: numToString,
      plus: _plus, minus: _minus, times: _times, divide: _divide,

      // stack shims
      safeCall: safeCall,
      safeThen: function(fun, name) {
        // minimal chainable shim
        var val = fun();
        return {
          then: function(f) { return thisRuntime.safeThen(function() { return f(val); }); },
          start: function(cb) { cb({ result: val, "$isSuccess": true }); }
        };
      },
      pauseStack: pauseStack,
      "await": function(p) {
        if (p !== null && typeof p === "object" && p.$syncThen === true) {
          if (p.isError) {
            if (p.value instanceof PyretException) { throw p.value; }
            interr("error in filesystem operation: " + String(p.value && p.value.message || p.value));
          }
          return p.value;
        }
        if (p !== null && typeof p === "object" && typeof p.then === "function") {
          interr("await on an asynchronous value requires capturing the stack, which direct mode does not support");
        }
        return p;
      },
      runThunk: runThunk,
      run: function(program, namespace_, options, onDone) {
        runThunk(function() { return program(thisRuntime, namespace_); }, onDone);
      },
      execThunk: execThunk,
      isSuccessResult: isSuccessResult,
      isFailureResult: isFailureResult,
      breakAll: function() { interr("breakAll is not supported in direct mode"); },

      // modules
      modules: modules,
      getExported: getExported,
      runStandalone: runStandalone,
      depToString: depToString,
      globalModuleObject: globalModuleObject,
      namespace: namespace,

      // params
      setParam: setParam,
      getParam: getParam,
      hasParam: hasParam,
      getParamOrSetDefault: getParamOrSetDefault,

      // Compiled-code annotation checks (.arr annotations) are skipped in
      // direct mode, but the EXPLICIT argument contracts that builtin js
      // modules request via checkArgsInternalN are enforced.
      "_checkAnn": function() { return true; },
      checkArgsInternal1: function(moduleName, funName, a1, ann1) {
        checkArgAnn(a1, ann1);
      },
      checkArgsInternal2: function(moduleName, funName, a1, ann1, a2, ann2) {
        checkArgAnn(a1, ann1); checkArgAnn(a2, ann2);
      },
      checkArgsInternal3: function(moduleName, funName, a1, ann1, a2, ann2, a3, ann3) {
        checkArgAnn(a1, ann1); checkArgAnn(a2, ann2); checkArgAnn(a3, ann3);
      },
      checkArgsInternalInline: function(moduleName, funName) {
        for (var i = 2; i + 1 < arguments.length; i += 2) {
          checkArgAnn(arguments[i], arguments[i + 1]);
        }
      },
      makePrimAnn: function(name, pred) {
        thisRuntime[name] = { $ann: true, name: name, pred: pred };
      },
      makePrimitiveAnn: function(name, pred) {
        return { $ann: true, name: name, pred: pred };
      },
      makeFlatPredAnn: function(pred, name) {
        return { $ann: true, name: name, pred: pred };
      },
      makeBranderAnn: makeBranderAnn,
      makeRecordAnn: function() { return ANY; },
      makeTupleAnn: function() { return ANY; },
      checkAnn: function() { return true; },
      checkCellContent: function() { return true; },
      checkList: function(v) { return true; },

      // misc aliases used by stock js trove modules
      unwrap: function(v) { return v; },
      safeTail: function(f) { return f(); },
      eachLoop: function(f, start, stop) {
        for (var i = start; i < stop; i++) { f(i); }
        return NOTHING;
      },
      isActivationRecord: function() { return false; },
      isCont: function() { return false; },
      isContinuation: function() { return false; },
      pyretTrue: true,
      pyretFalse: false,
      lessthan: _lessthan,
      greaterthan: _greaterthan,
      num_to_fixnum: function(n) { return jsnums.toFixnum(n, NumberErrbacks); },
      string_isnumber: function(s) {
        var res = jsnums.fromString(s, NumberErrbacks);
        return !(res === false || res === undefined);
      },
      raw_array_get: rawArrayGet,
      raw_array_set: rawArraySet,
      raw_array_length: rawArrayLength,
      raw_array_concat: rawArrayConcat,
      raw_array_map: rawArrayMap,
      raw_array_mapi: function(f, a) {
        var res = new Array(a.length);
        for (var i = 0; i < a.length; i++) { res[i] = f(a[i], i); }
        return res;
      },
      raw_array_filter: rawArrayFilter,
      raw_array_fold: rawArrayFold,
      raw_array_each: function(f, a) {
        for (var i = 0; i < a.length; i++) { f(a[i]); }
        return NOTHING;
      },

      // odds and ends used by individual js trove modules
      checkOpaque: function(v) {
        if (!(v instanceof Opaque)) { interr("expected an internal value, got " + safeRepr(v)); }
        return v;
      },
      EXN_STACKHEIGHT: 0,
      GAS: 1e9,
      RUNGAS: 1e9,
      makeActivationRecord: function() { interr("makeActivationRecord is not supported in direct mode"); },
      makeCont: function() { interr("makeCont is not supported in direct mode"); },
      ReprMethods: {
        "$cli": {},
        "_torepr": {},
        "_tostring": {},
        createNewRenderer: function() { return {}; }
      },
      makeList: arrayToList,
      makeMessageException: makeMessageException,
      makeArray: function(arr) { return arr; },
      printPyretStack: function(stack, noIndent) { return "  (no stack in direct mode)"; },
      string_append: function(a, b) { return checkString(a) + checkString(b); },
      stdout: function(s) { stdout(s); },
      stderr: function(s) { stderr(s); },
      stdin: theOutsideWorld.stdin,

      // introspection for handalone
      "$PyretException": PyretException,
      "$Opaque": Opaque,
      "$outsideWorld": theOutsideWorld
    };

    // Primitive annotations with real predicates, enforced by
    // checkArgsInternal* (js-module argument contracts)
    var primAnnPreds = {
      "Number": isNumber,
      "String": isString,
      "Boolean": isBoolean,
      "Function": function(v) { return typeof v === "function"; },
      "Object": isObject,
      "Method": isMethod,
      "Nothing": isNothing,
      "RawArray": isRawArray,
      "Tuple": isPTuple,
      "Exactnum": function(v) { return isNumber(v) && jsnums.isRational(v); },
      "Roughnum": function(v) { return isNumber(v) && jsnums.isRoughnum(v); },
      "NumInteger": function(v) { return isNumber(v) && jsnums.isInteger(v); },
      "NumRational": function(v) { return isNumber(v) && jsnums.isRational(v); },
      "NumPositive": function(v) { return isNumber(v) && jsnums.isPositive(v); },
      "NumNegative": function(v) { return isNumber(v) && jsnums.isNegative(v); },
      "NumNonPositive": function(v) { return isNumber(v) && jsnums.isNonPositive(v); },
      "NumNonNegative": function(v) { return isNumber(v) && jsnums.isNonNegative(v); },
      "NumNatural": function(v) { return isNumber(v) && jsnums.isInteger(v) && jsnums.isNonNegative(v); }
    };
    Object.keys(primAnnPreds).forEach(function(n) {
      thisRuntime[n] = { $ann: true, name: n, pred: primAnnPreds[n] };
    });
    ["List", "EqualityResult"].forEach(function(n) {
      if (!(n in thisRuntime)) { thisRuntime[n] = { $ann: true, name: n }; }
    });

    // js modules call functions received from Pyret code via f.app(...).
    // Direct-rep functions are plain JS functions, so make `.app` resolve to
    // the function itself.  Non-enumerable, prototype-level: zero per-value
    // cost.  (Own `.app` properties, e.g. from a coexisting stock runtime's
    // function objects, take precedence as usual.)
    if (!Object.prototype.hasOwnProperty.call(Function.prototype, "app")) {
      Object.defineProperty(Function.prototype, "app", {
        get: function() { return this; },
        configurable: true,
        enumerable: false
      });
    }
    // js modules invoke methods as m.full_meth(self, args...) and
    // m.meth(self)(args...); direct methods are `this`-based functions.
    if (!Object.prototype.hasOwnProperty.call(Function.prototype, "full_meth")) {
      Object.defineProperty(Function.prototype, "full_meth", {
        get: function() {
          var m = this;
          return function(self) {
            var rest = new Array(arguments.length - 1);
            for (var i = 1; i < arguments.length; i++) { rest[i - 1] = arguments[i]; }
            return m.apply(self, rest);
          };
        },
        configurable: true,
        enumerable: false
      });
    }
    if (!Object.prototype.hasOwnProperty.call(Function.prototype, "meth")) {
      Object.defineProperty(Function.prototype, "meth", {
        get: function() {
          var m = this;
          return function(self) {
            return function() { return m.apply(self, arguments); };
          };
        },
        configurable: true,
        enumerable: false
      });
    }

    return thisRuntime;
  }

  return { makeRuntime: makeRuntime };
});
