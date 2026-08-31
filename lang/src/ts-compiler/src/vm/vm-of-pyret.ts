/*
  The interpreter backend's counterpart to js-of-pyret.ts.

  Produces the very same compiled-module record the JS backend produces --
  ("requires", "provides", "nativeRequires", "theModule", "theMap"), wrapped
  in the same CCPDict -- so everything downstream is untouched: the
  on-disk module cache, the standalone bundler, load-lib, the REPL, and
  code.pyret.org's loader all see a module of exactly the expected shape.
  The only difference is what `theModule` contains. Instead of a generated
  state machine, it is a three-line stub that hands the module's bytecode
  to the machine:

      function(R, NS, U, dep0, ..., VM) {
        return VM.runModule(R, NS, U, [dep0, ...], JSON.parse("..."));
      }

  The machine arrives as the module's single nativeRequire, which is how a
  compiled module has always been able to ask for a JS dependency; that
  keeps the interpreter out of runtime.js and lets interpreted and
  JS-compiled modules sit side by side in one program.

  The program is emitted as a JSON string rather than a JS object literal
  because JSON.parse of a string literal is markedly faster than parsing
  the equivalent source -- the same reason build tools do it -- and
  because it keeps the bytecode unmistakably data.
*/

import * as A from '../ast';
import * as N from '../anf';
import * as AL from '../anf-loop-compiler';
import * as AU from '../ast-util';
import * as C from '../compile-structs';
import * as CL from '../concat-lists';
import * as FL from '../flatness';
import * as J from '../js-ast';
import { CCPDict, CompiledCodePrinter } from '../js-of-pyret';
import { InternalCompilerError } from '../shared';
import { VMCompiler } from './vm-compile';
import { VM_MODULE_NAME, VMProgram } from './opcodes';

const clist = CL.clist;

/** The `requires` list, in the order the machine will receive the deps. */
function requiresOf(imports: A.Import[]): J.JExprT {
  const sorted = (imports.filter(A.isSImport) as A.SImport[]).slice().sort((i1, i2) => {
    const k1 = AU.importToDep(i1.file).key();
    const k2 = AU.importToDep(i2.file).key();
    return k1 < k2 ? -1 : (k1 > k2 ? 1 : 0);
  });
  const entries = sorted.map((i) => {
    const m = AU.importToDep(i.file);
    switch (m.$name) {
      case 'builtin':
        return new J.JObj(clist<J.JFieldT>(
          new J.JField('import-type', new J.JStr('builtin')),
          new J.JField('name', new J.JStr(m.modname)))) as J.JExprT;
      case 'dependency':
        return new J.JObj(clist<J.JFieldT>(
          new J.JField('import-type', new J.JStr('dependency')),
          new J.JField('protocol', new J.JStr(m.protocol)),
          new J.JField('args', new J.JList(true,
            CL.map_list((s: string) => new J.JStr(s) as J.JExprT, m.arguments))))) as J.JExprT;
      default:
        throw new InternalCompilerError('vm-of-pyret: unknown Dependency');
    }
  });
  return new J.JList(true, CL.from_list(entries));
}

/**
 * The module function as a JS AST: hand the bytecode to the machine, and
 * carry the flat functions' synchronous fast-form factories ($F) as REAL
 * code so they ride the same JSourcenode -> source-map pipeline the JS
 * backend uses (error frames inside fast-called flat functions render
 * exactly as cont's).
 */
function moduleFun(prog: VMProgram, nDeps: number, factories: J.JExprT[]): J.JFun {
  const R = AL.constId('R');
  const NS = AL.constId('NS');
  const U = AL.constId('U');
  const F = AL.constId('$F');
  const depIds: A.Name[] = [];
  for (let i = 0; i < nDeps; i++) { depIds.push(AL.constId('$d' + i)); }
  const json = JSON.stringify(prog);
  const runCall = new J.JApp(
    new J.JDot(new J.JDot(new J.JId(R), '$vm'), 'runModule'),
    clist<J.JExprT>(
      new J.JId(R), new J.JId(NS), new J.JId(U),
      new J.JList(false, CL.from_list(depIds.map((d) => new J.JId(d) as J.JExprT))),
      new J.JApp(new J.JDot(new J.JId(AL.constId('JSON')), 'parse'),
        clist<J.JExprT>(new J.JStr(json))),
      new J.JId(F)));
  const body = new J.JBlock(clist<J.JStmt>(
    new J.JVar(F, new J.JList(true, CL.from_list(factories))),
    new J.JReturn(runCall)));
  const params = CL.from_list<A.Name>(([R, NS, U] as A.Name[]).concat(depIds));
  return new J.JFun(J.nextJFunId(), '', params, body);
}

export function makeVmPyret(
  addPhase: (name: string, value: any) => any,
  programAst: A.Program,
  env: C.CompileEnvironment,
  postEnv: C.ComputedEnvironment,
  provides: C.Provides,
  options: C.CompileOptions
): [C.Provides, CompiledCodePrinter] {
  const anfed = addPhase('ANFed', N.anfProgram(programAst));
  // Flatness does not drive any decision in this backend (the machine has
  // no per-call stack frame to save), but it is what stamps the `flatness`
  // fields into a module's provides, and those are read back by *other*
  // modules' compiles -- including ones the JS backend compiles. Keeping
  // it makes the two backends' caches describe modules identically.
  const flatnessEnv = addPhase('Build flatness env', FL.makeProgFlatnessEnv(anfed, postEnv, env));
  const flatProvides = addPhase('Get flat-provides',
    FL.getFlatProvides(provides, env, postEnv, flatnessEnv, anfed));

  const computed = postEnv as C.ComputedEnv;
  const liftCaseCount = (body: import('../ast-anf').AExpr, numArgs: number, allowTco: boolean) =>
    AL.casesBranchBodyCaseCount(env, flatnessEnv, flatProvides, postEnv,
      options as AL.SplitCompileOptions, body, numArgs, allowTco);

  // Fast-form factories for flat functions, in $F order (see moduleFun).
  const factories: J.JExprT[] = [];
  const modParam = AL.constId('$m');
  let compilerRef: VMCompiler | undefined;
  type NestedRec = { idx: number; upvalNames: A.Name[] };
  const makeFlatFactory = (
    name: string,
    l: import('../srcloc').Loc,
    args: import('../ast-anf').ABind[],
    body: import('../ast-anf').AExpr,
    freeNames: A.Name[],
    getNested: (bodyKey: import('../ast-anf').AExpr, isMethod: boolean) => NestedRec
  ): number => {
    const nestedHook = (bodyKey: import('../ast-anf').AExpr, isMethod: boolean): J.JExprT | undefined => {
      const rec = getNested(bodyKey, isMethod);
      // R.$vm.mkClo($m, idx, [<free values by name, in upval order>])
      return new J.JApp(
        new J.JDot(new J.JDot(new J.JId(AL.constId('R')), '$vm'), isMethod ? 'mkMeth' : 'mkClo'),
        clist<J.JExprT>(
          new J.JId(modParam),
          new J.JNum(rec.idx),
          new J.JList(false, CL.from_list(rec.upvalNames.map((n) => new J.JId(AL.jsIdOf(n)) as J.JExprT)))));
    };
    const fac = AL.compileVmFlatFactory(env, flatnessEnv, flatProvides, postEnv,
      options as AL.SplitCompileOptions, (loc) => compilerRef!.locK(loc),
      name, l, args, body, freeNames, modParam, nestedHook);
    const idx = factories.length;
    factories.push(fac);
    return idx;
  };

  const compiler = new VMCompiler(
    flatProvides.fromUri,
    computed.bindings, computed.typeBindings, computed.moduleBindings,
    env, options.properTailCalls, flatnessEnv[0],
    liftCaseCount, options.inlineCaseBodyLimit,
    makeFlatFactory);
  compilerRef = compiler;
  const prog = compiler.compileProgram(anfed);
  addPhase('Bytecode', prog);

  const nDeps = prog.globals.filter((g) => g[0] === 'd').length;
  const out = new Map<string, J.JExprT>();
  out.set('requires', requiresOf(anfed.imports));
  out.set('provides', AL.compileProvides(flatProvides));
  // No nativeRequires: the machine is a dependency of vm-runtime.js itself
  // (R.$vm). A per-module nativeRequire would cost a pauseStack in
  // runStandalone per module load, which the cont backend does not do --
  // observable under pause schedules.
  out.set('nativeRequires', new J.JList(true, clist<J.JExprT>()));
  const theModule = moduleFun(prog, nDeps, factories);
  const moduleAndMap = theModule.toUglySourcemap(
    flatProvides.fromUri, 1, 1, flatProvides.fromUri);
  out.set('theModule', options.moduleEval === false
    ? new J.JRawCode(moduleAndMap.code)
    : new J.JStr(moduleAndMap.code));
  out.set('theMap', new J.JStr(moduleAndMap.map));
  return [flatProvides, new CCPDict(out)];
}

export function traceMakeVmPyret(
  addPhase: (name: string, value: any) => any,
  programAst: A.Program,
  env: C.CompileEnvironment,
  postEnv: C.ComputedEnvironment,
  provides: C.Provides,
  options: C.CompileOptions
): [C.Provides, C.CompileResult<CompiledCodePrinter>] {
  const [flatProvides, ccp] = makeVmPyret(
    addPhase, programAst, env, postEnv, provides, options);
  return [flatProvides, addPhase('Generated bytecode', C.ok(ccp))];
}
