// Convert the lowering's plain-Value AST into a REAL Pyret runtime AST (ast.arr values),
// for the compiler-flag path. The harness path uses serialize.ts on the same Values; the
// compiler path uses this converter — so lower.ts is reused unchanged for both targets.
//
// The runtime context is supplied by the parse-tree-sitter.js builtin, which has RUNTIME,
// the `ast` module, and the `srcloc` module in scope (exactly like parse-pyret.js).

import type { Value } from "./ast.ts";

// Minimal shape of the Pyret runtime + modules we need (duck-typed; the builtin passes the
// real objects). Mirrors how parse-pyret.js builds AST: RUNTIME.getField(ast, "s-x").app(...).
export interface RuntimeCtx {
  RUNTIME: {
    getField(obj: unknown, field: string): any;
    makeString(s: string): unknown;
    makeNumberFromString(s: string): unknown;
    makeNumber(n: number): unknown;
    ffi: {
      makeList(arr: unknown[]): unknown;
      makeSome(v: unknown): unknown;
      makeNone(): unknown;
    };
  };
  ast: unknown; // the ast.arr module's provided object (source of s-* constructors)
  srcloc: unknown; // the srcloc module's provided object (srcloc / builtin constructors)
}

export function toRuntime(v: Value, ctx: RuntimeCtx): unknown {
  const R = ctx.RUNTIME;
  switch (v.kind) {
    case "node": {
      const ctor = R.getField(ctx.ast, v.$name);
      // A 0-field variant is a SINGLETON value (e.g. a-blank, s-construct-normal), not a
      // constructor function — return it directly. Variants with fields are constructor
      // functions (.app). (Guard handles either representation of nullary variants.)
      if (v.fields.length === 0) {
        return ctor && typeof (ctor as any).app === "function" ? (ctor as any).app() : ctor;
      }
      const args = v.fields.map((f) => toRuntime(f, ctx));
      return (ctor as any).app(...args);
    }
    case "srcloc": {
      const n = (x: number) => R.makeNumber(x);
      return R.getField(ctx.srcloc, "srcloc").app(
        R.makeString(v.source),
        n(v.startLine),
        n(v.startCol),
        n(v.startChar),
        n(v.endLine),
        n(v.endCol),
        n(v.endChar),
      );
    }
    case "builtin":
      return R.getField(ctx.srcloc, "builtin").app(R.makeString(v.name));
    case "list":
      return R.ffi.makeList(v.items.map((it) => toRuntime(it, ctx)));
    case "option":
      return v.some ? R.ffi.makeSome(toRuntime(v.value!, ctx)) : R.ffi.makeNone();
    case "str":
    case "name":
      return R.makeString(v.value);
    case "num":
      // repr is num_tostring form (e.g. "1", "157/50", "~3.14"); makeNumberFromString
      // reconstructs the same Pyret number. (Validate roughnum round-trip during e2e test.)
      return R.makeNumberFromString(v.repr);
    case "bool":
      return v.value; // Pyret booleans are raw JS booleans
  }
}
