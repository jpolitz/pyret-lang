// Canonical serializer — produces output byte-identical to harness/dump-existing.js
// (the reference dumper over the real RNGLR parser). That dumper's format:
//   ind(n) = "  " * n
//   number  -> num_tostring(n)  == String(n)   (integers => decimal; rationals "4/5"; rough "~2")
//   string  -> JSON.stringify(s)
//   srcloc  -> (srcloc "source" sl sc sch el ec ech)        [one line, ints via String]
//   builtin -> (builtin "module-name")
//   list    -> (list)  |  (list\n  <e@d+1>\n  ...)
//   option  -> (none)  |  (some\n  :value <v@d+1>)          [generic data value]
//   data    -> (name)  |  (name\n  :f0 <v@d+1>\n  :f1 ...)  [field names from constructor]
// The whole dump is dump(ast, 0); dump-existing.js writes it followed by "\n".

import * as fs from "node:fs";
import type { Value } from "./ast.ts";

// Constructor field-name lists, in declared order (mirrors $constructor.$fieldNames).
const CTORS: Record<string, string[]> = JSON.parse(
  fs.readFileSync(new URL("../corpus/ast-ctors.json", import.meta.url), "utf8"),
);

function ind(n: number): string {
  return "  ".repeat(n);
}

function dump(v: Value, depth: number): string {
  switch (v.kind) {
    case "bool":
      return v.value ? "true" : "false";
    case "num":
      return v.repr;
    case "str":
    case "name":
      return JSON.stringify(v.value);
    case "srcloc":
      return (
        "(srcloc " +
        JSON.stringify(v.source) +
        " " +
        v.startLine +
        " " +
        v.startCol +
        " " +
        v.startChar +
        " " +
        v.endLine +
        " " +
        v.endCol +
        " " +
        v.endChar +
        ")"
      );
    case "builtin":
      return "(builtin " + JSON.stringify(v.name) + ")";
    case "list": {
      if (v.items.length === 0) return "(list)";
      const pieces = v.items.map((e) => ind(depth + 1) + dump(e, depth + 1));
      return "(list\n" + pieces.join("\n") + ")";
    }
    case "option":
      if (!v.some) return "(none)";
      return "(some\n" + ind(depth + 1) + ":value " + dump(v.value!, depth + 1) + ")";
    case "node": {
      const names = CTORS[v.$name];
      if (v.fields.length === 0) return "(" + v.$name + ")";
      if (!names || names.length !== v.fields.length) {
        throw new Error(
          `field-name/arity mismatch for ${v.$name}: have ${v.fields.length} fields, ` +
            `ctor declares ${names ? names.length : "?"} (${names ? names.join(",") : "unknown"})`,
        );
      }
      const parts = v.fields.map(
        (f, i) => ind(depth + 1) + ":" + names[i] + " " + dump(f, depth + 1),
      );
      return "(" + v.$name + "\n" + parts.join("\n") + ")";
    }
  }
}

/** Serialize a Program (or any Value) exactly as dump-existing.js does, incl. trailing newline. */
export function serialize(v: Value): string {
  return dump(v, 0) + "\n";
}
