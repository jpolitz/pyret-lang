// parse-tree-sitter: a drop-in alternative to parse-pyret's `surface-parse` that uses the
// tree-sitter grammar + the TS lowering (reused unchanged via the bundled lowering) to build
// the same ast.arr `Program` value. Selected by the compiler when `--use-tree-sitter` is set
// (see compile-lib.arr). Same provides/types as parse-pyret so it's interchangeable.
//
// NOTE: the nativeRequires below are ABSOLUTE paths (this machine). The AMD loader resolves
// unknown native names via node require.resolve, and absolute paths resolve regardless of cwd
// (amd_loader.js). The tree-sitter runtime + grammar .node live under tree-sitter-pyret/, not
// lang/node_modules, hence absolute paths. Make these configurable for a real integration.
({
  requires: [
    { "import-type": "builtin", name: "srcloc" },
    { "import-type": "builtin", name: "ast" },
    { "import-type": "builtin", name: "lists" }
  ],
  nativeRequires: [
    "tree-sitter-runtime",
    "tree-sitter-grammar",
    "tree-sitter-lowering"
  ],
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
  theModule: function(RUNTIME, NAMESPACE, uri, srclocLib, astLib, listsLib, TreeSitter, grammar, lowering) {
    var srcloc = RUNTIME.getField(srclocLib, "values");
    var ast = RUNTIME.getField(astLib, "values");
    var makePyretPos = RUNTIME.ffi.makePyretPos;

    var Lowering = lowering.Lowering;
    var toRuntime = lowering.toRuntime;
    var PositionMap = lowering.PositionMap;

    // One parser instance; reset language each parse is unnecessary.
    var parser = new TreeSitter();
    parser.setLanguage(grammar);

    // Find the first ERROR / MISSING node for a parse-error position.
    function firstErrorNode(n) {
      if (n.type === "ERROR" || n.isMissing) return n;
      for (var i = 0; i < n.childCount; i++) {
        var c = n.child(i);
        if (c && (c.hasError || c.isMissing || c.type === "ERROR")) {
          var deeper = firstErrorNode(c);
          if (deeper) return deeper;
        }
      }
      return null;
    }

    // Core: parse `data` and return the Pyret Program AST (raises a Pyret parse error on
    // failure, matching surface-parse's contract).
    function doParse(data, fileName) {
      var tree = parser.parse(data, null, { bufferSize: Math.max(32768, data.length * 2 + 1024) });
      var root = tree.rootNode;
      if (root.hasError) {
        var err = firstErrorNode(root) || root;
        var pm = new PositionMap(data);
        var p = pm.posFromBytes(err.startIndex, err.endIndex);
        var pos = makePyretPos(fileName, p);
        var tokText = (err.text || "").split("\n")[0] || "parse error";
        RUNTIME.ffi.throwParseErrorNextToken(pos, tokText);
      }
      var low = new Lowering(data, fileName);
      var val = low.lowerProgram(root);
      return toRuntime(val, { RUNTIME: RUNTIME, ast: ast, srcloc: srcloc });
    }

    function parseTS(data, fileName) {
      RUNTIME.ffi.checkArity(2, arguments, "surface-parse", false);
      RUNTIME.checkString(data);
      RUNTIME.checkString(fileName);
      return doParse(RUNTIME.unwrap(data), RUNTIME.unwrap(fileName));
    }

    // maybe-surface-parse: Either<{exn;message}, Program>, mirroring parse-pyret.
    function maybeParseTS(data, fileName) {
      RUNTIME.ffi.checkArity(2, arguments, "maybe-surface-parse", false);
      RUNTIME.checkString(data);
      RUNTIME.checkString(fileName);
      try {
        return RUNTIME.ffi.makeRight(doParse(RUNTIME.unwrap(data), RUNTIME.unwrap(fileName)));
      } catch (e) {
        if (RUNTIME.isPyretException(e)) {
          return RUNTIME.ffi.makeLeft(RUNTIME.makeObject({
            exn: e.exn,
            message: RUNTIME.makeString("")
          }));
        }
        throw e;
      }
    }

    return RUNTIME.makeModuleReturn({
      'surface-parse': RUNTIME.makeFunction(parseTS, "surface-parse"),
      'maybe-surface-parse': RUNTIME.makeFunction(maybeParseTS, "maybe-surface-parse"),
    }, {});
  }
})
