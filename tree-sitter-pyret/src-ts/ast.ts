// AST node model for the tree-sitter lowering. Nodes mirror ast.arr constructors:
// a node is a constructor name ($name, e.g. "s-program") plus named fields whose
// order is the constructor's declared order (see corpus/ast-ctors.json). Values are
// the union below. This is serialized canonically (serialize.ts) and diffed against
// the reference parser's output.

import type { Loc } from "./srcloc.ts";

export type Value =
  | Node
  | Loc
  | { kind: "list"; items: Value[] }
  | { kind: "option"; some: boolean; value?: Value }
  | { kind: "str"; value: string }
  | { kind: "num"; repr: string } // canonical numeric repr (matches Pyret tostring)
  | { kind: "bool"; value: boolean }
  | { kind: "name"; value: string }; // bare string field (e.g. operator name "op+")

export interface Node {
  kind: "node";
  $name: string;
  fields: Value[]; // positional, in constructor-declared order
}

export function node($name: string, ...fields: Value[]): Node {
  return { kind: "node", $name, fields };
}

export function list(items: Value[]): Value {
  return { kind: "list", items };
}

export function some(value: Value): Value {
  return { kind: "option", some: true, value };
}

export const none: Value = { kind: "option", some: false };

export function str(value: string): Value {
  return { kind: "str", value };
}

export function num(repr: string): Value {
  return { kind: "num", repr };
}

export function bool(value: boolean): Value {
  return { kind: "bool", value };
}

export function nameStr(value: string): Value {
  return { kind: "name", value };
}
