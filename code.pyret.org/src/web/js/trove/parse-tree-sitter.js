// Browser override of parse-tree-sitter (shadows lang/src/js/trove/parse-tree-sitter.js,
// which uses native nodeRequires that don't exist in-browser). Same provides/types as
// parse-pyret so the compiler's `import parse-tree-sitter as TS` keeps working. The actual
// tree-sitter runtime + grammar wasm + lowering are initialized in editor.html and exposed
// as window.__PYRET_TS__ (parser) + window.PyretTS (Lowering, toRuntime); this module has NO
// nativeRequires so it loads cleanly even when those globals aren't present yet.
({
  requires: [
    { "import-type": "builtin", name: "srcloc" },
    { "import-type": "builtin", name: "ast" },
    { "import-type": "builtin", name: "lists" }
  ],
  nativeRequires: [],
  provides: {
    shorthands: {
      "Program": {
          tag: "name",
          origin: { "import-type": "uri", uri: "builtin://ast" },
          name: "Program"
        }
    },
    values: {
      "surface-parse": ["arrow", ["String", "String"], "Program"],
      "maybe-surface-parse": ["arrow", ["String", "String"], ["Option", "Program"]],
    }
  },
  theModule: function(RUNTIME, NAMESPACE, uri, srclocLib, astLib, listsLib) {
    var ast = RUNTIME.getField(astLib, "values");
    var srcloc = RUNTIME.getField(srclocLib, "values");

    function tsParseToProgram(data, fileName) {
      var TS = (typeof window !== "undefined") && window.__PYRET_TS__;
      var PT = (typeof window !== "undefined") && window.PyretTS;
      if (!TS || !TS.ready || !PT) {
        throw new Error("tree-sitter parser not initialized (window.__PYRET_TS__ not ready)");
      }
      var tree = TS.parser.parse(data);
      if (tree.rootNode.hasError) {
        // Match parse-pyret's error path well enough for the editor.
        var n = tree.rootNode;
        RUNTIME.ffi.throwParseErrorNextToken(
          RUNTIME.ffi.makePyretPos(fileName, { startRow: 1, startCol: 0, startChar: 0, endRow: 1, endCol: 1, endChar: 1 }),
          "");
      }
      var val = new PT.Lowering(data, fileName).lowerProgram(tree.rootNode);
      return PT.toRuntime(val, { RUNTIME: RUNTIME, ast: ast, srcloc: srcloc });
    }

    return RUNTIME.makeModuleReturn({
      "surface-parse": RUNTIME.makeFunction(function(data, fileName) {
        RUNTIME.ffi.checkArity(2, arguments, "surface-parse", false);
        return tsParseToProgram(RUNTIME.unwrap(data), RUNTIME.unwrap(fileName));
      }, "surface-parse"),
      "maybe-surface-parse": RUNTIME.makeFunction(function(data, fileName) {
        RUNTIME.ffi.checkArity(2, arguments, "maybe-surface-parse", false);
        try {
          return RUNTIME.ffi.makeSome(tsParseToProgram(RUNTIME.unwrap(data), RUNTIME.unwrap(fileName)));
        } catch (e) {
          return RUNTIME.ffi.makeNone();
        }
      }, "maybe-surface-parse"),
    }, {});
  }
})
