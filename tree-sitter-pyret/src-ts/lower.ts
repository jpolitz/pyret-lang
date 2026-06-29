// Lowering: tree-sitter CST -> Pyret AST (ast.arr Program), mirroring the translators
// in lang/src/js/trove/parse-pyret.js. Dispatch is keyed by CST node type (= BNF
// nonterminal with '-'->'_'). All terminals are named CST children; nullable BNF rules
// are ABSENT (not empty nodes) when empty, so we locate children by type, not fixed
// index. Srclocs reproduce makePyretPos/combinePyretPos exactly.

import { PositionMap, makePyretPos, combinePyretPos, type Pos, type Loc } from "./srcloc.ts";
import { node, list, some, none, str, num, bool, type Node, type Value } from "./ast.ts";

export interface TSNode {
  type: string;
  startIndex: number;
  endIndex: number;
  childCount: number;
  child(i: number): TSNode | null;
  text: string;
  isNamed: boolean;
  hasError: boolean;
}

export class NotImplemented extends Error {
  ruleName: string;
  constructor(ruleName: string) {
    super(`lowering not implemented for rule: ${ruleName}`);
    this.ruleName = ruleName;
  }
}

const PASSTHROUGH = new Set<string>([
  "stmt", "expr", "prim_expr", "ann", "binding", "toplevel_binding",
  "let_binding", "type_let_bind", "import_source", "provide_spec",
  "include_spec", "provide_stmt",
]);

// Token type sets used for detection.
const SEP_BLOCK = "block_kw"; // `block:` separator => blocky=true

export class Lowering {
  private pm: PositionMap;
  private file: string;

  constructor(source: string, file: string) {
    this.pm = new PositionMap(source);
    this.file = file;
  }

  // ---- srcloc helpers ----
  private posOf(n: TSNode): Pos { return this.pm.posFromBytes(n.startIndex, n.endIndex); }
  private loc(n: TSNode): Loc { return makePyretPos(this.file, this.posOf(n)); }
  private loc2(a: TSNode, b: TSNode): Loc { return combinePyretPos(this.file, this.posOf(a), this.posOf(b)); }
  private zeroWidthStart(n: TSNode): Pos {
    const p = this.posOf(n);
    return { startRow: p.startRow, startCol: p.startCol, startChar: p.startChar, endRow: p.startRow, endCol: p.startCol, endChar: p.startChar };
  }
  private zeroWidthEnd(n: TSNode): Pos {
    const p = this.posOf(n);
    return { startRow: p.endRow, startCol: p.endCol, startChar: p.endChar, endRow: p.endRow, endCol: p.endCol, endChar: p.endChar };
  }

  // ---- child accessors ----
  private kids(n: TSNode): TSNode[] {
    const out: TSNode[] = [];
    for (let i = 0; i < n.childCount; i++) { const c = n.child(i); if (c) out.push(c); }
    return out;
  }
  private kidsOfType(n: TSNode, ...types: string[]): TSNode[] {
    const s = new Set(types);
    return this.kids(n).filter((k) => s.has(k.type));
  }
  private firstOfType(n: TSNode, ...types: string[]): TSNode | null {
    const s = new Set(types);
    return this.kids(n).find((k) => s.has(k.type)) ?? null;
  }
  private hasType(n: TSNode, ...types: string[]): boolean {
    const s = new Set(types);
    return this.kids(n).some((k) => s.has(k.type));
  }

  // ---- leaf helpers (mirror parse-pyret name/symbol/string/number) ----
  // name(tok): "_" -> s-underscore; else s-name
  private nameNode(tok: TSNode): Node {
    if (tok.text === "_") return node("s-underscore", this.loc(tok));
    return node("s-name", this.loc(tok), str(tok.text));
  }
  private symbol(tok: TSNode): Value { return str(tok.text); }
  private strVal(tok: TSNode): Value { return str(decodePyretString(tok.text)); }

  // ---- dispatch ----
  tr(n: TSNode): Value {
    if (PASSTHROUGH.has(n.type)) {
      const k = this.kids(n);
      if (k.length === 1) return this.tr(k[0]);
    }
    const handler = (this as any)[`rule_${n.type}`];
    if (typeof handler !== "function") throw new NotImplemented(n.type);
    return handler.call(this, n);
  }
  private trList(ns: TSNode[]): Value { return list(ns.map((n) => this.tr(n))); }

  lowerProgram(root: TSNode): Node { return this.rule_program(root) as Node; }

  // ============================================================
  // Program / prelude
  // ============================================================
  rule_program(n: TSNode): Node {
    const l = this.loc(n);
    let useNode: Value = none;
    let provideNode: Value | null = null;
    let provideTypes: Value | null = null;
    const provides: Value[] = [];
    const imports: Value[] = [];
    let blockNode: TSNode | null = null;
    const preludeItems: TSNode[] = [];

    for (const k of this.kids(n)) {
      switch (k.type) {
        case "use_stmt": useNode = some(this.tr(k)); preludeItems.push(k); break;
        case "block": blockNode = k; break;
        case "import_stmt": imports.push(this.tr(k)); preludeItems.push(k); break;
        case "provide_stmt": {
          preludeItems.push(k);
          const inner = this.kids(k)[0];
          if (inner.type === "provide_vals_stmt") { if (provideNode === null) provideNode = this.tr(k); }
          else if (inner.type === "provide_types_stmt") { if (provideTypes === null) provideTypes = this.tr(k); }
          else if (inner.type === "provide_block") { provides.push(this.tr(k)); }
          break;
        }
      }
    }

    // EOF position. When the file has NO tokens at all (empty / comments-only), the program
    // node doesn't reach the true end (comments are scanner-extras), so use the source end.
    // Otherwise (prelude-only / empty trailing block) the program node spans to the last
    // token, which is what RNGLR uses.
    const tokenless = preludeItems.length === 0 && blockNode === null;
    const eof = tokenless ? this.srcEofPos() : this.nodeEofPos(n);
    const preludeLoc: Loc = preludeItems.length > 0
      ? this.loc2(preludeItems[0], preludeItems[preludeItems.length - 1])
      : (blockNode ? makePyretPos(this.file, this.zeroWidthStart(blockNode)) : makePyretPos(this.file, eof));

    const provide = provideNode ?? node("s-provide-none", preludeLoc);
    const providedTypes = provideTypes ?? node("s-provide-types-none", preludeLoc);

    let blockVal: Node;
    let progLoc: Loc;
    if (blockNode) {
      blockVal = this.rule_block(blockNode);
      progLoc = l;
    } else {
      // Empty (absent) trailing block: RNGLR places it at the EOF position, which the
      // s-program loc also extends to.
      blockVal = node("s-block", makePyretPos(this.file, eof), list([]));
      if (preludeItems.length === 0) {
        progLoc = makePyretPos(this.file, eof); // empty file
      } else {
        const ps = this.posOf(n);
        progLoc = makePyretPos(this.file, {
          startRow: ps.startRow, startCol: ps.startCol, startChar: ps.startChar,
          endRow: eof.endRow, endCol: eof.endCol, endChar: eof.endChar,
        });
      }
    }
    return node("s-program", progLoc, useNode, provide, providedTypes, list(provides), list(imports), blockVal);
  }

  // EOF based on the program node's extent (= last token end), +1 (col & char) when the
  // source has no trailing newline. Used for prelude-only files / empty trailing block.
  private nodeEofPos(prog: TSNode): Pos {
    const p = this.posOf(prog);
    const src = this.pm.source;
    const endsNL = src.length > 0 && src[src.length - 1] === "\n";
    const r = p.endRow;
    const c = endsNL ? p.endCol : p.endCol + 1;
    const ch = endsNL ? p.endChar : p.endChar + 1;
    return { startRow: r, startCol: c, startChar: ch, endRow: r, endCol: c, endChar: ch };
  }

  // EOF based on the SOURCE end (comments/whitespace are scanner-extras outside every node,
  // so a comments-only file's program node doesn't reach the real EOF). +1 (col & char) when
  // no trailing newline. Empty file (len 0) -> (1,1,1); comments-only -> end-of-last-comment +1.
  private srcEofPos(): Pos {
    const src = this.pm.source;
    const n = this.pm.sourceLength();
    const rc = this.pm.charToRowCol(n);
    const endsNL = n > 0 && src[n - 1] === "\n";
    const r = rc.row;
    const c = endsNL ? rc.col : rc.col + 1;
    const ch = endsNL ? n : n + 1;
    return { startRow: r, startCol: c, startChar: ch, endRow: r, endCol: c, endChar: ch };
  }

  rule_use_stmt(n: TSNode): Node {
    const nm = this.firstOfType(n, "name")!;
    const src = this.firstOfType(n, "import_source")!;
    return node("s-use", this.loc(n), this.nameNode(nm), this.tr(src));
  }

  rule_import_stmt(n: TSNode): Node {
    const l = this.loc(n);
    if (this.hasType(n, "include_kw") && this.hasType(n, "from_kw")) {
      const modRef = this.firstOfType(n, "module_ref")!;
      const specs = this.kidsOfType(n, "include_spec");
      return node("s-include-from", l, this.rule_module_ref(modRef), this.trList(specs));
    } else if (this.hasType(n, "include_kw")) {
      return node("s-include", l, this.tr(this.firstOfType(n, "import_source")!));
    } else if (this.hasType(n, "as_kw")) {
      const src = this.firstOfType(n, "import_source")!;
      const nm = this.firstOfType(n, "name")!;
      return node("s-import", l, this.tr(src), this.nameNode(nm));
    } else {
      // IMPORT comma-names FROM import-source
      const names = this.firstOfType(n, "comma_names")!;
      const src = this.firstOfType(n, "import_source")!;
      return node("s-import-fields", l, this.rule_comma_names(names), this.tr(src));
    }
  }
  rule_import_special(n: TSNode): Node {
    const nm = this.firstOfType(n, "name")!;
    const strs = this.kidsOfType(n, "string");
    return node("s-special-import", this.loc(n), this.symbol(nm), list(strs.map((s) => this.strVal(s))));
  }
  rule_import_name(n: TSNode): Node {
    const nm = this.firstOfType(n, "name")!;
    return node("s-const-import", this.loc(n), this.symbol(nm));
  }

  rule_comma_names(n: TSNode): Value { return list(this.kidsOfType(n, "name").map((t) => this.nameNode(t))); }
  rule_module_ref(n: TSNode): Value { return list(this.kidsOfType(n, "name").map((t) => this.nameNode(t))); }

  // ---- provide ----
  rule_provide_vals_stmt(n: TSNode): Node {
    if (this.hasType(n, "star", "op_times")) return node("s-provide-all", this.loc(n));
    const stmt = this.kids(n)[1];
    return node("s-provide", this.loc(n), this.tr(stmt));
  }
  rule_provide_types_stmt(n: TSNode): Node {
    if (this.hasType(n, "star", "op_times")) return node("s-provide-types-all", this.loc(n));
    const rec = this.tr(this.firstOfType(n, "record_ann")!) as Node;
    return node("s-provide-types", this.loc(n), rec.fields[1]); // a-record(l, fields) -> fields
  }
  rule_provide_block(n: TSNode): Node {
    const specs = this.kidsOfType(n, "provide_spec");
    const modRef = this.firstOfType(n, "module_ref");
    const path: Value = modRef ? this.rule_module_ref(modRef) : list([]);
    return node("s-provide-block", this.loc(n), path, this.trList(specs));
  }

  // include/provide specs
  private nameSpec(n: TSNode, ctor: string): Node { return node(ctor, this.loc(n), this.tr(this.kids(n)[0])); }
  private typeSpec(n: TSNode, ctor: string): Node { return node(ctor, this.loc(n), this.tr(this.kids(n)[1])); }
  private dataSpec(n: TSNode, ctor: string): Node {
    const k = this.kids(n);
    const hidings = k.length === 2 ? list([]) : this.tr(k[2]);
    return node(ctor, this.loc(n), this.tr(k[1]), hidings);
  }
  private moduleSpec(n: TSNode, ctor: string): Node { return node(ctor, this.loc(n), this.tr(this.kids(n)[1])); }

  rule_include_name_spec(n: TSNode): Node { return this.nameSpec(n, "s-include-name"); }
  rule_include_type_spec(n: TSNode): Node { return this.typeSpec(n, "s-include-type"); }
  rule_include_data_spec(n: TSNode): Node { return this.dataSpec(n, "s-include-data"); }
  rule_include_module_spec(n: TSNode): Node { return this.moduleSpec(n, "s-include-module"); }
  rule_provide_name_spec(n: TSNode): Node { return this.nameSpec(n, "s-provide-name"); }
  rule_provide_type_spec(n: TSNode): Node { return this.typeSpec(n, "s-provide-type"); }
  rule_provide_data_spec(n: TSNode): Node { return this.dataSpec(n, "s-provide-data"); }
  rule_provide_module_spec(n: TSNode): Node { return this.moduleSpec(n, "s-provide-module"); }

  rule_name_spec(n: TSNode): Node {
    const k = this.kids(n);
    if (k[0].type === "star" || k[0].type === "op_times") {
      if (k.length === 1) return node("s-star", this.loc(n), list([]));
      return node("s-star", this.loc(n), this.tr(k[1])); // hiding-spec
    } else if (k.length === 1) {
      return node("s-module-ref", this.loc(n), this.tr(k[0]), none);
    } else {
      return node("s-module-ref", this.loc(n), this.tr(k[0]), some(this.nameNode(k[2])));
    }
  }
  rule_data_name_spec(n: TSNode): Node {
    // (STAR|TIMES) | module-ref  -- reuse name-spec semantics for module-ref; STAR -> s-star
    const k = this.kids(n);
    if (k[0].type === "star" || k[0].type === "op_times") return node("s-star", this.loc(n), list([]));
    return node("s-module-ref", this.loc(n), this.tr(k[0]), none);
  }
  rule_hiding_spec(n: TSNode): Value { return list(this.kidsOfType(n, "name").map((t) => this.nameNode(t))); }

  // ============================================================
  // Statements / blocks
  // ============================================================
  rule_block(n: TSNode): Node {
    const stmts = this.kids(n).map((k) => this.tr(k));
    return node("s-block", this.loc(n), list(stmts));
  }

  rule_let_expr(n: TSNode): Node {
    const k = this.kids(n);
    return node("s-let", this.loc(n), this.tr(k[0]), this.tr(k[k.length - 1]), bool(false));
  }
  rule_var_expr(n: TSNode): Node {
    const k = this.kids(n);
    return node("s-var", this.loc(n), this.tr(k[1]), this.tr(k[3]));
  }
  rule_rec_expr(n: TSNode): Node {
    const k = this.kids(n);
    return node("s-rec", this.loc(n), this.tr(k[1]), this.tr(k[3]));
  }
  rule_assign_expr(n: TSNode): Node {
    const k = this.kids(n);
    return node("s-assign", this.loc(n), this.nameNode(k[0]), this.tr(k[2]));
  }
  rule_type_expr(n: TSNode): Node {
    // TYPE NAME ty-params EQUALS ann
    const nm = this.firstOfType(n, "name")!;
    const tp = this.firstOfType(n, "ty_params");
    const ann = this.firstOfType(n, "ann")!;
    return node("s-type", this.loc(n), this.nameNode(nm), this.tyParamsList(tp), this.tr(ann));
  }
  rule_newtype_expr(n: TSNode): Node {
    const names = this.kidsOfType(n, "name");
    return node("s-newtype", this.loc(n), this.nameNode(names[0]), this.nameNode(names[1]));
  }
  rule_contract_stmt(n: TSNode): Node {
    // NAME COLONCOLON ty-params (ann|noparen-arrow-ann)
    const nm = this.firstOfType(n, "name")!;
    const tp = this.firstOfType(n, "ty_params");
    const ann = this.firstOfType(n, "ann", "noparen_arrow_ann")!;
    return node("s-contract", this.loc(n), this.nameNode(nm), this.tyParamsList(tp), this.tr(ann));
  }

  rule_when_expr(n: TSNode): Node {
    const test = this.firstOfType(n, "binop_expr")!;
    const body = this.firstOfType(n, "block");
    return node("s-when", this.loc(n), this.tr(test), this.blockOr(body, n), bool(this.isBlocky(n)));
  }

  rule_spy_stmt(n: TSNode): Node {
    const labelNode = this.firstOfType(n, "binop_expr");
    const label: Value = labelNode ? some(this.tr(labelNode)) : none;
    const contents = this.firstOfType(n, "spy_contents");
    const cv: Value = contents ? this.rule_spy_contents(contents) : list([]);
    return node("s-spy-block", this.loc(n), label, cv);
  }
  rule_spy_contents(n: TSNode): Value { return list(this.kidsOfType(n, "spy_field").map((k) => this.tr(k))); }
  rule_spy_field(n: TSNode): Node {
    const k = this.kids(n);
    if (k.length === 1) {
      // id-expr form: s-spy-expr(pos, symbol(id name), tr(idexpr), true)
      const idexpr = k[0];
      const idName = this.kids(idexpr)[0];
      return node("s-spy-expr", this.loc(n), this.symbol(idName), this.tr(idexpr), bool(true));
    }
    return node("s-spy-expr", this.loc(n), this.symbol(k[0]), this.tr(k[2]), bool(false));
  }

  // ============================================================
  // Functions / lambdas / methods
  // ============================================================
  private isBlocky(n: TSNode): boolean { return this.hasType(n, SEP_BLOCK); }

  private tyParamsList(tp: TSNode | null): Value {
    if (!tp) return list([]);
    const cn = this.firstOfType(tp, "comma_names");
    if (!cn) return list([]);
    return this.rule_comma_names(cn);
  }
  private argsList(argsNode: TSNode): Value {
    return list(this.kidsOfType(argsNode, "binding").map((b) => this.tr(b)));
  }
  private returnAnnVal(parent: TSNode): Value {
    const ra = this.firstOfType(parent, "return_ann");
    if (!ra) return node("a-blank");
    const ann = this.firstOfType(ra, "ann");
    return ann ? this.tr(ann) : node("a-blank");
  }
  private docVal(parent: TSNode): Value {
    const ds = this.firstOfType(parent, "doc_string");
    if (!ds) return str("");
    const s = this.firstOfType(ds, "string");
    return s ? this.strVal(s) : str("");
  }
  private whereVals(parent: TSNode): [Value, Value] {
    const wc = this.firstOfType(parent, "where_clause");
    if (!wc) return [none, none];
    const wkw = this.firstOfType(wc, "where_kw")!;
    const blk = this.firstOfType(wc, "block");
    return [some(this.loc(wkw)) as unknown as Value, some(blk ? this.tr(blk) : this.emptyBlock(wc))];
  }
  private emptyBlock(near: TSNode): Node {
    return node("s-block", makePyretPos(this.file, this.zeroWidthStart(near)), list([]));
  }
  private blockOr(b: TSNode | null, parent: TSNode): Node {
    if (b) return this.rule_block(b);
    const end = this.firstOfType(parent, "end_kw") ?? parent;
    return node("s-block", makePyretPos(this.file, this.zeroWidthStart(end)), list([]));
  }

  // fun-header semantics: tyParams/args/returnAnn (bad-args -> still emit; reference errors anyway)
  private headerOf(fh: TSNode): { tyParams: Value; args: Value; returnAnn: Value } {
    const tp = this.firstOfType(fh, "ty_params");
    const argsN = this.firstOfType(fh, "args", "bad_args")!;
    return { tyParams: this.tyParamsList(tp), args: this.argsList(argsN), returnAnn: this.returnAnnVal(fh) };
  }

  rule_fun_expr(n: TSNode): Node {
    const nm = this.firstOfType(n, "name")!;
    const fh = this.firstOfType(n, "fun_header")!;
    const h = this.headerOf(fh);
    const body = this.firstOfType(n, "block");
    const [cl, cb] = this.whereVals(n);
    return node("s-fun", this.loc(n), this.symbol(nm), h.tyParams, h.args, h.returnAnn,
      this.docVal(n), this.blockOr(body, n), cl, cb, bool(this.isBlocky(n)));
  }
  rule_lambda_expr(n: TSNode): Node {
    const fh = this.firstOfType(n, "fun_header")!;
    const h = this.headerOf(fh);
    const body = this.firstOfType(n, "block");
    const [cl, cb] = this.whereVals(n);
    return node("s-lam", this.loc(n), str(""), h.tyParams, h.args, h.returnAnn,
      this.docVal(n), this.blockOr(body, n), cl, cb, bool(this.isBlocky(n)));
  }
  rule_method_expr(n: TSNode): Node {
    const fh = this.firstOfType(n, "fun_header")!;
    const h = this.headerOf(fh);
    const body = this.firstOfType(n, "block");
    const [cl, cb] = this.whereVals(n);
    return node("s-method", this.loc(n), str(""), h.tyParams, h.args, h.returnAnn,
      this.docVal(n), this.blockOr(body, n), cl, cb, bool(this.isBlocky(n)));
  }

  // ============================================================
  // Data
  // ============================================================
  rule_data_expr(n: TSNode): Node {
    const nm = this.firstOfType(n, "name")!;
    const tp = this.firstOfType(n, "ty_params");
    const variants = this.kidsOfType(n, "first_data_variant", "data_variant");
    const sharing = this.firstOfType(n, "data_sharing");
    const sharedMembers: Value = sharing ? this.rule_data_sharing(sharing) : list([]);
    const [cl, cb] = this.whereVals(n);
    return node("s-data", this.loc(n), this.symbol(nm), this.tyParamsList(tp), list([]),
      this.trList(variants), sharedMembers, cl, cb);
  }
  rule_data_sharing(n: TSNode): Value {
    const fields = this.firstOfType(n, "fields");
    return fields ? this.rule_fields(fields) : list([]);
  }
  rule_data_with(n: TSNode): Value {
    const fields = this.firstOfType(n, "fields");
    return fields ? this.rule_fields(fields) : list([]);
  }
  rule_data_variant(n: TSNode): Node {
    const k = this.kids(n); // [bar, (name | variant_constructor), data_with?]
    const second = k[1];
    const dw = this.firstOfType(n, "data_with");
    const withMembers: Value = dw ? this.rule_data_with(dw) : list([]);
    if (second.type === "name") {
      return node("s-singleton-variant", this.loc(n), this.symbol(second), withMembers);
    }
    const c = this.variantConstructor(second);
    return node("s-variant", this.loc(n), c.pos, c.name, c.args, withMembers);
  }
  rule_first_data_variant(n: TSNode): Node {
    const k = this.kids(n); // [(name | variant_constructor), data_with?]
    const first = k[0];
    const dw = this.firstOfType(n, "data_with");
    const withMembers: Value = dw ? this.rule_data_with(dw) : list([]);
    if (first.type === "name") {
      return node("s-singleton-variant", this.loc(n), this.symbol(first), withMembers);
    }
    const c = this.variantConstructor(first);
    return node("s-variant", this.loc(n), c.pos, c.name, c.args, withMembers);
  }
  private variantConstructor(vc: TSNode): { pos: Value; name: Value; args: Value } {
    const nm = this.firstOfType(vc, "name")!;
    const vm = this.firstOfType(vc, "variant_members")!;
    return { pos: this.loc(vc) as unknown as Value, name: this.symbol(nm), args: this.rule_variant_members(vm) };
  }
  rule_variant_members(n: TSNode): Value {
    return list(this.kidsOfType(n, "variant_member").map((m) => this.tr(m)));
  }
  rule_variant_member(n: TSNode): Node {
    const ref = this.hasType(n, "ref_kw");
    const b = this.firstOfType(n, "binding")!;
    const kind = ref ? node("s-mutable") : node("s-normal");
    return node("s-variant-member", this.loc(n), kind, this.tr(b));
  }

  // ============================================================
  // Checks / tests
  // ============================================================
  rule_check_expr(n: TSNode): Node {
    const first = this.kids(n)[0];
    const isCheck = first.type === "checkcolon" || first.type === "check_kw";
    const body = this.firstOfType(n, "block");
    const strTok = this.firstOfType(n, "string");
    const name: Value = strTok ? some(this.strVal(strTok)) : none;
    return node("s-check", this.loc(n), name, this.blockOr(body, n), bool(isCheck));
  }
  rule_check_test(n: TSNode): Value {
    const k = this.kids(n);
    if (k.length === 1) return this.tr(k[0]);
    if (k.length === 2) {
      return node("s-check-test", this.loc(n), this.tr(k[1]), none, this.tr(k[0]), none, none);
    }
    let refinement: Value = none;
    let right: Value = none;
    if (k[2].type === "percent") {
      // left op % ( refinement ) right [because cause]
      const binops = this.kidsOfType(n, "binop_expr"); // [left, refinement, right, (cause?)]
      refinement = some(this.tr(binops[1]));
      right = some(this.tr(binops[2]));
    } else if (k[2].type === "because_kw") {
      refinement = none; right = none;
    } else {
      right = some(this.tr(k[2]));
    }
    let because: Value = none;
    if (k[k.length - 2].type === "because_kw") because = some(this.tr(k[k.length - 1]));
    return node("s-check-test", this.loc(n), this.tr(k[1]), refinement, this.tr(k[0]), right, because);
  }
  rule_check_op(n: TSNode): Value { return this.checkOp(n); }
  rule_check_op_postfix(n: TSNode): Value { return this.checkOp(n); }
  private checkOp(n: TSNode): Value {
    const l = this.loc(n);
    const t = this.kids(n)[0].text.trim();
    switch (t) {
      case "is": return node("s-op-is", l);
      case "is-roughly": return node("s-op-is-roughly", l);
      case "is==": return node("s-op-is-op", l, str("op=="));
      case "is=~": return node("s-op-is-op", l, str("op=~"));
      case "is<=>": return node("s-op-is-op", l, str("op<=>"));
      case "is-not": return node("s-op-is-not", l);
      case "is-not-roughly": return node("s-op-is-not-roughly", l);
      case "is-not==": return node("s-op-is-not-op", l, str("op=="));
      case "is-not=~": return node("s-op-is-not-op", l, str("op=~"));
      case "is-not<=>": return node("s-op-is-not-op", l, str("op<=>"));
      case "satisfies": return node("s-op-satisfies", l);
      case "violates": return node("s-op-satisfies-not", l);
      case "raises": return node("s-op-raises", l);
      case "raises-other-than": return node("s-op-raises-other", l);
      case "does-not-raise": return node("s-op-raises-not", l);
      case "raises-satisfies": return node("s-op-raises-satisfies", l);
      case "raises-violates": return node("s-op-raises-violates", l);
      default: throw new Error("Unknown check op: " + t);
    }
  }

  // ============================================================
  // Operators / application / access
  // ============================================================
  rule_binop_expr(n: TSNode): Value {
    const k = this.kids(n);
    if (k.length === 1) return this.tr(k[0]);
    let left = this.tr(k[0]);
    for (let i = 1; i + 1 < k.length; i += 2) {
      const opNode = k[i];
      const rightNode = k[i + 1];
      left = node("s-op", this.loc2(k[0], rightNode), this.loc(opNode), str(this.binopName(opNode)), left, this.tr(rightNode));
    }
    return left;
  }
  private binopName(opNode: TSNode): string {
    const tok = opNode.childCount > 0 ? this.kids(opNode)[0] : opNode;
    const t = tok.text.trim();
    const m: Record<string, string> = {
      "+": "op+", "-": "op-", "*": "op*", "/": "op/", "$": "op^", "^": "op^",
      "<=": "op<=", "<": "op<", ">=": "op>=", ">": "op>", "==": "op==", "=~": "op=~",
      "<=>": "op<=>", "<>": "op<>", and: "opand", or: "opor",
    };
    if (!(t in m)) throw new Error("Unknown operator: " + t);
    return m[t];
  }

  rule_app_expr(n: TSNode): Node {
    const k = this.kids(n);
    // bad unary `f (x)` -> reference throws; those files are reference-errors. Emit anyway.
    return node("s-app", this.loc(n), this.tr(k[0]), this.tr(k[1]));
  }
  rule_app_args(n: TSNode): Value {
    // app-args: PARENNOSPACE opt-comma-binops RPAREN ; opt-comma-binops inlined, but
    // comma-binops remains a node wrapping the binop-expr items.
    const cb = this.firstOfType(n, "comma_binops");
    if (cb) return this.rule_comma_binops(cb);
    return list(this.kidsOfType(n, "binop_expr").map((b) => this.tr(b)));
  }
  rule_comma_binops(n: TSNode): Value {
    return list(this.kidsOfType(n, "binop_expr").map((b) => this.tr(b)));
  }

  rule_dot_expr(n: TSNode): Node {
    const k = this.kids(n);
    const fieldName = this.kidsOfType(n, "name")[0];
    return node("s-dot", this.loc(n), this.tr(k[0]), this.symbol(fieldName));
  }
  rule_get_bang_expr(n: TSNode): Node {
    const k = this.kids(n);
    const fieldName = this.kidsOfType(n, "name")[0];
    return node("s-get-bang", this.loc(n), this.tr(k[0]), this.symbol(fieldName));
  }
  rule_bracket_expr(n: TSNode): Node {
    const k = this.kids(n);
    const inner = this.firstOfType(n, "binop_expr")!;
    return node("s-bracket", this.loc(n), this.tr(k[0]), this.tr(inner));
  }
  rule_extend_expr(n: TSNode): Node {
    const k = this.kids(n);
    const fields = this.firstOfType(n, "fields")!;
    return node("s-extend", this.loc(n), this.tr(k[0]), this.rule_fields(fields));
  }
  rule_update_expr(n: TSNode): Node {
    const k = this.kids(n);
    const fields = this.firstOfType(n, "fields")!;
    return node("s-update", this.loc(n), this.tr(k[0]), this.rule_fields(fields));
  }
  rule_inst_expr(n: TSNode): Node {
    const k = this.kids(n);
    return node("s-instantiate", this.loc(n), this.tr(k[0]), list(this.kidsOfType(n, "ann").map((a) => this.tr(a))));
  }
  rule_tuple_get(n: TSNode): Node {
    const k = this.kids(n);
    const numTok = this.firstOfType(n, "number")!;
    return node("s-tuple-get", this.loc(n), this.tr(k[0]), num(normalizeNumber(numTok.text)), this.loc(numTok));
  }

  // ============================================================
  // Literals / ids / parens
  // ============================================================
  rule_id_expr(n: TSNode): Node {
    const tok = this.kids(n)[0];
    return node("s-id", this.loc(n), this.nameNode(tok));
  }
  rule_num_expr(n: TSNode): Node {
    return node("s-num", this.loc(n), num(normalizeNumber(this.kids(n)[0].text)));
  }
  rule_frac_expr(n: TSNode): Node {
    const [a, b] = this.kids(n)[0].text.split("/");
    return node("s-frac", this.loc(n), num(normalizeInt(a)), num(normalizeInt(b)));
  }
  rule_rfrac_expr(n: TSNode): Node {
    const [a, b] = this.kids(n)[0].text.substring(1).split("/");
    return node("s-rfrac", this.loc(n), num(normalizeInt(a)), num(normalizeInt(b)));
  }
  rule_bool_expr(n: TSNode): Node { return node("s-bool", this.loc(n), bool(n.text.trim() === "true")); }
  rule_string_expr(n: TSNode): Node { return node("s-str", this.loc(n), this.strVal(this.kids(n)[0])); }
  rule_template_expr(n: TSNode): Node { return node("s-template", this.loc(n)); }
  rule_paren_expr(n: TSNode): Node { return node("s-paren", this.loc(n), this.tr(this.firstOfType(n, "binop_expr")!)); }
  rule_user_block_expr(n: TSNode): Node {
    const body = this.firstOfType(n, "block");
    return node("s-user-block", this.loc(n), this.blockOr(body, n));
  }

  // ============================================================
  // Objects / tuples / construct
  // ============================================================
  rule_obj_expr(n: TSNode): Node {
    const fields = this.firstOfType(n, "obj_fields");
    return node("s-obj", this.loc(n), fields ? this.rule_obj_fields(fields) : list([]));
  }
  rule_obj_fields(n: TSNode): Value { return list(this.kidsOfType(n, "obj_field").map((f) => this.tr(f))); }
  rule_fields(n: TSNode): Value { return list(this.kidsOfType(n, "field").map((f) => this.tr(f))); }
  rule_key(n: TSNode): Value {
    const k = this.kids(n)[0];
    return k.type === "name" ? this.symbol(k) : this.strVal(k);
  }
  rule_field(n: TSNode): Node {
    const k = this.kids(n);
    if (!this.hasType(n, "method_kw")) {
      return node("s-data-field", this.loc(n), this.tr(this.firstOfType(n, "key")!), this.tr(k[k.length - 1]));
    }
    return this.methodField(n);
  }
  rule_obj_field(n: TSNode): Node {
    if (this.hasType(n, "method_kw")) return this.methodField(n);
    if (this.hasType(n, "ref_kw")) {
      const key = this.firstOfType(n, "key")!;
      const ann = this.firstOfType(n, "ann");
      const value = this.kids(n)[this.kids(n).length - 1];
      return node("s-mutable-field", this.loc(n), this.tr(key), ann ? this.tr(ann) : node("a-blank"), this.tr(value));
    }
    const key = this.firstOfType(n, "key")!;
    const value = this.kids(n)[this.kids(n).length - 1];
    return node("s-data-field", this.loc(n), this.tr(key), this.tr(value));
  }
  private methodField(n: TSNode): Node {
    const key = this.firstOfType(n, "key")!;
    const fh = this.firstOfType(n, "fun_header")!;
    const h = this.headerOf(fh);
    const body = this.firstOfType(n, "block");
    const [cl, cb] = this.whereVals(n);
    return node("s-method-field", this.loc(n), this.tr(key), h.tyParams, h.args, h.returnAnn,
      this.docVal(n), this.blockOr(body, n), cl, cb, bool(this.isBlocky(n)));
  }
  rule_tuple_expr(n: TSNode): Node {
    return node("s-tuple", this.loc(n), this.rule_tuple_fields(this.firstOfType(n, "tuple_fields")!));
  }
  rule_tuple_fields(n: TSNode): Value { return list(this.kidsOfType(n, "binop_expr").map((b) => this.tr(b))); }
  rule_construct_expr(n: TSNode): Node {
    const mod = this.firstOfType(n, "construct_modifier");
    const modVal: Value = mod && this.hasType(mod, "lazy_kw") ? node("s-construct-lazy") : node("s-construct-normal");
    // construct-expr: LBRACK modifier binop-expr COLON trailing-opt-comma-binops RBRACK
    // The constructor is a direct binop-expr child; the elements live in a comma_binops node.
    const constructorNode = this.kidsOfType(n, "binop_expr")[0];
    const cb = this.firstOfType(n, "comma_binops");
    const elems: Value = cb ? this.rule_comma_binops(cb) : list([]);
    return node("s-construct", this.loc(n), modVal, this.tr(constructorNode), elems);
  }

  // ============================================================
  // If / cases / for
  // ============================================================
  rule_if_expr(n: TSNode): Node {
    const test = this.firstOfType(n, "binop_expr")!;
    const blocks = this.kidsOfType(n, "block");
    const hasElse = this.hasType(n, "elsecolon");
    const body = blocks[0];
    const firstBranch = node("s-if-branch", this.loc2(test, body), this.tr(test), this.rule_block(body));
    const elseIfs = this.kidsOfType(n, "else_if").map((e) => this.tr(e));
    const branches = list([firstBranch, ...elseIfs]);
    if (hasElse) {
      const elseBlock = blocks[blocks.length - 1];
      return node("s-if-else", this.loc(n), branches, this.rule_block(elseBlock), bool(this.isBlocky(n)));
    }
    return node("s-if", this.loc(n), branches, bool(this.isBlocky(n)));
  }
  rule_else_if(n: TSNode): Node {
    const test = this.firstOfType(n, "binop_expr")!;
    const body = this.firstOfType(n, "block")!;
    return node("s-if-branch", this.loc(n), this.tr(test), this.rule_block(body));
  }
  rule_if_pipe_expr(n: TSNode): Node {
    const branches = this.kidsOfType(n, "if_pipe_branch").map((b) => this.tr(b));
    const hasElse = this.hasType(n, "otherwisecolon");
    if (hasElse) {
      const elseBlock = this.kidsOfType(n, "block").pop()!;
      return node("s-if-pipe-else", this.loc(n), list(branches), this.rule_block(elseBlock), bool(this.isBlocky(n)));
    }
    return node("s-if-pipe", this.loc(n), list(branches), bool(this.isBlocky(n)));
  }
  rule_if_pipe_branch(n: TSNode): Node {
    const test = this.firstOfType(n, "binop_expr")!;
    const body = this.firstOfType(n, "block")!;
    return node("s-if-pipe-branch", this.loc(n), this.tr(test), this.rule_block(body));
  }
  rule_cases_expr(n: TSNode): Node {
    const ann = this.firstOfType(n, "ann")!;
    const val = this.firstOfType(n, "binop_expr")!;
    const branches = this.kidsOfType(n, "cases_branch").map((b) => this.tr(b));
    const hasElse = this.hasType(n, "else_kw");
    const blocky = bool(this.isBlocky(n));
    if (hasElse) {
      const elseBlock = this.kidsOfType(n, "block").pop()!;
      return node("s-cases-else", this.loc(n), this.tr(ann), this.tr(val), list(branches), this.rule_block(elseBlock), blocky);
    }
    return node("s-cases", this.loc(n), this.tr(ann), this.tr(val), list(branches), blocky);
  }
  rule_cases_branch(n: TSNode): Node {
    const nm = this.firstOfType(n, "name")!;
    const argsN = this.firstOfType(n, "cases_args");
    const body = this.firstOfType(n, "block")!;
    if (!argsN) {
      return node("s-singleton-cases-branch", this.loc(n), this.loc(nm), this.symbol(nm), this.rule_block(body));
    }
    return node("s-cases-branch", this.loc(n), this.loc2(nm, argsN), this.symbol(nm), this.rule_cases_args(argsN), this.rule_block(body));
  }
  rule_cases_args(n: TSNode): Value { return list(this.kidsOfType(n, "cases_binding").map((b) => this.tr(b))); }
  rule_cases_binding(n: TSNode): Node {
    const ref = this.hasType(n, "ref_kw");
    const b = this.firstOfType(n, "binding")!;
    const kind = ref ? node("s-cases-bind-ref") : node("s-cases-bind-normal");
    return node("s-cases-bind", this.loc(n), kind, this.tr(b));
  }
  rule_for_expr(n: TSNode): Node {
    const iter = this.firstOfType(n, "expr")!;
    const binds = this.kidsOfType(n, "for_bind").map((b) => this.tr(b));
    const ra = this.returnAnnVal(n);
    const body = this.firstOfType(n, "block");
    return node("s-for", this.loc(n), this.tr(iter), list(binds), ra, this.blockOr(body, n), bool(this.isBlocky(n)));
  }
  rule_for_bind(n: TSNode): Node {
    const b = this.firstOfType(n, "binding")!;
    const e = this.firstOfType(n, "binop_expr")!;
    return node("s-for-bind", this.loc(n), this.tr(b), this.tr(e));
  }

  // ============================================================
  // Bindings
  // ============================================================
  rule_name_binding(n: TSNode): Node {
    const shadows = this.hasType(n, "shadow_kw");
    const nameTok = this.firstOfType(n, "name")!;
    const annNode = this.firstOfType(n, "ann");
    return node("s-bind", this.loc(n), bool(shadows), this.nameNode(nameTok), annNode ? this.tr(annNode) : node("a-blank"));
  }
  rule_tuple_binding(n: TSNode): Node {
    // tuple-binding: LBRACE (binding SEMI)* binding [SEMI] RBRACE [AS name-binding]
    // The tuple FIELDS are `binding` nodes; the optional AS target is a separate
    // `name_binding` node (NOT wrapped in `binding`).
    const binds = this.kidsOfType(n, "binding");
    const asName = this.firstOfType(n, "name_binding");
    const optAs: Value = asName ? some(this.tr(asName)) : none;
    return node("s-tuple-bind", this.loc(n), list(binds.map((b) => this.tr(b))), optAs);
  }

  // ============================================================
  // Annotations
  // ============================================================
  rule_name_ann(n: TSNode): Node {
    const tok = this.kids(n)[0];
    if (tok.text === "Any") return node("a-any", this.loc(n));
    return node("a-name", this.loc(n), this.nameNode(tok));
  }
  rule_record_ann(n: TSNode): Node {
    // record-ann: LBRACE trailing-opt-comma-ann-field RBRACE ; trailing inlined, but
    // comma-ann-field remains a node wrapping the ann-fields.
    const cf = this.firstOfType(n, "comma_ann_field");
    const fields: Value = cf ? this.rule_comma_ann_field(cf) : list(this.kidsOfType(n, "ann_field").map((f) => this.tr(f)));
    return node("a-record", this.loc(n), fields);
  }
  rule_ann_field(n: TSNode): Node {
    const nm = this.firstOfType(n, "name")!;
    const ann = this.firstOfType(n, "ann")!;
    return node("a-field", this.loc(n), this.symbol(nm), this.tr(ann));
  }
  rule_tuple_ann(n: TSNode): Node {
    return node("a-tuple", this.loc(n), list(this.kidsOfType(n, "ann").map((a) => this.tr(a))));
  }
  rule_app_ann(n: TSNode): Node {
    // app-ann: (name-ann|dot-ann) LANGLE comma-anns (RANGLE|GT)
    const k = this.kids(n);
    const ca = this.firstOfType(n, "comma_anns");
    const args: Value = ca ? this.rule_comma_anns(ca) : list(this.kidsOfType(n, "ann").map((a) => this.tr(a)));
    return node("a-app", this.loc(n), this.tr(k[0]), args);
  }
  rule_pred_ann(n: TSNode): Node {
    const k = this.kids(n);
    const idexpr = this.firstOfType(n, "id_expr")!;
    return node("a-pred", this.loc(n), this.tr(k[0]), this.tr(idexpr));
  }
  rule_dot_ann(n: TSNode): Node {
    const names = this.kidsOfType(n, "name");
    return node("a-dot", this.loc(n), this.nameNode(names[0]), this.symbol(names[1]));
  }
  rule_arrow_ann(n: TSNode): Node {
    const args = this.firstOfType(n, "arrow_ann_args");
    const ret = this.firstOfType(n, "ann")!;
    if (!args) return node("a-arrow", this.loc(n), list([]), this.tr(ret), bool(true));
    const a = this.arrowArgs(args);
    if (a.named) return node("a-arrow-argnames", this.loc(n), a.args, this.tr(ret), bool(true));
    return node("a-arrow", this.loc(n), a.args, this.tr(ret), bool(true));
  }
  rule_noparen_arrow_ann(n: TSNode): Node {
    const args = this.firstOfType(n, "arrow_ann_args");
    const ret = this.firstOfType(n, "ann")!;
    if (!args) return node("a-arrow", this.loc(n), list([]), this.tr(ret), bool(false));
    const a = this.arrowArgs(args);
    if (a.named) return node("a-arrow-argnames", this.loc(n), a.args, this.tr(ret), bool(false));
    return node("a-arrow", this.loc(n), a.args, this.tr(ret), bool(false));
  }
  private arrowArgs(n: TSNode): { args: Value; named: boolean } {
    const cf = this.firstOfType(n, "comma_ann_field");
    if (cf) return { args: this.rule_comma_ann_field(cf), named: true };
    const ca = this.firstOfType(n, "comma_anns");
    return { args: ca ? this.rule_comma_anns(ca) : list([]), named: false };
  }
  rule_comma_anns(n: TSNode): Value { return list(this.kidsOfType(n, "ann").map((a) => this.tr(a))); }
  rule_comma_ann_field(n: TSNode): Value { return list(this.kidsOfType(n, "ann_field").map((f) => this.tr(f))); }

  // ============================================================
  // let-expr families / reactor / tables
  // ============================================================
  rule_letrec_expr(n: TSNode): Node {
    const binds = this.kidsOfType(n, "let_expr").map((le) => {
      const k = this.kids(le);
      return node("s-letrec-bind", this.loc(le), this.tr(k[0]), this.tr(k[2]));
    });
    const body = this.firstOfType(n, "block");
    return node("s-letrec", this.loc(n), list(binds), this.blockOr(body, n), bool(this.isBlocky(n)));
  }
  rule_multi_let_expr(n: TSNode): Node {
    const binds = this.kidsOfType(n, "let_binding").map((lb) => {
      const inner = this.kids(lb)[0];
      const k = this.kids(inner);
      if (inner.type === "var_expr") return node("s-var-bind", this.loc(inner), this.tr(k[1]), this.tr(k[3]));
      return node("s-let-bind", this.loc(inner), this.tr(k[0]), this.tr(k[2]));
    });
    const body = this.firstOfType(n, "block");
    return node("s-let-expr", this.loc(n), list(binds), this.blockOr(body, n), bool(this.isBlocky(n)));
  }
  rule_reactor_expr(n: TSNode): Node {
    const fields = this.firstOfType(n, "fields");
    return node("s-reactor", this.loc(n), fields ? this.rule_fields(fields) : list([]));
  }

  rule_table_expr(n: TSNode): Node {
    const headers = this.firstOfType(n, "table_headers");
    const rows = this.firstOfType(n, "table_rows");
    return node("s-table", this.loc(n), this.headersList(headers), this.rowsList(rows));
  }
  private headersList(h: TSNode | null): Value {
    if (!h) return list([]);
    const out: Value[] = [];
    for (const c of this.kids(h)) {
      if (c.type === "list_table_header") out.push(this.rule_table_header(this.firstOfType(c, "table_header")!));
      else if (c.type === "table_header") out.push(this.rule_table_header(c));
    }
    return list(out);
  }
  rule_table_header(n: TSNode): Node {
    const nm = this.firstOfType(n, "name")!;
    const ann = this.firstOfType(n, "ann");
    return node("s-field-name", this.loc(n), this.symbol(nm), ann ? this.tr(ann) : node("a-blank"));
  }
  private rowsList(r: TSNode | null): Value {
    if (!r) return list([]);
    const out: Value[] = [];
    for (const c of this.kids(r)) if (c.type === "table_row") out.push(this.rule_table_row(c));
    return list(out);
  }
  rule_table_row(n: TSNode): Node {
    const items = this.firstOfType(n, "table_items");
    return node("s-table-row", this.loc(n), this.itemsList(items));
  }
  private itemsList(it: TSNode | null): Value {
    if (!it) return list([]);
    const out: Value[] = [];
    for (const c of this.kids(it)) {
      if (c.type === "list_table_item") out.push(this.tr(this.firstOfType(c, "binop_expr")!));
      else if (c.type === "binop_expr") out.push(this.tr(c));
    }
    return list(out);
  }
  rule_load_table_expr(n: TSNode): Node {
    const headers = this.firstOfType(n, "table_headers");
    const specsNode = this.firstOfType(n, "load_table_specs");
    const specs: Value = specsNode ? this.loadSpecs(specsNode) : list([]);
    return node("s-load-table", this.loc(n), this.headersList(headers), specs);
  }
  private loadSpecs(n: TSNode): Value {
    return list(this.kidsOfType(n, "load_table_spec").map((s) => this.tr(s)));
  }
  rule_load_table_spec(n: TSNode): Node {
    if (this.hasType(n, "sanitize_kw")) {
      const nm = this.firstOfType(n, "name")!;
      const e = this.firstOfType(n, "expr")!;
      return node("s-sanitize", this.loc(n), this.nameNode(nm), this.tr(e));
    }
    return node("s-table-src", this.loc(n), this.tr(this.firstOfType(n, "expr")!));
  }

  // TABLE-op expr [USING binding (COMMA binding)*] COLON ... END
  private columnBinds(n: TSNode): Node {
    const table = this.firstOfType(n, "expr")!;
    const binds = this.kidsOfType(n, "binding");
    const last = binds.length > 0 ? binds[binds.length - 1] : table;
    return node("s-column-binds", this.loc2(table, last), list(binds.map((b) => this.tr(b))), this.tr(table));
  }
  rule_table_extend(n: TSNode): Node {
    const fields = this.firstOfType(n, "table_extend_fields")!;
    return node("s-table-extend", this.loc(n), this.columnBinds(n), this.extendFields(fields));
  }
  rule_table_update(n: TSNode): Node {
    const fields = this.firstOfType(n, "obj_fields");
    return node("s-table-update", this.loc(n), this.columnBinds(n), fields ? this.rule_obj_fields(fields) : list([]));
  }
  rule_table_filter(n: TSNode): Node {
    const pred = this.kidsOfType(n, "binop_expr").pop()!;
    return node("s-table-filter", this.loc(n), this.columnBinds(n), this.tr(pred));
  }
  rule_table_select(n: TSNode): Node {
    const cols = this.kidsOfType(n, "name").map((t) => this.nameNode(t));
    const table = this.firstOfType(n, "expr")!;
    return node("s-table-select", this.loc(n), list(cols), this.tr(table));
  }
  rule_table_extract(n: TSNode): Node {
    const nm = this.firstOfType(n, "name")!;
    const table = this.firstOfType(n, "expr")!;
    return node("s-table-extract", this.loc(n), this.nameNode(nm), this.tr(table));
  }
  rule_table_order(n: TSNode): Node {
    const table = this.firstOfType(n, "expr")!;
    const orders = this.kidsOfType(n, "column_order").map((c) => this.tr(c));
    return node("s-table-order", this.loc(n), this.tr(table), list(orders));
  }
  rule_column_order(n: TSNode): Node {
    const nm = this.firstOfType(n, "name")!;
    const dir = this.hasType(n, "ascending_kw") ? node("ASCENDING") : node("DESCENDING");
    return node("s-column-sort", this.loc(n), this.nameNode(nm), dir);
  }
  private extendFields(n: TSNode): Value {
    return list(this.kidsOfType(n, "table_extend_field").map((f) => this.tr(f)));
  }
  rule_table_extend_field(n: TSNode): Node {
    const key = this.firstOfType(n, "key")!;
    const ann = this.firstOfType(n, "ann");
    const annVal: Value = ann ? this.tr(ann) : node("a-blank");
    if (this.hasType(n, "of_kw")) {
      // key [:: ann] COLON expr OF NAME  -> s-table-extend-reducer
      const e = this.firstOfType(n, "expr")!;
      const nm = this.kidsOfType(n, "name").pop()!;
      return node("s-table-extend-reducer", this.loc(n), this.tr(key), this.tr(e), this.nameNode(nm), annVal);
    }
    const value = this.firstOfType(n, "binop_expr")!;
    return node("s-table-extend-field", this.loc(n), this.tr(key), this.tr(value), annVal);
  }
}

// ---- numeric/string normalization ----
// Reproduce num_tostring(makeNumberFromString(x)). Exact decimals/integers => reduced
// rational or integer; roughnums "~..." keep the marker.
export function normalizeNumber(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("~")) {
    // Roughnum: a JS double; num_tostring renders "~" + String(double) (decimal, not fraction).
    return "~" + String(Number(t.slice(1)));
  }
  return exactDecimalToString(t);
}
export function normalizeInt(raw: string): string {
  return BigInt(raw.trim()).toString();
}

function gcdBig(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) { [a, b] = [b, a % b]; }
  return a;
}
// Parse an exact decimal/integer/exponent into a reduced "num" or "num/den" string,
// matching js-numbers' toString of an exact rational.
function exactDecimalToString(t: string): string {
  if (/^[+-]?\d+$/.test(t)) return BigInt(t).toString();
  const m = /^([+-]?)(\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(t);
  if (!m) return t;
  const sign = m[1] === "-" ? -1n : 1n;
  const intPart = m[2] || "0";
  const frac = m[3] || "";
  const exp = m[4] ? parseInt(m[4], 10) : 0;
  let numer = BigInt(intPart + frac);
  let denom = 10n ** BigInt(frac.length);
  if (exp > 0) numer *= 10n ** BigInt(exp);
  else if (exp < 0) denom *= 10n ** BigInt(-exp);
  numer *= sign;
  const g = gcdBig(numer, denom) || 1n;
  numer /= g; denom /= g;
  if (denom === 1n) return numer.toString();
  return numer.toString() + "/" + denom.toString();
}

export function decodePyretString(raw: string): string {
  // The tokenizer applies fixEscapes to the WHOLE token (incl. delimiters), then
  // parse-pyret slices the delimiters: triple-backtick -> slice(3,-3).trim(); else slice(1,-1).
  const fixed = fixEscapes(raw);
  if (raw.startsWith("```")) return fixed.slice(3, -3).trim();
  if (fixed.length >= 2) return fixed.slice(1, -1);
  return fixed;
}
function fixEscapes(s: string): string {
  const escapes = /^([\s\S]*?)\\([\\"'nrt]|u[0-9A-Fa-f]{1,4}|x[0-9A-Fa-f]{1,2}|[0-7]{1,3}|[\r\n]{1,2})/;
  let ret = "";
  let match = escapes.exec(s);
  while (match !== null) {
    const esc = match[2];
    ret += match[1];
    s = s.slice(match[0].length);
    if (esc === "\n" || esc === "\r" || esc === "\n\r" || esc === "\r\n") { /* line continuation */ }
    else if (esc === "n") ret += "\n";
    else if (esc === "r") ret += "\r";
    else if (esc === "t") ret += "\t";
    else if (esc === '"') ret += '"';
    else if (esc === "'") ret += "'";
    else if (esc === "\\") ret += "\\";
    else if (esc[0] === "u") ret += String.fromCharCode(parseInt(esc.slice(1), 16));
    else if (esc[0] === "x") ret += String.fromCharCode(parseInt(esc.slice(1), 16));
    else ret += String.fromCharCode(parseInt(esc, 8));
    match = escapes.exec(s);
  }
  ret += s;
  return ret;
}
