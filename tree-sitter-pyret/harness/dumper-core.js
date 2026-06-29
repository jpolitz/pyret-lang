// Reflective AST dumper shared by dump-existing.js (single file) and dump-batch.js
// (many files, one runtime boot). See dump-existing.js for runtime value-shape notes.
// Output format is the canonical diff contract (src-ts/serialize.ts must match it).
"use strict";

function makeDumper(rt) {
  function ind(n) { return new Array(n + 1).join("  "); }

  function fieldNamesOf(v) {
    if (v.$arity === -1) { return []; } // singleton (none, a-blank): no data fields
    if (v.$constructor && v.$constructor.$fieldNames) {
      return v.$constructor.$fieldNames;
    }
    var ks = [];
    for (var k in v.dict) {
      if (typeof v.dict[k] !== "function" && !rt.isFunction(v.dict[k])) { ks.push(k); }
    }
    ks.sort();
    return ks;
  }

  function renderSrcloc(v) {
    var d = v.dict;
    return "(srcloc " +
      JSON.stringify(d["source"]) + " " +
      rt.num_tostring(d["start-line"]) + " " +
      rt.num_tostring(d["start-column"]) + " " +
      rt.num_tostring(d["start-char"]) + " " +
      rt.num_tostring(d["end-line"]) + " " +
      rt.num_tostring(d["end-column"]) + " " +
      rt.num_tostring(d["end-char"]) + ")";
  }

  function isSrclocVariant(v) {
    return v.$name === "srcloc" &&
      Object.prototype.hasOwnProperty.call(v.dict, "start-char");
  }
  function isBuiltinSrcloc(v) {
    return v.$name === "builtin" &&
      Object.prototype.hasOwnProperty.call(v.dict, "module-name");
  }

  function listToArray(v) {
    var out = [];
    while (rt.isDataValue(v) && v.$name === "link") {
      out.push(v.dict["first"]);
      v = v.dict["rest"];
    }
    return out;
  }

  function dump(v, depth) {
    if (v === undefined) { return "undefined"; }
    if (v === null) { return "null"; }
    if (rt.isNothing && rt.isNothing(v)) { return "nothing"; }
    if (rt.isBoolean(v)) { return v ? "true" : "false"; }
    if (rt.isNumber(v)) { return rt.num_tostring(v); }
    if (rt.isString(v)) { return JSON.stringify(v); }
    if (rt.isFunction(v)) { return "<function>"; }

    if (rt.isDataValue(v)) {
      if (isSrclocVariant(v)) { return renderSrcloc(v); }
      if (isBuiltinSrcloc(v)) {
        return "(builtin " + JSON.stringify(v.dict["module-name"]) + ")";
      }
      if (v.$name === "empty") { return "(list)"; }
      if (v.$name === "link") {
        var elems = listToArray(v);
        if (elems.length === 0) { return "(list)"; }
        var pieces = elems.map(function(e) { return ind(depth + 1) + dump(e, depth + 1); });
        return "(list\n" + pieces.join("\n") + ")";
      }
      var names = fieldNamesOf(v);
      if (names.length === 0) { return "(" + v.$name + ")"; }
      var parts = names.map(function(fn) {
        return ind(depth + 1) + ":" + fn + " " + dump(v.dict[fn], depth + 1);
      });
      return "(" + v.$name + "\n" + parts.join("\n") + ")";
    }

    if (Array.isArray(v)) {
      var ap = v.map(function(e) { return ind(depth + 1) + dump(e, depth + 1); });
      return "(array\n" + ap.join("\n") + ")";
    }
    if (typeof v === "object") {
      if (v.dict) {
        var ks = [];
        for (var k in v.dict) { ks.push(k); }
        ks.sort();
        var op = ks.map(function(kk) { return ind(depth + 1) + ":" + kk + " " + dump(v.dict[kk], depth + 1); });
        return "(object\n" + op.join("\n") + ")";
      }
      return "(opaque " + JSON.stringify(Object.prototype.toString.call(v)) + ")";
    }
    return JSON.stringify(v);
  }

  return function(v) { return dump(v, 0); };
}

module.exports = makeDumper;
