/*
  Ported from: src/arr/compiler/desugar-post-tc.arr
  See CONVENTIONS.md.
*/

import * as A from './ast';
import * as D from './desugar';
import * as C from './compile-structs';
import { DefaultMapVisitor } from './ast-visitors';
import { Loc } from './srcloc';

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
  //
  // `Column<S, C, T>` / `NewColumn<S, C>` and the schema arguments of
  // `Table<...>` / `Row<...>` exist only for the type checker: there is no
  // runtime annotation object for them.  Left in place they still reach
  // codegen, which emits a `_checkAnn` against `undefined` and dies with
  // "Abstraction breaking: Uncaught JavaScript error ... reading 'flat'" the
  // moment such a function is *called* -- so every schema-polymorphic function
  // type checked and then crashed on entry.  Erase them to the annotation that
  // describes the runtime value: a column name is a `String`, and a table/row
  // of any schema is just `Table`/`Row`.
  //
  // Matching is by name rather than by `s-type-global` alone because under
  // `use context ...` these arrive as context-bound aliases (the same reason
  // the type checker resolves through the alias table); the cost is that a
  // user-defined type sharing one of these names loses its runtime check.
  private static readonly ERASED_TO_STRING = new Set(['Column', 'NewColumn']);
  private static readonly ERASED_TO_HEAD = new Set(['Table', 'Row']);

  private annName(ann: A.Ann): string | undefined {
    return ann.$name === 'a-name' ? ann.id.toname() : undefined;
  }
  aName(node: A.AName): A.Ann {
    if (DesugarVisitor.ERASED_TO_STRING.has(node.id.toname())) {
      return new A.AName(node.l, new A.STypeGlobal('String'));
    }
    return new A.AName(node.l, node.id);
  }
  aApp(node: A.AApp): A.Ann {
    const head = this.annName(node.ann);
    if (head !== undefined && DesugarVisitor.ERASED_TO_STRING.has(head)) {
      return new A.AName(node.l, new A.STypeGlobal('String'));
    }
    // `Table<S, {C; Number}>` -> `Table`: the schema is type-level only, and
    // dropping the arguments also drops the `{C; T}` tuple form with it.
    if (head !== undefined && DesugarVisitor.ERASED_TO_HEAD.has(head)) {
      return node.ann.visit(this);
    }
    return new A.AApp(node.l, node.ann.visit(this), node.args.map((a: A.Ann) => a.visit(this)));
  }

  // The table surface forms survive `desugar` (so that the type checker can
  // see column names and header annotations) and are expanded here instead.
  // `super.sX` re-builds the node with its subexpressions visited; the
  // expansion itself then runs with the identity desugarers, since everything
  // underneath is already fully desugared.
  private table(node: A.Expr): A.Expr {
    return D.desugarTableForm(node as any, (e) => e, (a) => a);
  }
  sTable(node: A.STable): A.Expr { return this.table(super.sTable(node)); }
  sLoadTable(node: A.SLoadTable): A.Expr { return this.table(super.sLoadTable(node)); }
  sTableExtend(node: A.STableExtend): A.Expr { return this.table(super.sTableExtend(node)); }
  sTableUpdate(node: A.STableUpdate): A.Expr { return this.table(super.sTableUpdate(node)); }
  sTableSelect(node: A.STableSelect): A.Expr { return this.table(super.sTableSelect(node)); }
  sTableExtract(node: A.STableExtract): A.Expr { return this.table(super.sTableExtract(node)); }
  sTableOrder(node: A.STableOrder): A.Expr { return this.table(super.sTableOrder(node)); }
  sTableFilter(node: A.STableFilter): A.Expr { return this.table(super.sTableFilter(node)); }
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
    Postconditions on program:
      - in addition to preconditions,
        contains no s-cases, s-cases-else, s-instantiate
  */
  void compileEnv;
  return new A.SProgram(program.l, program._use, program._provide, program.providedTypes,
    program.provides, program.imports, program.block.visit(desugarVisitor));
}
