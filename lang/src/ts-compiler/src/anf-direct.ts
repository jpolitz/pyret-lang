import * as A from './ast';
import * as N from './ast-anf';
import * as J from './js-ast';
import * as CL from './concat-lists';
import * as DAG from './js-dag-utils';
import * as SL from './srcloc';
import { InternalCompilerError, map2 } from './shared';
import {
  CompilerVisitor, BLet, BArray, BindType, ext, freshId, compilerName, jsIdOf, constId, formalShadowName,
  rtMethod, rtField, checkFun, app, compileAnn, getDictField, casesPreamble, arityCheck, isIdFnName,
  getAssignments, compileALam, compileHead, varAssignIsChecked, wrapWithSrcnode, fixnumFastPath,
  stripAssignsBlock,
} from './anf-loop-compiler';

type Loc = SL.Loc;
type CList<T> = CL.ConcatList<T>;
type Stmts = J.JStmt[];

type Dest =
  | { kind: 'return' }
  | { kind: 'assign'; id: A.Name }
  | { kind: 'discard' };

const RETURN: Dest = { kind: 'return' };
const DISCARD: Dest = { kind: 'discard' };

const clist = CL.clist;
const clEmpty: CList<any> = CL.clEmpty;
const jId = (id: A.Name): J.JId => new J.JId(id);
const jVar = (name: A.Name, rhs: J.JExprT): J.JVar => new J.JVar(name, rhs);
const jExpr = (e: J.JExprT): J.JExpr => new J.JExpr(e);
const jAssign = (name: A.Name, rhs: J.JExprT): J.JAssign => new J.JAssign(name, rhs);
const jBlock = (stmts: Stmts): J.JBlock => new J.JBlock(CL.from_list(stmts));
const jDot = (obj: J.JExprT, f: string): J.JDot => new J.JDot(obj, f);
const jBracket = (obj: J.JExprT, f: J.JExprT): J.JBracket => new J.JBracket(obj, f);
const jNum = (n: any): J.JNum => new J.JNum(n);
const jStr = (s: string): J.JStr => new J.JStr(s);
const jRaw = (s: string): J.JRawCode => new J.JRawCode(s);

interface DirectCtx {
  c: CompilerVisitor;
  args: A.Name[];
  usedTco: boolean;
}

function emit(dest: Dest, e: J.JExprT): J.JStmt {
  switch (dest.kind) {
    case 'return': return new J.JReturn(e);
    case 'assign': return jExpr(jAssign(dest.id, e));
    case 'discard': return jExpr(e);
  }
}

function stmtsOfCExp(ce: DAG.CExp): Stmts {
  return ce.otherStmts.toList();
}

function annCheck(c: CompilerVisitor, bind: N.ABind, target: J.JExprT): Stmts {
  const ann = bind.ann;
  if (A.isABlank(ann) || A.isAAny(ann)) { return []; }
  const loc = c.getLoc((ann as any).l);
  if (A.isATuple(ann) && ann.fields.every((a) => A.isABlank(a) || A.isAAny(a))) {
    return [jExpr(rtMethod('checkTupleBind', clist(target, jNum(ann.fields.length), loc)))];
  }
  const compiledAnn = compileAnn(ann, undefined, c);
  return [...compiledAnn.otherStmts.toList(), jExpr(rtMethod('_checkAnn', clist(loc, compiledAnn.exp, target)))];
}

function isControl(e: N.ALettable): boolean {
  return e.$name === 'a-if' || e.$name === 'a-cases';
}

function dAExpr(x: DirectCtx, ae: N.AExpr, dest: Dest): Stmts {
  const out: Stmts = [];
  for (const h of ae.heads) { out.push(...dHead(x, h)); }
  out.push(...dLettable(x, ae.e, dest, undefined));
  return out;
}

function dBind(x: DirectCtx, b: BindType, e: N.ALettable): Stmts {
  const bind = b.value;
  const id = jsIdOf(bind.id);
  const out: Stmts = [];
  if (b instanceof BLet) {
    if (isControl(e)) {
      out.push(jVar(id, rtField('undefined')));
      out.push(...dLettable(x, e, { kind: 'assign', id }, b));
    } else {
      const tmp = freshId(compilerName('dtmp'));
      const stmts = dLettable(x, e, { kind: 'assign', id: tmp }, b);
      const last = stmts[stmts.length - 1];
      if (last instanceof J.JExpr && last.expr instanceof J.JAssign && last.expr.name === tmp) {
        out.push(...stmts.slice(0, -1), jVar(id, last.expr.rhs));
      } else {
        out.push(jVar(tmp, rtField('undefined')), ...stmts, jVar(id, jId(tmp)));
      }
    }
  } else {
    const tmp = freshId(compilerName('dtmp'));
    out.push(jVar(tmp, rtField('undefined')), ...dLettable(x, e, { kind: 'assign', id: tmp }, b));
    out.push(jExpr(new J.JBracketAssign(jId(id), jNum((b as BArray).idx), jId(tmp))));
  }
  out.push(...annCheck(x.c, bind, jId(id)));
  return out;
}

function dHead(x: DirectCtx, head: N.AExprHead): Stmts {
  const c = x.c;
  switch (head.$name) {
    case 'a-let':
      return dBind(x, new BLet(head.bind), head.e);
    case 'a-arr-let':
      return dBind(x, new BArray(head.bind, head.idx), head.e);
    case 'a-seq':
      return dLettable(x, head.e1, DISCARD, undefined);
    case 'a-var': {
      const bind = head.bind;
      const compiledE: DAG.CExp = head.e.visit(c);
      const id = jsIdOf(bind.id);
      if (A.isABlank(bind.ann) || A.isAAny(bind.ann)) {
        return [...stmtsOfCExp(compiledE), jVar(id, new J.JObj(clist<J.JFieldT>(new J.JField('$var', compiledE.exp))))];
      }
      const compiledAnn = compileAnn(bind.ann, undefined, c);
      const annLocExp = c.getLoc((bind.ann as any).l);
      const box = (v: J.JExprT) => new J.JObj(clist<J.JFieldT>(
        new J.JField('$var', v), new J.JField('$ann', compiledAnn.exp), new J.JField('$loc', annLocExp)));
      if (N.isAVal(head.e) && N.isAUndefined(head.e.v)) {
        return [...compiledAnn.otherStmts.toList(), ...stmtsOfCExp(compiledE), jVar(id, box(compiledE.exp))];
      }
      return [...compiledAnn.otherStmts.toList(), ...stmtsOfCExp(compiledE), jVar(id, box(rtField('undefined'))),
        jExpr(rtMethod('checkVarAssign', clist(jId(id), compiledE.exp)))];
    }
    case 'a-type-let': {
      const blk = compileHead(c, head, new DAG.CBlock(new J.JBlock(clEmpty), clEmpty));
      return DAG.stmtsOf(blk.block).toList();
    }
    default:
      throw new InternalCompilerError('Unknown AExprHead in direct compiler: ' + (head as any).$name);
  }
}

function dIf(x: DirectCtx, node: N.AIf, dest: Dest): Stmts {
  let alt: Stmts = dAExpr(x, node.elseBody, dest);
  for (let i = node.branches.length - 1; i >= 0; i--) {
    const br = node.branches[i];
    const consq = dAExpr(x, br.body, dest);
    const test = (br.test.visit(x.c) as DAG.CExp).exp;
    const ifStmt = new J.JIf(rtMethod('checkPyretTrue', clist(test)), jBlock(consq), jBlock(alt));
    const heads: Stmts = [];
    for (const h of br.heads) { heads.push(...dHead(x, h)); }
    alt = [...heads, ifStmt];
  }
  return alt;
}

function dCases(x: DirectCtx, node: N.ACases, dest: Dest): Stmts {
  const c = x.c;
  const compiledVal = (node.val.visit(c) as DAG.CExp).exp;
  const needsBreak = dest.kind !== 'return';
  const cases: J.JCaseT[] = [];
  for (const branch of node.branches) {
    const body: Stmts = [...casesPreamble(c, compiledVal, branch, node.l).toList()];
    if (N.isACasesBranch(branch)) {
      const fieldNames = jId(jsIdOf(freshId(compilerName('fn'))));
      body.push(jVar(fieldNames.id, jDot(jDot(compiledVal, '$constructor'), '$fieldNames')));
      branch.args.forEach((arg: N.ACasesBind, i: number) => {
        const mask = jBracket(jDot(compiledVal, '$mut_fields_mask'), jNum(i));
        const fld = getDictField(compiledVal, jBracket(fieldNames, jNum(i)));
        body.push(jVar(jsIdOf(arg.bind.id),
          rtMethod('derefField', clist(fld, mask, A.isSCasesBindRef(arg.fieldType) ? J.jTrue : J.jFalse))));
      });
      for (const arg of branch.args) { body.push(...annCheck(c, arg.bind, jId(jsIdOf(arg.bind.id)))); }
    }
    body.push(...dAExpr(x, branch.body, dest));
    if (needsBreak) { body.push(J.jBreak); }
    cases.push(new J.JCase(jStr(branch.name), jBlock(body)));
  }
  const elseBody = dAExpr(x, node._else, dest);
  if (needsBreak) { elseBody.push(J.jBreak); }
  cases.push(new J.JDefault(jBlock(elseBody)));
  return [new J.JSwitch(jDot(compiledVal, '$name'), CL.from_list(cases))];
}

function dApp(x: DirectCtx, e: N.AApp, dest: Dest): Stmts {
  const c = x.c;
  const f = e._fun;
  const compiledF = (f.visit(c) as DAG.CExp).exp;
  const compiledArgs = CL.map_list((a: N.AVal) => (a.visit(c) as DAG.CExp).exp, e.args);
  if (e.appInfo.isRecursive && e.appInfo.isTail && c.allowTco && c.options.properTailCalls &&
      dest.kind === 'return' && compiledArgs.length() === x.args.length) {
    x.usedTco = true;
    const argsList = map2((name: A.Name, exp: J.JExprT) => jAssign(name, exp) as J.JExprT, x.args, compiledArgs.toList());
    const [pre, post] = getAssignments(argsList, argsList.length);
    return [...pre, ...post, jExpr(jRaw('continue $tco'))];
  }
  const isSafeId = N.isAId(f) || N.isAIdSafeLetrec(f);
  const isFn = isSafeId && isIdFnName(c.flatnessEnv, (f as any).id.key());
  const out: Stmts = [];
  if (!isFn) { out.push(checkFun(e.l, c.getLoc(e.l), compiledF)); }
  out.push(emit(dest, wrapWithSrcnode(e.l, fixnumFastPath(c, f, compiledArgs, app(e.l, compiledF, compiledArgs)))));
  return out;
}

function dMethodApp(x: DirectCtx, e: N.AMethodApp, dest: Dest): Stmts {
  const c = x.c;
  const compiledObj = (e.obj.visit(c) as DAG.CExp).exp;
  const compiledArgs = CL.map_list((a: N.AVal) => (a.visit(c) as DAG.CExp).exp, e.args);
  const argcount = compiledArgs.length();
  if (J.isJId(compiledObj)) {
    const helperName = argcount <= 7 ? 'maybeMethodCall' + String(argcount) : 'maybeMethodCall';
    return [emit(dest, wrapWithSrcnode(e.l, rtMethod(helperName,
      CL.clAppend(clist<J.JExprT>(compiledObj, jStr(e.meth), c.getLoc(e.l)), compiledArgs))))];
  }
  const objId = jId(freshId(compilerName('obj')));
  const fieldId = jId(freshId(compilerName('field')));
  const res = freshId(compilerName('mres'));
  return [
    jVar(objId.id, compiledObj),
    jVar(fieldId.id, rtMethod('getColonFieldLoc', clist(objId, jStr(e.meth), c.getLoc(e.l)))),
    jVar(res, rtField('undefined')),
    new J.JIf(rtMethod('isMethod', clist<J.JExprT>(fieldId)),
      jBlock([jExpr(jAssign(res, new J.JApp(jDot(fieldId, 'full_meth'), CL.clCons<J.JExprT>(objId, compiledArgs))))]),
      jBlock([checkFun(e.l, c.getLoc(e.l), fieldId),
        jExpr(wrapWithSrcnode(e.l, jAssign(res, app(e.l, fieldId, compiledArgs))))])),
    emit(dest, jId(res)),
  ];
}

function dLettable(x: DirectCtx, e: N.ALettable, dest: Dest, b: BindType | undefined): Stmts {
  const c = x.c;
  switch (e.$name) {
    case 'a-if': return dIf(x, e, dest);
    case 'a-cases': return dCases(x, e, dest);
    case 'a-app': return dApp(x, e, dest);
    case 'a-method-app': return dMethodApp(x, e, dest);
    case 'a-prim-app': {
      const args = CL.map_list((a: N.AVal) => (a.visit(c) as DAG.CExp).exp, e.args);
      return [emit(dest, wrapWithSrcnode(e.l, rtMethod(e.f, args)))];
    }
    case 'a-update': {
      const compiledObj = (e.supe.visit(c) as DAG.CExp).exp;
      return [emit(dest, rtMethod('checkRefAnns', clist(
        compiledObj,
        new J.JList(false, CL.map_list((f: N.AField) => jStr(f.name) as J.JExprT, e.fields)),
        new J.JList(false, CL.map_list((f: N.AField) => (f.value.visit(c) as DAG.CExp).exp, e.fields)),
        new J.JList(false, CL.map_list((f: N.AField) => c.getLoc(f.l), e.fields)),
        c.getLoc(e.l),
        c.getLoc(e.supe.l))))];
    }
    case 'a-assign': {
      if (varAssignIsChecked(c, e.id)) {
        const v: DAG.CExp = e.value.visit(c);
        return [...stmtsOfCExp(v), emit(dest, rtMethod('checkVarAssign', clist(jId(jsIdOf(e.id)), v.exp)))];
      }
      const ce: DAG.CExp = e.visit(c);
      return [...stmtsOfCExp(ce), emit(dest, ce.exp)];
    }
    case 'a-lam': {
      const ce = compileALam(c, e.l, e.name, e.args, e.ret, e.body, b);
      return [...stmtsOfCExp(ce), emit(dest, ce.exp)];
    }
    default: {
      const ce: DAG.CExp = e.visit(c);
      return [...stmtsOfCExp(ce), emit(dest, ce.exp)];
    }
  }
}

export function compileDirectFunBody(
  l: Loc,
  compiler: CompilerVisitor,
  args: N.ABind[],
  optArity: number | undefined,
  body: N.AExpr,
  isMethod: boolean
): J.JBlockT {
  const apploc = freshId(compilerName('al'));
  const c: CompilerVisitor = ext(compiler, {
    curApploc: apploc,
    args: args.map((a) => jsIdOf(a.id)),
  });
  const x: DirectCtx = { c, args: args.map((a) => jsIdOf(a.id)), usedTco: false };
  const noRealArgs = args[0].id.key() === (compiler.resumer as A.Name).key();
  const formalArgs = args.map((arg) => formalShadowName(arg.id));
  const pre: Stmts = [];
  if (optArity !== undefined) { pre.push(...arityCheck(c.getLoc(l), optArity, isMethod).toList()); }
  if (!noRealArgs) {
    args.forEach((arg, i) => { pre.push(jVar(jsIdOf(arg.id), jId(formalArgs[i]))); });
  }
  const loopBody: Stmts = [];
  for (const arg of args) { loopBody.push(...annCheck(c, arg, jId(jsIdOf(arg.id)))); }
  loopBody.push(...dAExpr(x, body, RETURN));
  const strippedBody = stripAssignsBlock(apploc, jBlock(loopBody));
  if (x.usedTco) {
    return jBlock([...pre, jExpr(jRaw('$tco: while(true) {\n' + strippedBody.toUglySource() + '}'))]);
  }
  return jBlock([...pre, ...J.isJBlock(strippedBody) ? strippedBody.stmts.toList() : [strippedBody.stmt]]);
}
