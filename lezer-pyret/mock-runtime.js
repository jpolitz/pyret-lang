// A faithful RECORDING mock of the subset of the Pyret RUNTIME that translate()
// in parse-pyret.js uses. Instead of producing real Pyret runtime AST values, each
// constructor application is recorded as a plain JS structure that serializes to a
// canonical string. Because BOTH the RNGLR tree and the Lezer-adapted tree are fed
// through the SAME translate() + SAME mock, identical ASTs <=> identical strings.
//
// translate() only touches: getField, makeString, makeNumber(FromString),
// makeBoolean, pyretTrue/False, ffi.{makeNone, makeSome, makePyretPos,
// combinePyretPos}, plus link/empty (via getField on the lists lib). The error-only
// throw* helpers are wired to throw a tagged JS error so divergences surface.

function loadParsePyret() {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.join(__dirname, "../lang/src/js/trove/parse-pyret.js"), "utf8");
  // The file is an AMD config object literal: `({ requires, ..., theModule })`.
  return eval(src); // eslint-disable-line no-eval
}

// --- recorded value constructors ---
const app = (ctor, args) => ({ t: "app", ctor, args });
const ctorVal = (name) => ({ t: "ctor", name, app: (...args) => app(name, args) });

function makeRuntime() {
  const ffi = {
    makeNone: () => ({ t: "none" }),
    makeSome: (x) => ({ t: "some", v: x }),
    makePyretPos: (fileName, p) => ({ t: "pos",
      v: [fileName, p.startRow, p.startCol, p.startChar, p.endRow, p.endCol, p.endChar] }),
    combinePyretPos: (fileName, p1, p2) => ({ t: "pos",
      v: [fileName, p1.startRow, p1.startCol, p1.startChar, p2.endRow, p2.endCol, p2.endChar] }),
    makeRight: (x) => ({ t: "right", v: x }),
    makeLeft: (x) => ({ t: "left", v: x }),
  };
  // every throw* helper records the throw as a JS exception (should not fire on the
  // valid corpus; if it does for one parser and not the other, ast-equiv catches it)
  for (const k of ["throwParseErrorBadFunHeader", "throwParseErrorBadOper",
      "throwParseErrorBadApp", "throwParseErrorEOF", "throwParseErrorUnterminatedString",
      "throwParseErrorBadNumber", "throwParseErrorColonColon", "throwParseErrorBadCheckOper",
      "throwParseErrorNextToken"]) {
    ffi[k] = (...a) => { const e = new Error("PYRET-THROW:" + k); e.pyretThrow = k; throw e; };
  }
  const RUNTIME = {
    ffi,
    // getField ignores the receiver and returns a constructor keyed by the field
    // name (works for ast/srcloc/lists namespaces and for `link`/`empty`).
    getField: (_obj, name) => ctorVal(name),
    makeString: (s) => ({ t: "str", v: s }),
    makeNumber: (n) => ({ t: "num", v: n }),
    makeNumberFromString: (s) => ({ t: "num", v: s }),
    makeBoolean: (b) => ({ t: "bool", v: !!b }),
    pyretTrue: { t: "bool", v: true },
    pyretFalse: { t: "bool", v: false },
    makeNone: () => ({ t: "none" }),
    makeSome: (x) => ({ t: "some", v: x }),
    makeObject: (o) => ({ t: "obj", v: o }),
    makeFunction: (f) => f,
    makeModuleReturn: (values, types, internal) => ({ __values: values, __internal: internal || {} }),
    isPyretException: () => false,
  };
  return RUNTIME;
}

// canonical, deterministic serialization of a recorded value
function ser(v) {
  if (v === undefined) return "undef";
  if (v === null) return "null";
  if (typeof v === "function") return "fn";
  switch (v.t) {
    case "app":  return v.ctor + "(" + v.args.map(ser).join(",") + ")";
    case "ctor": return v.name;
    case "str":  return "S" + JSON.stringify(v.v);
    case "num":  return "N" + v.v;
    case "bool": return v.v ? "T" : "F";
    case "none": return "none";
    case "some": return "some(" + ser(v.v) + ")";
    case "pos":  return "@[" + v.v.join(",") + "]";
    case "right": return "Right(" + ser(v.v) + ")";
    case "left":  return "Left(" + ser(v.v) + ")";
    case "obj":  return "Obj";
    default: return JSON.stringify(v);
  }
}

// Build the parse-pyret module with the mock runtime and return translateTree.
function makeTranslateTree() {
  const mod = loadParsePyret();
  const RUNTIME = makeRuntime();
  const srclocLib = {}, astLib = {}, listsLib = {};
  const m = mod.theModule(RUNTIME, null, "mock://uri", srclocLib, astLib, listsLib, null, null);
  if (!m.__internal || typeof m.__internal.translateTree !== "function")
    throw new Error("translateTree not exposed via module internal");
  return m.__internal.translateTree;
}

module.exports = { makeTranslateTree, ser };
