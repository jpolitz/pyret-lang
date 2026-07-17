/*
  Ported from: src/arr/compiler/desugar-post-tc.arr
  See CONVENTIONS.md.

  Additionally (NEW, not in the .arr original): when the type checker is on,
  desugar.ts preserves the s-table* syntax forms so the checker can type them;
  they are lowered here instead, producing exactly the same code the pre-TC
  lowering produces in untyped mode. Col<...> annotations (a type-checker-only
  concept) are rewritten to String for the dynamic contract check.
*/

import * as A from './ast';
import * as D from './desugar';
import * as C from './compile-structs';
import { DefaultMapVisitor } from './ast-visitors';
import { Loc, dummyLoc } from './srcloc';
import { partition } from './shared';

export const mkId = D.mkId;
export const noBranchesExn = D.noBranchesExn;
export const flatPrimApp = new A.PrimAppInfoC(false);

export function noCasesExn(l: Loc, val: A.Expr): A.Expr {
  return new A.SPrimApp(l, 'throwNoCasesMatched', [new A.SSrcloc(l, l), val], flatPrimApp);
}

class DesugarVisitor extends DefaultMapVisitor {
  sTemplate(node: A.STemplate): A.Expr {
    return new A.SPrimApp(node.l, 'throwUnfinishedTemplate', [new A.SSrcloc(node.l, node.l)], flatPrimApp);
  }
  sCasesElse(node: A.SCasesElse): A.Expr {
    const l = node.l;
    const name = A.globalNames.makeAtom('cases');
    const typCompiled = node.typ.visit(this);
    const valExp = node.val.visit(this);
    const valId = new A.SId(l, name);
    return new A.SLetExpr(l, [new A.SLetBind(l, new A.SBind(l, false, name, typCompiled), valExp)],
      new A.SCasesElse(l, A.aBlank, valId, node.branches.map((b) => b.visit(this)),
        node._else.visit(this), true), false);
  }
  sCases(node: A.SCases): A.Expr {
    const l = node.l;
    const name = A.globalNames.makeAtom('cases');
    const typCompiled = node.typ.visit(this);
    const valExp = node.val.visit(this);
    const valId = new A.SId(l, name);
    return new A.SLetExpr(l, [new A.SLetBind(l, new A.SBind(l, false, name, typCompiled), valExp)],
      new A.SCasesElse(l, A.aBlank, valId, node.branches.map((b) => b.visit(this)),
        new A.SBlock(l, [noCasesExn(l, valId)]), true), false);
  }
  sCheck(node: A.SCheck): A.Expr {
    return new A.SId(node.l, new A.SGlobal('nothing'));
  }

  // ---- Type-checker-only annotations --------------------------------------

  // Col<S> / Col<S, T> (and bare Col) have no runtime type to check against;
  // as far as the dynamic semantics go, a column name is a String.
  aName(node: A.AName): A.Ann {
    if (node.id.$name === 's-type-global' && node.id.toname() === 'Col') {
      return new A.AName(node.l, new A.STypeGlobal('String'));
    }
    return new A.AName(node.l, node.id.visit(this));
  }
  aApp(node: A.AApp): A.Ann {
    if (node.ann.$name === 'a-name' && node.ann.id.$name === 's-type-global'
        && node.ann.id.toname() === 'Col') {
      return new A.AName(node.l, new A.STypeGlobal('String'));
    }
    return new A.AApp(node.l, node.ann.visit(this), node.args.map((a: A.Ann) => a.visit(this)));
  }

  // ---- Table lowering (moved here from desugar.ts when type checking) -----
  //
  // These are the same transformations desugar.ts performs in untyped mode,
  // except that subexpressions/annotations are already desugared; the result
  // is visited so nested tables/cases inside it are lowered too.

  sTable(expr: A.STable): A.Expr {
    const l = dummyLoc; // shadow l = A.dummy-loc
    const columnNames = expr.headers.map((header) => new A.SStr(header.l, header.name));
    const anns = expr.headers.map((header) => header.ann);
    const rows = expr.rows.map((row) => {
      const elems = row.elems.map((elem, n) => D.checkAnn(elem.l, elem, anns[n]));
      return new A.SArray(l, elems);
    });
    return new A.SPrimApp(l, 'makeTable',
      [new A.SArray(l, columnNames),
        new A.SArray(l, rows)], flatPrimApp).visit(this);
  }

  sLoadTable(expr: A.SLoadTable): A.Expr {
    const l = expr.l;
    const dummy = dummyLoc;
    let src: A.Expr | undefined = undefined;
    let sanitizers: A.Expr[] = [];
    for (const s of expr.spec) {
      switch (s.$name) {
        case 's-sanitize': {
          // Convert to loader option
          const asOption = new A.SApp(l, D.bid(l, 'as-loader-option'),
            [
              new A.SStr(dummy, 'sanitizer'),
              new A.SStr(dummy, s.name.toname()),
              s.sanitizer
            ]);
          sanitizers = [asOption, ...sanitizers];
          break;
        }
        case 's-table-src':
          // Well-formedness ensures that this matches exactly once
          src = s.src;
          break;
      }
    }

    if (src === undefined) {
      throw new Error('s-load-table missing source: Well-formedness should have failed');
    }

    const loaded = new A.SApp(l,
      new A.SDot(l, src, 'load'),
      [
        new A.SArray(dummy, expr.headers.map((h) => new A.SStr(l, h.name))),
        new A.SArray(dummy, sanitizers)
      ]);

    return new A.SApp(l, D.bid(l, 'open-table'), [loaded]).visit(this);
  }

  sTableExtend(expr: A.STableExtend): A.Expr {
    const l = expr.l;
    const columnBinds = expr.columnBinds;
    const extensions = expr.extensions;
    const row = D.mkId(dummyLoc, 'row');
    const tbl = D.mkId(dummyLoc, 'table');

    const columns = columnBinds.binds.map((c) => ({
      name: new A.SStr(dummyLoc, ((c as A.SBind).id as A.SAtom).base),
      l: c.l,
      idx: D.mkId(dummyLoc, ((c as A.SBind).id as A.SAtom).base),
      val: { idB: c, idE: new A.SId(c.l, (c as A.SBind).id) }
    }));

    const splitExts = partition(A.isSTableExtendReducer, extensions);
    const simpleExts = splitExts.isFalse;
    void simpleExts;
    const reducerExts = splitExts.isTrue as A.STableExtendReducer[];

    const mkReducerAnn = (loc: Loc, retType: A.Ann): A.Ann => {
      const one = new A.AField(loc, 'one', new A.AArrow(loc, [new A.AAny(loc)], retType, true));
      const reduce = new A.AField(loc, 'reduce',
        new A.AArrow(loc, [retType, new A.AAny(loc)], retType, true));
      return new A.ARecord(loc, [one, reduce]);
    };

    const reducers = new Map<string, D.MkId>();
    const accs = new Map<string, D.MkIdVar>();
    for (const extension of reducerExts) {
      const reducerId = D.mkIdAnn(dummyLoc,
        'reducer' + extension.name,
        mkReducerAnn(extension.l, extension.ann));
      const accId = D.mkIdVar(dummyLoc, 'acc' + extension.name);
      reducers.set(extension.name, reducerId);
      accs.set(extension.name, accId);
    }

    let initializedReducers: A.LetBind[] | undefined;
    if (reducerExts.length === 0) {
      initializedReducers = undefined;
    } else {
      let reducersAcc: A.LetBind[] = [];
      for (const ext of reducerExts) {
        const l2 = ext.l;
        const reducer = reducers.get(ext.name)!;
        const acc = accs.get(ext.name)!;
        const nothingExpr = new A.SId(l2, new A.SGlobal('nothing'));
        reducersAcc = [
          new A.SLetBind(l2, reducer.idB, ext.reducer),
          new A.SVarBind(l2, acc.idB, nothingExpr),
          ...reducersAcc
        ];
      }
      initializedReducers = [...reducersAcc].reverse();
    }

    const withInitializedReducers = (body: A.Expr): A.Expr =>
      initializedReducers === undefined ? body : new A.SLetExpr(dummyLoc, initializedReducers, body, true);

    const processExtension = (isFirst: boolean) => (extension: A.TableExtendField): A.Expr => {
      switch (extension.$name) {
        case 's-table-extend-field': return extension.value;
        case 's-table-extend-reducer': {
          const l2 = extension.l;
          const name = extension.name;
          const col = extension.col;
          const reducer = reducers.get(name)!;
          const acc = accs.get(name)!;
          // Dereferenced accumulator
          const accIdE = new A.SIdVar(acc.idE.l, acc.idE.id);
          const found = columns.find((x) => x.name.s === (col as A.SName).s);
          // Lift from Option monad
          const colId = found === undefined
            // Dummy values; will end up unbound
            // (TODO: Figure out how to make only one 'unbound' error show up
            // since the desugaring produces the unbound column twice)
            ? { id: col, idB: new A.SBind(l2, false, col, A.aBlank), idE: new A.SId(l2, col) }
            : found.val;
          if (isFirst) {
            return new A.SBlock(dummyLoc,
              [
                new A.SAssign(l2, acc.id,
                  new A.SApp(l2, new A.SDot(l2, reducer.idE, 'one'), [colId.idE])),
                new A.STupleGet(l2, accIdE, 1, l2)
              ]);
          } else {
            return new A.SBlock(dummyLoc,
              [
                new A.SAssign(l2, acc.id,
                  new A.SApp(l2, new A.SDot(l2, reducer.idE, 'reduce'),
                    [new A.STupleGet(l2, accIdE, 0, l2), colId.idE])),
                new A.STupleGet(l2, accIdE, 1, l2)
              ]);
          }
        }
      }
    };

    const dataPopMapfun = (first: boolean): A.Expr =>
      new A.SLam(dummyLoc, '', [], [row.idB], A.aBlank, '',
        new A.SLetExpr(dummyLoc,
          columns.map((column) =>
            new A.SLetBind(dummyLoc, column.val.idB,
              new A.SPrimApp(dummyLoc, 'raw_array_get',
                [row.idE, column.idx.idE], flatPrimApp))),
          new A.SPrimApp(dummyLoc, 'raw_array_concat', [
            row.idE,
            new A.SArray(dummyLoc,
              extensions.map(processExtension(first)))], flatPrimApp), true),
        undefined, undefined, true);

    const binds: A.LetBind[] = [
      new A.SLetBind(dummyLoc, tbl.idB,
        D.checkTable(columnBinds.table.l, columnBinds.table, (t) => t)),
      // Column Index Bindings
      ...columns.map((column) =>
        new A.SLetBind(dummyLoc, column.idx.idB,
          D.getTableColumn(l, columnBinds.table.l, tbl.idE, column)))
    ];
    // Table Construction
    const body = new A.SBlock(dummyLoc, [
      new A.SBlock(dummyLoc, extensions.map((extension) =>
        D.checkNoColumn(l, tbl.idE, columnBinds.l, extension.name, extension.l))),
      new A.SPrimApp(dummyLoc, 'makeTable', [
        // Header
        new A.SPrimApp(dummyLoc, 'raw_array_concat', [
          new A.SDot(dummyLoc, tbl.idE, '_header-raw-array'),
          new A.SArray(dummyLoc, extensions.map((e) => new A.SStr(e.l, e.name)))],
        flatPrimApp),
        // Data
        withInitializedReducers(
          new A.SApp(l, new A.SId(l, new A.SGlobal('raw-array-map-1')), [
            dataPopMapfun(true),
            dataPopMapfun(false),
            new A.SDot(dummyLoc, tbl.idE, '_rows-raw-array')]))], flatPrimApp)]);
    return new A.SLetExpr(dummyLoc, binds, body, true).visit(this);
  }

  sTableUpdate(expr: A.STableUpdate): A.Expr {
    const l = expr.l;
    const columnBinds = expr.columnBinds;
    const row = D.mkId(dummyLoc, 'row');
    const newRow = D.mkId(dummyLoc, 'new-row-row');
    const tbl = D.mkId(l, 'table');

    const columns = columnBinds.binds.map((c) => ({
      name: new A.SStr(dummyLoc, ((c as A.SBind).id as A.SAtom).base),
      l: c.l,
      idx: D.mkId(dummyLoc, ((c as A.SBind).id as A.SAtom).base),
      val: { idB: c, idE: new A.SId(c.l, (c as A.SBind).id) }
    }));

    const updates = expr.updates.map((u) => ({
      name: new A.SStr(dummyLoc, u.name),
      l: u.l,
      idx: D.mkId(dummyLoc, u.name),
      val: (u as A.SDataField).value
    }));

    const binds: A.LetBind[] = [
      new A.SLetBind(dummyLoc, tbl.idB,
        D.checkTable(columnBinds.table.l, columnBinds.table, (t) => t)),
      // Column Index Bindings
      ...columns.map((column) =>
        new A.SLetBind(dummyLoc, column.idx.idB,
          D.getTableColumn(l, columnBinds.table.l, tbl.idE, column))),
      ...updates.map((update) =>
        new A.SLetBind(dummyLoc, update.idx.idB,
          D.getTableColumn(l, columnBinds.table.l, tbl.idE, update)))
    ];
    // Table Construction
    const body = new A.SPrimApp(dummyLoc, 'makeTable', [
      // Header
      new A.SDot(dummyLoc, tbl.idE, '_header-raw-array'),
      // Data
      new A.SApp(l, new A.SId(dummyLoc, D.g('raw-array-map')), [
        new A.SLam(dummyLoc, '', [], [row.idB], A.aBlank, '',
          new A.SLetExpr(dummyLoc,
            [
              new A.SLetBind(dummyLoc, newRow.idB,
                new A.SPrimApp(dummyLoc, 'raw_array_concat', [
                  row.idE, new A.SArray(dummyLoc, [])], flatPrimApp)),
              ...columns.map((column) =>
                new A.SLetBind(dummyLoc, column.val.idB,
                  new A.SPrimApp(dummyLoc, 'raw_array_get',
                    [newRow.idE, column.idx.idE], flatPrimApp)))
            ],
            new A.SLetExpr(dummyLoc,
              updates.map((update) =>
                new A.SLetBind(dummyLoc, newRow.idB,
                  new A.SPrimApp(dummyLoc, 'raw_array_set', [
                    newRow.idE, update.idx.idE, update.val], flatPrimApp))),
              newRow.idE, true), true), undefined, undefined, true),
        new A.SDot(dummyLoc, tbl.idE, '_rows-raw-array')])],
    flatPrimApp);
    return new A.SLetExpr(dummyLoc, binds, body, true).visit(this);
  }

  sTableSelect(expr: A.STableSelect): A.Expr {
    const l = expr.l;
    const row = D.mkId(dummyLoc, 'row');
    const tbl = D.mkId(l, 'table');
    const columns = expr.columns.map((c) => ({
      l: (c as A.SName).l,
      idx: D.mkId((c as A.SName).l, (c as A.SName).s),
      name: new A.SStr((c as A.SName).l, (c as A.SName).s)
    }));
    const binds: A.LetBind[] = [
      new A.SLetBind(dummyLoc, tbl.idB,
        D.checkTable(expr.table.l, expr.table, (t) => t)),
      // Column Index Bindings
      ...columns.map((column) =>
        new A.SLetBind(dummyLoc, column.idx.idB,
          D.getTableColumn(l, expr.table.l, tbl.idE, column)))
    ];
    // Table Construction
    const body = new A.SPrimApp(dummyLoc, 'makeTable', [
      // Header
      new A.SArray(dummyLoc, columns.map((c) => c.name)),
      // Data
      new A.SApp(l, new A.SId(dummyLoc, D.g('raw-array-map')), [
        new A.SLam(dummyLoc, '', [], [row.idB], A.aBlank, '',
          new A.SArray(dummyLoc,
            columns.map((c) =>
              new A.SPrimApp(dummyLoc, 'raw_array_get',
                [row.idE, c.idx.idE], flatPrimApp))), undefined, undefined, true),
        new A.SDot(dummyLoc, tbl.idE, '_rows-raw-array')])], flatPrimApp);
    return new A.SLetExpr(dummyLoc, binds, body, true).visit(this);
  }

  sTableExtract(expr: A.STableExtract): A.Expr {
    const l = expr.l;
    const column = expr.column;
    const table = expr.table;
    const tbl = D.mkId(table.l, 'table');
    const col = D.mkId(dummyLoc, (column as A.SName).s);
    const row = D.mkId(dummyLoc, (column as A.SName).s);
    return new A.SLetExpr(dummyLoc, [
      new A.SLetBind(dummyLoc, tbl.idB,
        D.checkTable(table.l, table, (t) => t)),
      new A.SLetBind(dummyLoc, col.idB,
        D.getTableColumn(l, table.l, tbl.idE, { l: (column as A.SName).l, name: new A.SStr(dummyLoc, (column as A.SName).s) }))],
      // Table Construction
      new A.SPrimApp(dummyLoc, 'raw_array_to_list', [
        new A.SApp(l, new A.SId(dummyLoc, D.g('raw-array-map')), [
          new A.SLam(dummyLoc, '', [], [row.idB], A.aBlank, '',
            new A.SPrimApp(dummyLoc, 'raw_array_get', [row.idE, col.idE], flatPrimApp), undefined, undefined, true),
          new A.SDot(dummyLoc, tbl.idE, '_rows-raw-array')])], flatPrimApp), true).visit(this);
  }

  sTableOrder(expr: A.STableOrder): A.Expr {
    const l = expr.l;
    const orderingRawArr = expr.ordering.map((o) =>
      new A.SArray(o.l, [new A.SBool(o.l, A.isASCENDING(o.direction)), new A.SStr(o.l, (o.column as A.SName).s)]));
    return new A.SApp(l,
      new A.SDot(dummyLoc, expr.table, 'multi-order'),
      [new A.SArray(dummyLoc, orderingRawArr)]).visit(this);
  }

  sTableFilter(expr: A.STableFilter): A.Expr {
    const l = expr.l;
    const columnBinds = expr.columnBinds;
    const predicate = expr.predicate;
    const row = D.mkId(dummyLoc, 'row');
    const tbl = D.mkId(l, 'table');
    const predRes = D.mkIdAnn(predicate.l, 'pred', new A.AName(predicate.l, new A.STypeGlobal('Boolean')));

    const columns = columnBinds.binds.map((c) => ({
      name: new A.SStr(dummyLoc, ((c as A.SBind).id as A.SAtom).base),
      l: c.l,
      idx: D.mkId(dummyLoc, ((c as A.SBind).id as A.SAtom).base),
      val: { idB: c, idE: new A.SId(c.l, (c as A.SBind).id) }
    }));

    const binds: A.LetBind[] = [
      new A.SLetBind(dummyLoc, tbl.idB,
        D.checkTable(columnBinds.table.l, columnBinds.table, (t) => t)),
      // Column Index Bindings
      ...columns.map((column) =>
        new A.SLetBind(dummyLoc, column.idx.idB,
          D.getTableColumn(l, columnBinds.table.l, tbl.idE, column)))
    ];
    // Table Construction
    const body = new A.SPrimApp(dummyLoc, 'makeTable', [
      // Header
      new A.SDot(dummyLoc, tbl.idE, '_header-raw-array'),
      // Data
      new A.SApp(l, new A.SId(dummyLoc, D.g('raw-array-filter')), [
        new A.SLam(dummyLoc, '', [], [row.idB], A.aBlank, '',
          new A.SLetExpr(dummyLoc,
            columns.map((column) =>
              new A.SLetBind(dummyLoc, column.val.idB,
                new A.SPrimApp(dummyLoc, 'raw_array_get',
                  [row.idE, column.idx.idE], flatPrimApp))),
            new A.SLetExpr(dummyLoc,
              [new A.SLetBind(predicate.l, predRes.idB, predicate)],
              predRes.idE, true), true), undefined, undefined, true),
        new A.SDot(dummyLoc, tbl.idE, '_rows-raw-array')])],
    flatPrimApp);
    return new A.SLetExpr(dummyLoc, binds, body, true).visit(this);
  }
}

export const desugarVisitor = new DesugarVisitor();

export function desugarPostTc(program: A.Program, compileEnv: C.CompileEnvironment): A.Program {
  /*
    Desugar non-scope and non-check based constructs.
    Preconditions on program:
      - well-formed
      - has been type-checked
      - contains no s-var, s-fun, s-data, s-check, or s-check-test
      - contains no s-provide in headers
      - all where blocks are none
      - contains no s-name (e.g. call resolve-names first)
      - contains no s-for, s-if, s-op, s-method-field,
                    s-not, s-when, s-if-pipe, s-paren
      - contains no s-underscore in expression position (but it may
        appear in binding positions as in s-let-bind, s-letrec-bind)
      - may contain s-table* forms only when compiled with type-check: true
        (desugar.ts preserves them for the type checker)
    Postconditions on program:
      - in addition to preconditions,
        contains no s-cases, s-cases-else, s-instantiate, s-table*
  */
  void compileEnv;
  return new A.SProgram(program.l, program._use, program._provide, program.providedTypes,
    program.provides, program.imports, program.block.visit(desugarVisitor));
}
