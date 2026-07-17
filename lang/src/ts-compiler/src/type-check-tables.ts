/*
  Type checking for tables (NEW; not part of the original .arr port).

  Design summary (see docs in repo for the full write-up):

  - Table/row schemas are a new Type variant, t-schema: an *ordered* list of
    (column name, sort) pairs. Written in annotations with record syntax:
        Table<{name :: String, age :: Number}>
    The record annotation's field order is preserved.
  - Table<S>, Row<S>, Col<S, T> are ordinary t-app forms over the builtin
    Table/Row/Col names, so the existing forall/existential machinery gives
    schema polymorphism for free:
        fun get-col<S, T>(t :: Table<S>, c :: Col<S, T>) -> List<T>: ...
  - Col<S, T> is the type of column-name strings that (a) name a column of S
    and (b) whose column sort is a subtype of T. Col<S> = Col<S, Any>.
    Col<S, T> <: String always. A string *literal* checked against Col<S, T>
    is verified by looking it up in S (only possible when S is a concrete
    t-schema; membership in an abstract schema is rejected).
  - The s-table* syntax forms are type checked here directly (they reach the
    checker because desugaring of tables moves to desugar-post-tc when the
    type checker is on).
  - Methods on Table<S>/Row<S> values get schema-aware field types
    (tableFieldType/rowFieldType). Methods whose *result schema* depends on
    column-name argument values (add-column, build-column, transform-column,
    drop, rename-column, select-columns) are given precise types at
    application sites when the names are string literals
    (maybeTableMethodApp); otherwise they soundly fall back to the opaque
    Table type.

  Soundness stance: schema types describe the exact column names/order of the
  runtime value; column sorts are enforced statically and (for table literals)
  dynamically via the per-cell annotation checks the lowering inserts. Like
  the rest of Pyret's type checker (e.g. the Number in List<Number>), sorts of
  data from external sources (load-table) are trusted from annotations and
  checked dynamically only via sanitizers if present. Operations on tables
  with *abstract* schemas can still raise runtime errors (e.g. add-column of
  an existing column) exactly where static verification is impossible; no
  type confusion results.
*/

import * as A from './ast';
import * as TS from './type-structs';
import * as TCS from './type-check-structs';
import * as C from './compile-errors';
import * as TD from './type-defaults';
import { Loc } from './srcloc';
import { InternalCompilerError } from './shared';
// NOTE: circular import; only used at call time (safe under CommonJS lazily).
import * as TC from './type-check';

type Type = TS.Type;
type Expr = A.Expr;
type Context = TCS.TypingContext;
type AnyTypingResult = TCS.AnyTypingResult;

const newExistential = TS.newExistential;
const newTypeVar = TS.newTypeVar;

function tArrow(args: Type[], ret: Type, l: Loc): Type {
  return new TS.TArrow(args, ret, l, false);
}

function schemaOf(t: TS.TApp): Type {
  return t.args[0];
}

function describeSchema(schema: Type): string {
  return schema.toString();
}

function colsOf(schema: Type): TS.SchemaColumn[] | undefined {
  if (TS.isTSchema(schema)) { return schema.columns; }
  return undefined;
}

function noSuchColumn(opName: string, col: string, schema: Type, l: Loc): TCS.TypingError {
  const available = TS.isTSchema(schema)
    ? ' The table\'s columns are: ' + schema.columns.map(([n]) => '`' + n + '`').join(', ') + '.'
    : '';
  return new TCS.TypingError([new C.CantTypecheck(
    'the column `' + col + '` (used in ' + opName + ') is not a column of the table, which has type Table<'
    + describeSchema(schema) + '>.' + available, l)]);
}

function noSuchColumnFold<T>(opName: string, col: string, schema: Type, l: Loc): TCS.FoldErrors<T> {
  const available = TS.isTSchema(schema)
    ? ' The table\'s columns are: ' + schema.columns.map(([n]) => '`' + n + '`').join(', ') + '.'
    : '';
  return new TCS.FoldErrors<T>([new C.CantTypecheck(
    'the column `' + col + '` (used in ' + opName + ') is not a column of the table, which has type Table<'
    + describeSchema(schema) + '>.' + available, l)]);
}

// ---------------------------------------------------------------------------
// Annotations: Table<{...}> / Row<{...}> / Col<S> / Col<S, T>
// ---------------------------------------------------------------------------

// Convert the annotation used as the schema argument of Table/Row/Col into a
// schema-position type: a t-schema (ordered), or a type variable/existential.
function annToSchemaType(argAnn: A.Ann, parentL: Loc, context: Context): TCS.AnyFoldResult<Type> {
  if (argAnn.$name === 'a-record') {
    const l = argAnn.l;
    const seen = new Set<string>();
    return TCS.foldrFoldResult<A.AField, TS.SchemaColumn[]>((field, ctx, columns) => {
      if (seen.has(field.name)) {
        return new TCS.FoldErrors<TS.SchemaColumn[]>([new C.CantTypecheck(
          'duplicate column name `' + field.name + '` in table schema annotation', l)]);
      }
      seen.add(field.name);
      return TC.toType(field.ann, ctx).bind((maybeTyp, ctx2) => {
        if (maybeTyp === undefined) {
          return new TCS.FoldErrors<TS.SchemaColumn[]>([new C.CantTypecheck(
            'no annotation provided for column `' + field.name + '` in table schema annotation', l)]);
        }
        return new TCS.FoldResult<TS.SchemaColumn[]>([[field.name, maybeTyp] as TS.SchemaColumn, ...columns], ctx2);
      });
    }, argAnn.fields, context, []).bind((columns, ctx) =>
      new TCS.FoldResult<Type>(new TS.TSchema(columns, l, false), ctx));
  } else {
    return TC.toType(argAnn, context).bind((maybeTyp, ctx) => {
      if (maybeTyp === undefined) {
        return new TCS.FoldErrors<Type>([new C.CantTypecheck(
          'no annotation provided for the schema argument of a table type', parentL)]);
      }
      const typ = maybeTyp;
      switch (typ.$name) {
        case 't-schema':
        case 't-var':
        case 't-existential':
          return new TCS.FoldResult<Type>(typ, ctx);
        case 't-record': {
          // A record type alias used as a schema: reinterpret in field order.
          const columns: TS.SchemaColumn[] = [];
          for (const key of typ.fields.keys()) {
            columns.push([key, typ.fields.get(key)!]);
          }
          return new TCS.FoldResult<Type>(new TS.TSchema(columns, typ.l, false), ctx);
        }
        default:
          return new TCS.FoldErrors<Type>([new C.CantTypecheck(
            'the schema argument of a Table/Row/Col type must be a record of column annotations '
            + '(for example Table<{name :: String, age :: Number}>) or a type variable, but got ' + typ.toString(),
            parentL)]);
      }
    });
  }
}

// Handle a-app annotations whose head resolved to the builtin Table/Row/Col.
// Returns null when the annotation is not table-related.
export function tableAppAnnToType(onto: Type, inAnn: A.AApp, context: Context): TCS.AnyFoldResult<Type | undefined> | null {
  const l = inAnn.l;
  if (TS.isTableName(onto) || TS.isRowName(onto)) {
    const what = TS.isTableName(onto) ? 'Table' : 'Row';
    if (inAnn.args.length !== 1) {
      return new TCS.FoldErrors<Type | undefined>([new C.CantTypecheck(
        what + '<...> takes exactly one argument (a schema), but got ' + String(inAnn.args.length), l)]);
    }
    return annToSchemaType(inAnn.args[0], l, context).bind((schema, ctx) =>
      new TCS.FoldResult<Type | undefined>(new TS.TApp(onto.setLoc(l), [schema], l, false), ctx));
  } else if (TS.isColTypeName(onto)) {
    if (inAnn.args.length !== 1 && inAnn.args.length !== 2) {
      return new TCS.FoldErrors<Type | undefined>([new C.CantTypecheck(
        'Col<...> takes a schema and an optional column sort, but got ' + String(inAnn.args.length) + ' arguments', l)]);
    }
    return annToSchemaType(inAnn.args[0], l, context).bind((schema, ctx) => {
      if (inAnn.args.length === 1) {
        return new TCS.FoldResult<Type | undefined>(TS.tColApp(schema, new TS.TTop(l, false), l), ctx);
      }
      return TC.toType(inAnn.args[1], ctx).bind((maybeBound, ctx2) => {
        if (maybeBound === undefined) {
          return new TCS.FoldErrors<Type | undefined>([new C.CantTypecheck(
            'no annotation provided for the sort argument of Col<...>', l)]);
        }
        return new TCS.FoldResult<Type | undefined>(TS.tColApp(schema, maybeBound, l), ctx2);
      });
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Field (method) types for Table<S> and Row<S>
// ---------------------------------------------------------------------------

function tListApp(t: Type): Type { return TD.tListApp(t); }

// Field types available on Table<S> / Row<S> (schema may be abstract);
// definitions live in type-defaults so the constraint solver can use them.
export function tableFieldType(tblType: TS.TApp, fieldName: string, l: Loc): Type | undefined {
  return TD.tableAppFieldType(tblType, fieldName, l);
}

export function rowFieldType(rowType: TS.TApp, fieldName: string, l: Loc): Type | undefined {
  return TD.rowAppFieldType(rowType, fieldName, l);
}

// ---------------------------------------------------------------------------
// Name-dependent method applications: t.add-column("c", vs) etc.
// ---------------------------------------------------------------------------

const NAME_DEPENDENT_METHODS = new Set([
  'add-column', 'build-column', 'transform-column', 'drop', 'rename-column', 'select-columns',
]);

export function isNameDependentTableMethod(fieldName: string): boolean {
  return NAME_DEPENDENT_METHODS.has(fieldName);
}

function strLit(e: Expr): string | undefined {
  return e.$name === 's-str' ? e.s : undefined;
}

// Match the post-desugar shape of `[list: "a", "b", ...]` to extract string
// literals: SApp(SPrimApp('getMakerN', [...]), elts) or
// SApp(SPrimApp('getMaker', [...]), [SArray(elts)]).
function extractStringListLiteral(e: Expr): string[] | undefined {
  if (e.$name !== 's-app') { return undefined; }
  const fn = e._fun;
  if (fn.$name !== 's-prim-app' || !fn._fun.startsWith('getMaker')) { return undefined; }
  let elts: Expr[];
  if (fn._fun === 'getMaker') {
    if (e.args.length !== 1 || e.args[0].$name !== 's-array') { return undefined; }
    elts = (e.args[0] as A.SArray).values;
  } else {
    elts = e.args;
  }
  const out: string[] = [];
  for (const elt of elts) {
    const s = strLit(elt);
    if (s === undefined) { return undefined; }
    out.push(s);
  }
  return out;
}

// Handle an application `obj.<method>(args)` where objType is Table<S> with a
// concrete schema and <method>'s result schema depends on column-name
// argument values. `newFun` is the (re-typed) s-dot expression. Returns null
// to decline (caller falls back to the generic field-type path).
export function maybeTableMethodApp(
  appLoc: Loc,
  method: string,
  objType: TS.TApp,
  args: Expr[],
  recreate: (exprs: Expr[]) => Expr,
  context: Context,
): AnyTypingResult | null {
  const schema = schemaOf(objType);
  const columns = colsOf(schema);
  if (columns === undefined) {
    // Abstract schema: no static result schema is expressible for these; the
    // generic fallback (opaque Table) stays sound.
    return null;
  }
  const l = appLoc;
  const tableOf = (cols: TS.SchemaColumn[]): Type => TS.tTableApp(new TS.TSchema(cols, l, false), l);
  const rowT: Type = TS.tRowApp(schema, l);

  const wrongArity = (): AnyTypingResult =>
    new TCS.TypingError([new C.IncorrectNumberOfArgs(recreate(args), tableFieldType(objType, method, l)!)]);

  switch (method) {
    case 'add-column': {
      if (args.length !== 2) { return wrongArity(); }
      const col = strLit(args[0]);
      if (col === undefined) { return null; }
      if (TS.schemaLookup(columns, col) !== undefined) {
        return new TCS.TypingError([new C.CantTypecheck(
          'add-column: the column `' + col + '` already exists in the table, which has type Table<'
          + describeSchema(schema) + '>', l)]);
      }
      const elt = newExistential(l, false);
      const ctx = context.addVariable(elt);
      return TC.checking(args[0], TS.tString(l), false, ctx).bind((newC, _t, ctx2) =>
        TC.checking(args[1], tListApp(elt), false, ctx2).bind((newVs, _t2, ctx3) =>
          new TCS.TypingResult(recreate([newC, newVs]),
            tableOf([...columns, [col, elt]]), ctx3)));
    }
    case 'build-column': {
      if (args.length !== 2) { return wrongArity(); }
      const col = strLit(args[0]);
      if (col === undefined) { return null; }
      if (TS.schemaLookup(columns, col) !== undefined) {
        return new TCS.TypingError([new C.CantTypecheck(
          'build-column: the column `' + col + '` already exists in the table, which has type Table<'
          + describeSchema(schema) + '>', l)]);
      }
      const elt = newExistential(l, false);
      const ctx = context.addVariable(elt);
      return TC.checking(args[0], TS.tString(l), false, ctx).bind((newC, _t, ctx2) =>
        TC.checking(args[1], tArrow([rowT], elt, l), false, ctx2).bind((newF, _t2, ctx3) =>
          new TCS.TypingResult(recreate([newC, newF]),
            tableOf([...columns, [col, elt]]), ctx3)));
    }
    case 'transform-column': {
      if (args.length !== 2) { return wrongArity(); }
      const col = strLit(args[0]);
      if (col === undefined) { return null; }
      const sort = TS.schemaLookup(columns, col);
      if (sort === undefined) { return noSuchColumn('transform-column', col, schema, l); }
      const out = newExistential(l, false);
      const ctx = context.addVariable(out);
      return TC.checking(args[0], TS.tString(l), false, ctx).bind((newC, _t, ctx2) =>
        TC.checking(args[1], tArrow([sort], out, l), false, ctx2).bind((newF, _t2, ctx3) =>
          new TCS.TypingResult(recreate([newC, newF]),
            tableOf(columns.map(([n, t]): TS.SchemaColumn => n === col ? [n, out] : [n, t])), ctx3)));
    }
    case 'drop': {
      if (args.length !== 1) { return wrongArity(); }
      const col = strLit(args[0]);
      if (col === undefined) { return null; }
      if (TS.schemaLookup(columns, col) === undefined) { return noSuchColumn('drop', col, schema, l); }
      return TC.checking(args[0], TS.tString(l), false, context).bind((newC, _t, ctx) =>
        new TCS.TypingResult(recreate([newC]),
          tableOf(columns.filter(([n]) => n !== col)), ctx));
    }
    case 'rename-column': {
      if (args.length !== 2) { return wrongArity(); }
      const oldName = strLit(args[0]);
      const newName = strLit(args[1]);
      if (oldName === undefined || newName === undefined) { return null; }
      if (TS.schemaLookup(columns, oldName) === undefined) { return noSuchColumn('rename-column', oldName, schema, l); }
      if (TS.schemaLookup(columns, newName) !== undefined) {
        return new TCS.TypingError([new C.CantTypecheck(
          'rename-column: the column `' + newName + '` already exists in the table, which has type Table<'
          + describeSchema(schema) + '>', l)]);
      }
      return TC.checking(args[0], TS.tString(l), false, context).bind((newC1, _t, ctx) =>
        TC.checking(args[1], TS.tString(l), false, ctx).bind((newC2, _t2, ctx2) =>
          new TCS.TypingResult(recreate([newC1, newC2]),
            tableOf(columns.map(([n, t]): TS.SchemaColumn => n === oldName ? [newName, t] : [n, t])), ctx2)));
    }
    case 'select-columns': {
      if (args.length !== 1) { return wrongArity(); }
      const names = extractStringListLiteral(args[0]);
      if (names === undefined) { return null; }
      if (names.length === 0) {
        return new TCS.TypingError([new C.CantTypecheck('select-columns requires at least one column', l)]);
      }
      const selected: TS.SchemaColumn[] = [];
      const seen = new Set<string>();
      for (const n of names) {
        if (seen.has(n)) {
          return new TCS.TypingError([new C.CantTypecheck('select-columns: duplicate column `' + n + '`', l)]);
        }
        seen.add(n);
        const sort = TS.schemaLookup(columns, n);
        if (sort === undefined) { return noSuchColumn('select-columns', n, schema, l); }
        selected.push([n, sort]);
      }
      return TC.checking(args[0], tListApp(TS.tString(l)), false, context).bind((newArg, _t, ctx) =>
        new TCS.TypingResult(recreate([newArg]), tableOf(selected), ctx));
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// getBracket (r["col"]) on rows
// ---------------------------------------------------------------------------

// Types s-prim-app getBracket. Bracket access is supported on Row values
// (precisely, via the schema) and loosely on opaque Rows; anything else is an
// error (previously ALL bracket accesses were unbound-id errors in typed code).
export function synthesisGetBracket(e: A.SPrimApp, context: Context): AnyTypingResult {
  const obj = e.args[1];
  const key = e.args[2];
  return TC.synthesis(obj, false, context).bind((newObj, objType, ctx): AnyTypingResult => {
    const resolved = TCS.resolveAlias(objType, ctx);
    const recreate = (newKey: Expr): Expr =>
      new A.SPrimApp(e.l, e._fun, [e.args[0], newObj, newKey], e.appInfo);
    if (TS.isRowApp(resolved)) {
      const schema = schemaOf(resolved);
      const columns = colsOf(schema);
      const keyLit = strLit(key);
      if (columns !== undefined && keyLit !== undefined) {
        const sort = TS.schemaLookup(columns, keyLit);
        if (sort === undefined) { return noSuchColumn('row bracket access', keyLit, schema, e.l); }
        return new TCS.TypingResult(recreate(key), sort.setLoc(e.l), ctx);
      }
      // Non-literal (or abstract-schema) key: it must be a Col of the same
      // schema; the result is the column-sort bound.
      const bound = newExistential(e.l, false);
      const ctx2 = ctx.addVariable(bound);
      return TC.checking(key, TS.tColApp(schema, bound, e.l), false, ctx2).bind((newKey, _t, ctx3) =>
        new TCS.TypingResult(recreate(newKey), bound.setLoc(e.l), ctx3));
    }
    if ((resolved.$name === 't-name' && TS.isRowName(resolved))
        || resolved.$name === 't-top' || resolved.$name === 't-existential') {
      // Opaque row (or unknown receiver): sound but imprecise.
      return TC.checking(key, TS.tString(e.l), false, ctx).bind((newKey, _t, ctx2) =>
        new TCS.TypingResult(recreate(newKey), new TS.TTop(e.l, false), ctx2));
    }
    return new TCS.TypingError([new C.CantTypecheck(
      'bracket access (r["..."]) is only supported on Row values in type-checked code, but this receiver has type '
      + resolved.toString(), e.l)]);
  });
}

// Application interception for `obj.<method>(args)` at s-app sites: does the
// receiver synthesis once, applies the name-dependent rule if possible, and
// returns null to decline (the caller then re-runs the generic path).
export function tryTableMethodApp(appLoc: Loc, _fun: A.SDot, args: Expr[], context: Context): AnyTypingResult | null {
  const probe = TC.synthesis(_fun.obj, false, context);
  if (!(probe instanceof TCS.TypingResult)) {
    // The receiver itself fails to type check; let the generic path surface it.
    return null;
  }
  const newObj = probe.ast;
  const objType = probe.typ;
  const ctx = probe.outContext;
  const resolved = TCS.resolveAlias(objType, ctx);
  if (!TS.isTableApp(resolved)) { return null; }
  const newFun = new A.SDot(_fun.l, newObj, _fun.field);
  const recreate = (exprs: Expr[]): Expr => new A.SApp(appLoc, newFun, exprs);
  return maybeTableMethodApp(appLoc, _fun.field, resolved, args, recreate, ctx);
}

// ---------------------------------------------------------------------------
// Synthesis for the s-table* syntax forms
// ---------------------------------------------------------------------------

// Bind `using`-clause column binds into the context; returns the bound
// [key, name] pairs so they can be removed afterwards.
function bindColumnBinds(
  binds: A.Bind[],
  columns: TS.SchemaColumn[] | undefined, // undefined = table with unknown schema
  schema: Type | undefined,
  opName: string,
  context: Context,
): TCS.AnyFoldResult<[string, string][]> {
  return TCS.foldrFoldResult<A.Bind, [string, string][]>((bind, ctx, acc) => {
    if (bind.$name !== 's-bind') {
      return new TCS.FoldErrors<[string, string][]>([new C.CantTypecheck(
        'only simple column bindings are supported in ' + opName, bind.l)]);
    }
    const colName = (bind.id as A.SAtom).base;
    let colSort: Type | undefined;
    if (columns !== undefined) {
      colSort = TS.schemaLookup(columns, colName);
      if (colSort === undefined) {
        return noSuchColumnFold<[string, string][]>(opName, colName, schema!, bind.l);
      }
    } else {
      colSort = new TS.TTop(bind.l, false);
    }
    return TC.toType(bind.ann, ctx).bind((maybeAnnTyp, ctx2) => {
      let boundType = colSort!;
      let ctx3 = ctx2;
      if (maybeAnnTyp !== undefined) {
        // Same direction as ordinary let-bindings: the column sort must
        // satisfy the annotation; the variable is bound at the annotation.
        ctx3 = ctx3.addConstraint(colSort!, maybeAnnTyp);
        boundType = maybeAnnTyp;
      }
      ctx3 = ctx3.addBinding(bind.id.key(), boundType.setLoc(bind.l));
      return new TCS.FoldResult<[string, string][]>([[bind.id.key(), colName] as [string, string], ...acc], ctx3);
    });
  }, binds, context, []);
}

function removeBindings(keys: [string, string][], context: Context): Context {
  let ctx = context;
  for (const [key] of keys) {
    ctx = ctx.removeBinding(key);
  }
  return ctx;
}

// The operand of a table operation: either Table<S> (schema known/abstract),
// or the opaque Table (legacy), or something else (error).
type TableOperand =
  | { kind: 'schema'; typ: TS.TApp; schema: Type; columns: TS.SchemaColumn[] | undefined }
  | { kind: 'opaque' };

function classifyTableOperand(typ: Type, context: Context, opLoc: Loc): TableOperand | TCS.TypingError {
  const resolved = TCS.resolveAlias(typ, context);
  if (TS.isTableApp(resolved)) {
    const schema = schemaOf(resolved);
    return { kind: 'schema', typ: resolved, schema, columns: colsOf(schema) };
  }
  if (resolved.$name === 't-name' && TS.isTableName(resolved)) {
    return { kind: 'opaque' };
  }
  if (resolved.$name === 't-top' || resolved.$name === 't-existential' || resolved.$name === 't-bot') {
    // An unannotated/unknown operand: constrain it to be a table, proceed opaquely.
    return { kind: 'opaque' };
  }
  return new TCS.TypingError([new C.IncorrectType(resolved.toString(), resolved.l, 'a Table', opLoc)]);
}

export function synthesisTableExpr(e: Expr, context: Context): AnyTypingResult {
  switch (e.$name) {
    case 's-table': return synthesisTableLiteral(e, context);
    case 's-load-table': return synthesisLoadTable(e, context);
    case 's-table-extend': return synthesisTableExtend(e, context);
    case 's-table-update': return synthesisTableUpdate(e, context);
    case 's-table-select': return synthesisTableSelect(e, context);
    case 's-table-order': return synthesisTableOrder(e, context);
    case 's-table-extract': return synthesisTableExtract(e, context);
    case 's-table-filter': return synthesisTableFilter(e, context);
    default:
      throw new InternalCompilerError('synthesisTableExpr got non-table expression ' + e.$name);
  }
}

// table: c1 [:: A1], c2 row: e11, e12 ... end
function synthesisTableLiteral(e: A.STable, context: Context): AnyTypingResult {
  const l = e.l;
  const headers = e.headers;
  const seen = new Set<string>();
  for (const h of headers) {
    if (seen.has(h.name)) {
      return new TCS.TypingError([new C.CantTypecheck('duplicate column name `' + h.name + '` in table literal', l)]);
    }
    seen.add(h.name);
  }
  for (const row of e.rows) {
    if (row.elems.length !== headers.length) {
      return new TCS.TypingError([new C.CantTypecheck(
        'table row has ' + String(row.elems.length) + ' cells but the table has '
        + String(headers.length) + ' columns', row.l)]);
    }
  }
  // Header annotations (may be undefined per column).
  return TCS.mapFoldResult((h: A.FieldName, ctx: Context) =>
    TC.toType(h.ann, ctx).bind((t, ctx2) => new TCS.FoldResult<Type | undefined>(t, ctx2)),
  headers, context).typingBind((annTypes, ctx0) => {
    // Type cells row-major: annotated columns are checked, others synthesized.
    const cellTypes: Type[][] = headers.map(() => []);
    return TCS.foldrFoldResult<A.TableRow, A.TableRow[]>((row, ctxR, doneRows) => {
      let acc: TCS.AnyFoldResult<Expr[]> = new TCS.FoldResult<Expr[]>([], ctxR);
      for (let i = row.elems.length - 1; i >= 0; i--) {
        const cell = row.elems[i];
        const annT = annTypes[i];
        const colIdx = i;
        acc = acc.bind((cells, ctxC) => {
          if (annT !== undefined) {
            return TC.checking(cell, annT.setLoc(cell.l), false, ctxC).foldBind((newCell, _t, ctxC2) =>
              new TCS.FoldResult<Expr[]>([newCell, ...cells], ctxC2));
          } else {
            return TC.synthesis(cell, false, ctxC).foldBind((newCell, cellT, ctxC2) => {
              cellTypes[colIdx].push(cellT);
              return new TCS.FoldResult<Expr[]>([newCell, ...cells], ctxC2);
            });
          }
        });
      }
      return acc.bind((cells, ctxDone) =>
        new TCS.FoldResult<A.TableRow[]>([new A.STableRow(row.l, cells), ...doneRows], ctxDone));
    }, e.rows, ctx0, []).typingBind((newRows, ctx1) => {
      // Compute each column's sort: annotation, meet of cells, or fresh.
      let ctx = ctx1;
      const finish = (sorts: Type[]): AnyTypingResult => {
        const schema = new TS.TSchema(headers.map((h, i) => [h.name, sorts[i]] as TS.SchemaColumn), l, false);
        return new TCS.TypingResult(new A.STable(l, headers, newRows), TS.tTableApp(schema, l), ctx);
      };
      const sorts: Type[] = [];
      let pending: TCS.AnyFoldResult<Type[]> = new TCS.FoldResult<Type[]>([], ctx);
      headers.forEach((h, i) => {
        pending = pending.bind((acc, ctxA) => {
          const annT = annTypes[i];
          if (annT !== undefined) {
            return new TCS.FoldResult<Type[]>([...acc, annT], ctxA);
          } else if (e.rows.length === 0) {
            const exists = newExistential(h.l, true);
            return new TCS.FoldResult<Type[]>([...acc, exists], ctxA.addVariable(exists));
          } else {
            return TC.meetBranchTypes(cellTypes[i], h.l, ctxA).bind((sort, ctxB) =>
              new TCS.FoldResult<Type[]>([...acc, sort.setLoc(h.l)], ctxB));
          }
        });
      });
      return pending.typingBind((allSorts, ctxF) => {
        ctx = ctxF;
        sorts.push(...allSorts);
        return finish(sorts);
      });
    });
  });
}

// load-table: c1 :: A1, ... source: e [sanitize c using s] end
function synthesisLoadTable(e: A.SLoadTable, context: Context): AnyTypingResult {
  const l = e.l;
  const headers = e.headers;
  const headerNames = new Set(headers.map((h) => h.name));
  return TCS.mapFoldResult((h: A.FieldName, ctx: Context) =>
    TC.toType(h.ann, ctx).bind((t, ctx2): TCS.AnyFoldResult<TS.SchemaColumn> => {
      if (t === undefined) {
        return new TCS.FoldErrors<TS.SchemaColumn>([new C.CantTypecheck(
          'in type-checked code, every column of a load-table expression needs an annotation '
          + '(the data source is not known statically); add one like `' + h.name + ' :: Number`, or use '
          + 'a sanitizer together with an annotation to also enforce it dynamically', h.l)]);
      }
      return new TCS.FoldResult<TS.SchemaColumn>([h.name, t], ctx2);
    }), headers, context).typingBind((columns, ctx0) => {
    // Check the source/sanitizer expressions (loosely; the loader protocol is
    // dynamically checked, and sanitizer names must be columns).
    return TCS.foldrFoldResult<A.LoadTableSpec, A.LoadTableSpec[]>((spec, ctx, acc) => {
      switch (spec.$name) {
        case 's-table-src':
          return TC.checking(spec.src, new TS.TTop(spec.l, false), false, ctx).foldBind((newSrc, _t, ctx2) =>
            new TCS.FoldResult<A.LoadTableSpec[]>([new A.STableSrc(spec.l, newSrc), ...acc], ctx2));
        case 's-sanitize': {
          const colName = spec.name.toname();
          if (!headerNames.has(colName)) {
            return new TCS.FoldErrors<A.LoadTableSpec[]>([new C.CantTypecheck(
              'sanitize: `' + colName + '` is not a column of this load-table expression', spec.l)]);
          }
          return TC.checking(spec.sanitizer, new TS.TTop(spec.l, false), false, ctx).foldBind((newSan, _t, ctx2) =>
            new TCS.FoldResult<A.LoadTableSpec[]>([new A.SSanitize(spec.l, spec.name, newSan), ...acc], ctx2));
        }
        default:
          throw new InternalCompilerError('Unknown LoadTableSpec in synthesisLoadTable');
      }
    }, e.spec, ctx0, []).typingBind((newSpecs, ctx1) => {
      const schema = new TS.TSchema(columns, l, false);
      return new TCS.TypingResult(new A.SLoadTable(l, headers, newSpecs), TS.tTableApp(schema, l), ctx1);
    });
  });
}

// extend t using c1, ...: n1: e1, n2: r of c1 end
function synthesisTableExtend(e: A.STableExtend, context: Context): AnyTypingResult {
  const l = e.l;
  const cb = e.columnBinds;
  return TC.synthesis(cb.table, false, context).bind((newTable, tblType, ctx0): AnyTypingResult => {
    const operand = classifyTableOperand(tblType, ctx0, cb.table.l);
    if (operand instanceof TCS.TypingError) { return operand; }
    const columns = operand.kind === 'schema' ? operand.columns : undefined;
    const schema = operand.kind === 'schema' ? operand.schema : undefined;

    // With a known schema, check extension names for duplicates/clashes.
    if (columns !== undefined) {
      const newNames = new Set<string>();
      for (const ext of e.extensions) {
        if (newNames.has(ext.name)) {
          return new TCS.TypingError([new C.CantTypecheck('duplicate new column `' + ext.name + '` in extend', ext.l)]);
        }
        newNames.add(ext.name);
        if (TS.schemaLookup(columns, ext.name) !== undefined) {
          return new TCS.TypingError([new C.CantTypecheck(
            'extend: the column `' + ext.name + '` already exists in the table, which has type Table<'
            + describeSchema(schema!) + '>', ext.l)]);
        }
      }
    }

    return bindColumnBinds(cb.binds, columns, schema, 'extend', ctx0).typingBind((bound, ctx1) => {
      const boundColNames = new Map(bound.map(([key, name]) => [name, key] as [string, string]));
      // Type each extension.
      return TCS.foldrFoldResult<A.TableExtendField, [A.TableExtendField, TS.SchemaColumn][]>((ext, ctx, acc) => {
        switch (ext.$name) {
          case 's-table-extend-field': {
            return TC.toType(ext.ann, ctx).bind((maybeAnnT, ctx2) => {
              if (maybeAnnT !== undefined) {
                return TC.checking(ext.value, maybeAnnT.setLoc(ext.value.l), false, ctx2).foldBind((newV, _t, ctx3) =>
                  new TCS.FoldResult<[A.TableExtendField, TS.SchemaColumn][]>(
                    [[new A.STableExtendField(ext.l, ext.name, newV, ext.ann), [ext.name, maybeAnnT]], ...acc], ctx3));
              }
              return TC.synthesis(ext.value, false, ctx2).foldBind((newV, vT, ctx3) =>
                new TCS.FoldResult<[A.TableExtendField, TS.SchemaColumn][]>(
                  [[new A.STableExtendField(ext.l, ext.name, newV, ext.ann), [ext.name, vT]], ...acc], ctx3));
            });
          }
          case 's-table-extend-reducer': {
            const colName = ext.col.toname();
            if (!boundColNames.has(colName)) {
              return new TCS.FoldErrors<[A.TableExtendField, TS.SchemaColumn][]>([new C.CantTypecheck(
                'the reducer for `' + ext.name + '` refers to column `' + colName
                + '`, which is not bound in the `using` clause of this extend expression', ext.l)]);
            }
            const colSortLookup = columns !== undefined ? TS.schemaLookup(columns, colName) : new TS.TTop(ext.l, false);
            const colSort = colSortLookup === undefined ? new TS.TTop(ext.l, false) : colSortLookup;
            const accT = newExistential(ext.l, false);
            const outT = newExistential(ext.l, false);
            let ctx2 = ctx.addVariable(accT).addVariable(outT);
            const pair = new TS.TTuple([accT, outT], ext.l, false);
            const reducerType = new TS.TRecord(new Map<string, Type>([
              ['one', tArrow([colSort], pair, ext.l)],
              ['reduce', tArrow([accT, colSort], pair, ext.l)],
            ]), ext.l, false);
            return TC.checking(ext.reducer, reducerType, false, ctx2).foldBind((newR, _t, ctx3) => {
              return TC.toType(ext.ann, ctx3).bind((maybeAnnT, ctx4) => {
                let ctx5 = ctx4;
                let sort: Type = outT;
                if (maybeAnnT !== undefined) {
                  ctx5 = ctx5.addConstraint(outT, maybeAnnT);
                  sort = maybeAnnT;
                }
                return new TCS.FoldResult<[A.TableExtendField, TS.SchemaColumn][]>(
                  [[new A.STableExtendReducer(ext.l, ext.name, newR, ext.col, ext.ann), [ext.name, sort]], ...acc], ctx5);
              });
            });
          }
          default:
            throw new InternalCompilerError('Unknown TableExtendField');
        }
      }, e.extensions, ctx1, []).typingBind((extPairs, ctx2) => {
        const ctx3 = removeBindings(bound, ctx2);
        const newExts = extPairs.map(([ext]) => ext);
        const newCols = extPairs.map(([, col]) => col);
        const newAst = new A.STableExtend(l, new A.SColumnBinds(cb.l, cb.binds, newTable), newExts);
        if (columns !== undefined) {
          const schema2 = new TS.TSchema([...columns, ...newCols], l, false);
          return new TCS.TypingResult(newAst, TS.tTableApp(schema2, l), ctx3);
        }
        return new TCS.TypingResult(newAst, TS.tTable(l), ctx3);
      });
    });
  });
}

// transform t using c1, ...: n1: e1, ... end
function synthesisTableUpdate(e: A.STableUpdate, context: Context): AnyTypingResult {
  const l = e.l;
  const cb = e.columnBinds;
  return TC.synthesis(cb.table, false, context).bind((newTable, tblType, ctx0): AnyTypingResult => {
    const operand = classifyTableOperand(tblType, ctx0, cb.table.l);
    if (operand instanceof TCS.TypingError) { return operand; }
    const columns = operand.kind === 'schema' ? operand.columns : undefined;
    const schema = operand.kind === 'schema' ? operand.schema : undefined;

    if (columns !== undefined) {
      const updated = new Set<string>();
      for (const u of e.updates) {
        if (updated.has(u.name)) {
          return new TCS.TypingError([new C.CantTypecheck('duplicate updated column `' + u.name + '` in transform', u.l)]);
        }
        updated.add(u.name);
        if (TS.schemaLookup(columns, u.name) === undefined) {
          return noSuchColumn('transform', u.name, schema!, u.l);
        }
      }
    }

    return bindColumnBinds(cb.binds, columns, schema, 'transform', ctx0).typingBind((bound, ctx1) => {
      return TCS.foldrFoldResult<A.Member, [A.Member, TS.SchemaColumn][]>((u, ctx, acc) => {
        if (u.$name !== 's-data-field') {
          return new TCS.FoldErrors<[A.Member, TS.SchemaColumn][]>([new C.CantTypecheck(
            'only simple field updates are supported in transform', u.l)]);
        }
        return TC.synthesis(u.value, false, ctx).foldBind((newV, vT, ctx2) =>
          new TCS.FoldResult<[A.Member, TS.SchemaColumn][]>(
            [[new A.SDataField(u.l, u.name, newV), [u.name, vT]], ...acc], ctx2));
      }, e.updates as A.Member[], ctx1, []).typingBind((updatePairs, ctx2) => {
        const ctx3 = removeBindings(bound, ctx2);
        const newUpdates = updatePairs.map(([u]) => u);
        const newAst = new A.STableUpdate(l, new A.SColumnBinds(cb.l, cb.binds, newTable), newUpdates);
        if (columns !== undefined) {
          const updatedSorts = new Map(updatePairs.map(([, col]) => col));
          const schema2 = new TS.TSchema(columns.map(([n, t]): TS.SchemaColumn =>
            updatedSorts.has(n) ? [n, updatedSorts.get(n)!] : [n, t]), l, false);
          return new TCS.TypingResult(newAst, TS.tTableApp(schema2, l), ctx3);
        }
        return new TCS.TypingResult(newAst, TS.tTable(l), ctx3);
      });
    });
  });
}

// select c1, c2 from t end
function synthesisTableSelect(e: A.STableSelect, context: Context): AnyTypingResult {
  const l = e.l;
  return TC.synthesis(e.table, false, context).bind((newTable, tblType, ctx0): AnyTypingResult => {
    const operand = classifyTableOperand(tblType, ctx0, e.table.l);
    if (operand instanceof TCS.TypingError) { return operand; }
    if (operand.kind === 'schema' && operand.columns !== undefined) {
      const selected: TS.SchemaColumn[] = [];
      const seen = new Set<string>();
      for (const c of e.columns) {
        const name = (c as A.SName).s;
        if (seen.has(name)) {
          return new TCS.TypingError([new C.CantTypecheck('select: duplicate column `' + name + '`', l)]);
        }
        seen.add(name);
        const sort = TS.schemaLookup(operand.columns, name);
        if (sort === undefined) { return noSuchColumn('select', name, operand.schema, l); }
        selected.push([name, sort]);
      }
      return new TCS.TypingResult(new A.STableSelect(l, e.columns, newTable),
        TS.tTableApp(new TS.TSchema(selected, l, false), l), ctx0);
    }
    if (operand.kind === 'schema') {
      // Abstract schema: cannot compute the selected sub-schema statically.
      return new TCS.TypingResult(new A.STableSelect(l, e.columns, newTable), TS.tTable(l), ctx0);
    }
    return new TCS.TypingResult(new A.STableSelect(l, e.columns, newTable), TS.tTable(l), ctx0);
  });
}

// order t: c ascending, ... end
function synthesisTableOrder(e: A.STableOrder, context: Context): AnyTypingResult {
  const l = e.l;
  return TC.synthesis(e.table, false, context).bind((newTable, tblType, ctx0): AnyTypingResult => {
    const operand = classifyTableOperand(tblType, ctx0, e.table.l);
    if (operand instanceof TCS.TypingError) { return operand; }
    if (operand.kind === 'schema' && operand.columns !== undefined) {
      for (const o of e.ordering) {
        const name = (o.column as A.SName).s;
        if (TS.schemaLookup(operand.columns, name) === undefined) {
          return noSuchColumn('order', name, operand.schema, o.l);
        }
      }
      return new TCS.TypingResult(new A.STableOrder(l, newTable, e.ordering), operand.typ.setLoc(l), ctx0);
    }
    if (operand.kind === 'schema') {
      return new TCS.TypingResult(new A.STableOrder(l, newTable, e.ordering), operand.typ.setLoc(l), ctx0);
    }
    return new TCS.TypingResult(new A.STableOrder(l, newTable, e.ordering), TS.tTable(l), ctx0);
  });
}

// extract c from t end
function synthesisTableExtract(e: A.STableExtract, context: Context): AnyTypingResult {
  const l = e.l;
  return TC.synthesis(e.table, false, context).bind((newTable, tblType, ctx0): AnyTypingResult => {
    const operand = classifyTableOperand(tblType, ctx0, e.table.l);
    if (operand instanceof TCS.TypingError) { return operand; }
    const name = (e.column as A.SName).s;
    if (operand.kind === 'schema' && operand.columns !== undefined) {
      const sort = TS.schemaLookup(operand.columns, name);
      if (sort === undefined) { return noSuchColumn('extract', name, operand.schema, l); }
      return new TCS.TypingResult(new A.STableExtract(l, e.column, newTable), tListApp(sort).setLoc(l), ctx0);
    }
    if (operand.kind === 'schema') {
      return new TCS.TypingError([new C.CantTypecheck(
        'extract needs a table with a concrete schema to determine the column type; '
        + 'this table\'s schema is abstract here. Use .get-column with a Col<...>-typed name instead.', l)]);
    }
    return new TCS.TypingResult(new A.STableExtract(l, e.column, newTable), tListApp(new TS.TTop(l, false)), ctx0);
  });
}

// sieve t using c1, ...: pred end
function synthesisTableFilter(e: A.STableFilter, context: Context): AnyTypingResult {
  const l = e.l;
  const cb = e.columnBinds;
  return TC.synthesis(cb.table, false, context).bind((newTable, tblType, ctx0): AnyTypingResult => {
    const operand = classifyTableOperand(tblType, ctx0, cb.table.l);
    if (operand instanceof TCS.TypingError) { return operand; }
    const columns = operand.kind === 'schema' ? operand.columns : undefined;
    const schema = operand.kind === 'schema' ? operand.schema : undefined;
    return bindColumnBinds(cb.binds, columns, schema, 'sieve', ctx0).typingBind((bound, ctx1) =>
      TC.checking(e.predicate, TS.tBoolean(e.predicate.l), false, ctx1).bind((newPred, _t, ctx2) => {
        const ctx3 = removeBindings(bound, ctx2);
        const newAst = new A.STableFilter(l, new A.SColumnBinds(cb.l, cb.binds, newTable), newPred);
        const resultType = operand.kind === 'schema' ? operand.typ.setLoc(l) : TS.tTable(l);
        return new TCS.TypingResult(newAst, resultType, ctx3);
      }));
  });
}
