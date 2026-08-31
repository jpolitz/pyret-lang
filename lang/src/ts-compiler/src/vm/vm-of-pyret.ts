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
 * The module stub. Kept deliberately tiny: everything interesting is in
 * the bytecode, and a small stub is cheap for the host to eval.
 */
function moduleStub(prog: VMProgram, nDeps: number): string {
  const depNames: string[] = [];
  for (let i = 0; i < nDeps; i++) { depNames.push('$d' + i); }
  const params = ['R', 'NS', 'U'].concat(depNames).concat(['VM']).join(',');
  const json = JSON.stringify(JSON.stringify(prog));
  return 'function(' + params + '){\n'
    + 'return VM.runModule(R,NS,U,[' + depNames.join(',') + '],JSON.parse(' + json + '));\n'
    + '}';
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
  const compiler = new VMCompiler(
    flatProvides.fromUri,
    computed.bindings, computed.typeBindings, computed.moduleBindings,
    env, options.properTailCalls, flatnessEnv[0]);
  const prog = compiler.compileProgram(anfed);
  addPhase('Bytecode', prog);

  const nDeps = prog.globals.filter((g) => g[0] === 'd').length;
  const out = new Map<string, J.JExprT>();
  out.set('requires', requiresOf(anfed.imports));
  out.set('provides', AL.compileProvides(flatProvides));
  out.set('nativeRequires', new J.JList(true, clist<J.JExprT>(new J.JStr(VM_MODULE_NAME))));
  const stub = moduleStub(prog, nDeps);
  out.set('theModule', options.moduleEval === false ? new J.JRawCode(stub) : new J.JStr(stub));
  // There is no generated JS to map back to source, and nothing consumes a
  // map for interpreted modules: locations come from the bytecode's own
  // srcloc table. An empty-but-well-formed map keeps the record's shape.
  out.set('theMap', new J.JStr(JSON.stringify({
    version: 3, sources: [flatProvides.fromUri], names: [], mappings: '',
    file: flatProvides.fromUri,
  })));
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
