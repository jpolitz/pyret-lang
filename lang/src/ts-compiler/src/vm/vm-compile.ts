/*
  ANF -> pvm bytecode.

  This is the interpreter backend's counterpart to anf-loop-compiler.ts.
  Both consume exactly the same input (the ANF program produced by anf.ts,
  after the shared front end) and both target exactly the same runtime
  (src/js/base/runtime.js): same value representations, same helper
  entry points, same module/Loadable format. The difference is only what
  a Pyret function turns into. anf-loop-compiler emits a JS function whose
  body is a `switch` state machine over "steps", so that the runtime's
  trampoline can rebuild a suspended activation out of an ActivationRecord.
  Here a Pyret function turns into a `VMFunc`: a flat instruction array
  plus a slot count and a list of upvalues to capture. Suspension needs no
  state machine, because the machine's stack is an ordinary array of frames
  it can hand to the trampoline whole (see src/js/base/pyret-vm.js).

  Why ANF is the right level for this
  -----------------------------------
  ANF has already made every intermediate value a named binding and every
  operand atomic, which is precisely a register machine's shape: a lettable
  is one instruction, its binding is the destination register, and its
  operands are register/constant reads. No expression stack is needed, and
  no evaluation-order decisions are left to the machine, so the observable
  order of effects is fixed by the same pass that fixes it for the JS
  backend.

  Slots, upvalues, globals
  ------------------------
  Each function gets a flat frame of local slots, one per ANF binding it
  introduces plus a handful of scratch slots. Free variables of a lambda
  are captured by value into the closure's upvalue array (safe because ANF
  bindings are single-assignment: Pyret's mutable bindings are `{"$var": v}`
  boxes that are themselves bound once, exactly as in the JS backend).
  Module-level references -- imported modules and cross-module values --
  live in a per-module `globals` array resolved once at instantiation, so
  they cost no capture at all.

  Control flow
  ------------
  `a-if` and `a-cases` become jumps and a dispatch table over `$name`, with
  the "rest of the block" laid out as an ordinary basic block that both
  arms jump to -- the direct analogue of the JS backend's labels, minus the
  step-numbering. The spine of a program (its long right-nested chain of
  a-let/a-seq bodies) is compiled with an explicit loop rather than
  recursion, for the same fixed-stack reasons documented in anf.ts and
  anf-loop-compiler.ts; tail-position `a-if`/`a-cases` else-branches are
  folded into that loop so `ask:` ladders do not nest either.
*/

import * as A from '../ast';
import * as N from '../ast-anf';
import * as CS from '../compile-structs';
import * as SL from '../srcloc';
import * as AU from '../ast-util';
import { jsIdOf, freshId, compilerName, isFunctionFlat } from '../anf-loop-compiler';
import * as FL from '../flatness';
import { InternalCompilerError, mapGetValue } from '../shared';
import * as OP from './opcodes';
import {
  VMProgram, VMFunc, VMData, VMVariant, VMVariantMember, VMModule, VMGlobal,
} from './opcodes';

type Loc = SL.Loc;

// A jump target. `pc` is -1 until the label is placed; every emitted
// reference is recorded so it can be back-patched.
interface Label {
  pc: number;
  refs: number[];
}

// Where the value of the expression currently being compiled should go
// once control leaves it. RETURN means "this function returns it".
const RETURN: Label = { pc: -2, refs: [] };

/**
 * compileFunBody's allowTco scan, transplanted verbatim: true iff any
 * formal parameter is referenced (as an a-id) anywhere inside a lambda or
 * method nested in `body`. The cont backend disables loop-back TCO for
 * the whole function in that case (the loop-back reassigns the formals'
 * JS variables, observable through such a closure), and the machine must
 * pay the same real frames cont pays.
 */
function argUsedInNestedLambda(args: N.ABind[], body: N.AExpr): boolean {
  let argUsedInLambda = false;
  const argNames = args.map((a) => a.id);
  const pendingBodies: Array<{ body: N.AExpr; lam: boolean }> = [{ body, lam: false }];
  function scanVal(v: N.AVal, lam: boolean): void {
    if (lam && !argUsedInLambda && v.$name === 'a-id' && argNames.some((an) => an.key() === v.id.key())) {
      argUsedInLambda = true;
    }
  }
  function scanHead(h: N.AExprHead, lam: boolean): void {
    switch (h.$name) {
      case 'a-let':
      case 'a-arr-let':
      case 'a-var':
        scanLettable(h.e, lam);
        break;
      case 'a-seq':
        scanLettable(h.e1, lam);
        break;
      case 'a-type-let':
        break;
    }
  }
  function scanLettable(e: N.ALettable, lam: boolean): void {
    switch (e.$name) {
      case 'a-module':
        scanVal(e.answer, lam);
        scanVal(e.checks, lam);
        break;
      case 'a-cases':
        scanVal(e.val, lam);
        for (const b of e.branches) {
          pendingBodies.push({ body: b.body, lam });
        }
        pendingBodies.push({ body: e._else, lam });
        break;
      case 'a-if':
        for (const b of e.branches) {
          for (const h of b.heads) {
            scanHead(h, lam);
          }
          scanVal(b.test, lam);
          pendingBodies.push({ body: b.body, lam });
        }
        pendingBodies.push({ body: e.elseBody, lam });
        break;
      case 'a-assign':
        scanVal(e.value, lam);
        break;
      case 'a-app':
        scanVal(e._fun, lam);
        for (const a of e.args) { scanVal(a, lam); }
        break;
      case 'a-method-app':
        scanVal(e.obj, lam);
        for (const a of e.args) { scanVal(a, lam); }
        break;
      case 'a-prim-app':
        for (const a of e.args) { scanVal(a, lam); }
        break;
      case 'a-tuple':
        for (const f of e.fields) { scanVal(f, lam); }
        break;
      case 'a-tuple-get':
        scanVal(e.tup, lam);
        break;
      case 'a-obj':
        for (const f of e.fields) { scanVal(f.value, lam); }
        break;
      case 'a-update':
      case 'a-extend':
        scanVal(e.supe, lam);
        for (const f of e.fields) { scanVal(f.value, lam); }
        break;
      case 'a-dot':
      case 'a-colon':
      case 'a-get-bang':
        scanVal(e.obj, lam);
        break;
      case 'a-lam':
      case 'a-method':
        pendingBodies.push({ body: e.body, lam: true });
        break;
      case 'a-val':
        scanVal(e.v, lam);
        break;
      case 'a-data-expr':
        for (const v of e.variants) {
          for (const wm of v.withMembers) { scanVal(wm.value, lam); }
        }
        for (const s of e.shared) { scanVal(s.value, lam); }
        break;
      default:
        // a-ref, a-id-var, a-id-var-modref, a-id-letrec: no a-id values
        break;
    }
  }
  while (pendingBodies.length > 0 && !argUsedInLambda) {
    const item = pendingBodies.pop()!;
    for (const h of item.body.heads) {
      scanHead(h, item.lam);
    }
    scanLettable(item.body.e, item.lam);
  }
  return argUsedInLambda;
}

class FuncCtx {
  code: number[] = [];
  slots: Map<string, number> = new Map();
  /**
   * Bindings that need no slot of their own because they are just another
   * name for a value source already available here (`a-let x = a-val v`).
   * Sound because ANF binds each name once, so an alias can never go stale.
   */
  aliases: Map<string, number> = new Map();
  nslots = 0;
  upvals: number[] = [];
  upvalMap: Map<string, number> = new Map();
  /** The A.Name for each upval slot, in upvals order (fast-form plumbing). */
  upvalNames: A.Name[] = [];
  /** Slot the machine lands a tail call's value in when the callee turns
      out to be a JS-land function (see OP_TAILCALL in pyret-vm.js). */
  scratch = 0;
  /** Formal-parameter count, for the self-TCO arity-match condition. */
  arity = 0;
  /** The cont backend's allowTco: false for the toplevel and whenever a
      formal parameter is referenced inside any nested lambda/method. */
  allowTco = false;
  /** Scratch slots handed out by newTemp and recycled per statement. */
  private freeTemps: number[] = [];

  constructor(public parent: FuncCtx | undefined, public name: string, public loc: number) {}

  allocSlot(): number { return this.nslots++; }

  slotFor(id: A.Name): number {
    const k = id.key();
    let s = this.slots.get(k);
    if (s === undefined) {
      s = this.allocSlot();
      this.slots.set(k, s);
    }
    return s;
  }

  newTemp(): number {
    const t = this.freeTemps.pop();
    if (t !== undefined) { return t; }
    return this.allocSlot();
  }

  freeTemp(t: number): void { this.freeTemps.push(t); }
}

export class VMCompiler {
  prog: VMProgram;
  private nameIdx: Map<string, number> = new Map();
  private constIdx: Map<string, number> = new Map();
  private locIdx: Map<string, number> = new Map();
  private globalIdx: Map<string, number> = new Map();

  constructor(
    public uri: string,
    private bindings: Map<string, CS.ValueBind>,
    private typeBindings: Map<string, CS.TypeBind>,
    private moduleBindings: Map<string, CS.ModuleBind>,
    private env: CS.CompileEnvironment,
    private properTailCalls: boolean,
    private flatnessEnv: FL.FEnv,
    /** The JS backend's cases-branch lift metric (see
        casesBranchBodyCaseCount): (body, numEnclosingArgs, allowTco) ->
        number of switch cases the JS backend would mint. */
    private liftCaseCount: (body: N.AExpr, numArgs: number, allowTco: boolean) => number,
    private inlineCaseBodyLimit: number,
    /** Compiles one flat function's synchronous fast-form factory (see
        compileVmFlatFactory) and returns its index in the module's $F
        array; undefined disables fast forms. */
    private makeFlatFactory?: (
      name: string, l: Loc, args: N.ABind[], body: N.AExpr, freeNames: A.Name[],
      getNested: (bodyKey: N.AExpr, isMethod: boolean) => { idx: number; upvalNames: A.Name[] }
    ) => number
  ) {
    this.prog = {
      v: OP.FORMAT_VERSION,
      uri,
      moduleId: '',
      locs: [],
      names: [],
      consts: [],
      globals: [],
      funcs: [],
      dispatches: [],
      anns: [],
      datas: [],
      modules: [],
      main: 0,
    };
  }

  // ---------- interning ----------

  nameK(s: string): number {
    const cached = this.nameIdx.get(s);
    if (cached !== undefined) { return cached; }
    const i = this.prog.names.length;
    this.prog.names.push(s);
    this.nameIdx.set(s, i);
    return i;
  }

  locK(l: Loc): number {
    const key = l.key();
    const cached = this.locIdx.get(key);
    if (cached !== undefined) { return cached; }
    const i = this.prog.locs.length;
    this.prog.locs.push(locArray(l));
    this.locIdx.set(key, i);
    return i;
  }

  private constK(desc: any[]): number {
    const key = JSON.stringify(desc);
    const cached = this.constIdx.get(key);
    if (cached !== undefined) { return cached; }
    const i = this.prog.consts.length;
    this.prog.consts.push(desc);
    this.constIdx.set(key, i);
    return i;
  }

  private annK(desc: any[]): number {
    // Annotation descriptors embed value sources, which are frame-relative,
    // so they are not interned across functions.
    const i = this.prog.anns.length;
    this.prog.anns.push(desc);
    return i;
  }

  globalK(g: VMGlobal, key: string): number {
    const cached = this.globalIdx.get(key);
    if (cached !== undefined) { return cached; }
    const i = this.prog.globals.length;
    this.prog.globals.push(g);
    this.globalIdx.set(key, i);
    return i;
  }

  // ---------- name resolution ----------

  /**
   * Value source, valid in `ctx`, for a name bound in some enclosing
   * function -- capturing it as an upvalue if that is what it takes.
   * A name that stands for a constant or a module-level global needs no
   * capture at all: it means the same thing at every depth.
   */
  private resolveOuter(ctx: FuncCtx, key: string, name: A.Name): number | undefined {
    const have = ctx.upvalMap.get(key);
    if (have !== undefined) { return OP.vsUpval(have); }
    const p = ctx.parent;
    if (p === undefined) { return undefined; }
    let inParent = p.aliases.get(key);
    if (inParent === undefined) {
      const slot = p.slots.get(key);
      inParent = slot === undefined ? this.resolveOuter(p, key, name) : OP.vsLocal(slot);
    }
    if (inParent === undefined) { return undefined; }
    let desc: number;
    switch (inParent & 3) {
      case OP.VS_LOCAL: desc = OP.uvLocal(inParent >> 2); break;
      case OP.VS_UPVAL: desc = OP.uvUpval(inParent >> 2); break;
      default:
        // A constant or a global: usable verbatim here.
        ctx.aliases.set(key, inParent);
        return inParent;
    }
    const idx = ctx.upvals.length;
    ctx.upvals.push(desc);
    ctx.upvalNames.push(name);
    ctx.upvalMap.set(key, idx);
    return OP.vsUpval(idx);
  }

  /** Value source for an already-bound identifier. */
  idSource(ctx: FuncCtx, id: A.Name): number {
    const key = id.key();
    const alias = ctx.aliases.get(key);
    if (alias !== undefined) { return alias; }
    const local = ctx.slots.get(key);
    if (local !== undefined) { return OP.vsLocal(local); }
    const outer = this.resolveOuter(ctx, key, id);
    if (outer !== undefined) { return outer; }
    const g = this.globalIdx.get(key);
    if (g !== undefined) { return OP.vsGlobal(g); }
    throw new InternalCompilerError('vm-compile: unbound identifier ' + key + ' in ' + this.uri);
  }

  /**
   * Reading a value out of an imported module is loop-invariant: the module
   * object is fixed once its dependency is instantiated, and so is the field.
   * When the module reference is itself module-level, the read is therefore
   * resolved once at instantiation and becomes an ordinary global -- turning
   * what is statically the second most common instruction into no
   * instruction at all. Returns undefined when the module is a local, where
   * the read has to stay dynamic.
   */
  private hoistedModuleField(ctx: FuncCtx, id: A.Name, name: string): number | undefined {
    const src = this.idSource(ctx, id);
    if ((src & 3) !== OP.VS_GLOBAL) { return undefined; }
    const base = src >> 2;
    return OP.vsGlobal(this.globalK(['f', base, name], '$field$' + base + '$' + name));
  }

  // ---------- atomic values ----------

  /** Value source for an ANF AVal. */
  valSource(ctx: FuncCtx, v: N.AVal): number {
    switch (v.$name) {
      case 'a-srcloc':
        return OP.vsConst(this.constK([OP.CONST_LOC, this.locK(v.loc)]));
      case 'a-num':
        return OP.vsConst(typeof v.n === 'number'
          ? this.constK([OP.CONST_FIXNUM, v.n])
          : this.constK([OP.CONST_NUM_STR, String(v.n)]));
      case 'a-str':
        return OP.vsConst(this.constK([OP.CONST_STR, v.s]));
      case 'a-bool':
        return OP.vsConst(this.constK([OP.CONST_BOOL, v.b]));
      case 'a-undefined':
        return OP.vsConst(this.constK([OP.CONST_UNDEFINED]));
      case 'a-prim-val':
        return OP.vsConst(this.constK([OP.CONST_RT, v.name]));
      case 'a-id':
        return this.idSource(ctx, v.id);
      case 'a-id-safe-letrec': {
        // Reading a letrec cell known to be initialized: unbox, no check.
        const t = ctx.newTemp();
        emit(ctx, OP.OP_UNBOX, t, this.idSource(ctx, v.id));
        return OP.vsLocal(t);
      }
      case 'a-id-modref': {
        const hoisted = this.hoistedModuleField(ctx, v.id, v.name);
        if (hoisted !== undefined) { return hoisted; }
        const t = ctx.newTemp();
        emit(ctx, OP.OP_MODREF, t, this.idSource(ctx, v.id), this.nameK(v.name));
        return OP.vsLocal(t);
      }
      default:
        throw new InternalCompilerError('vm-compile: unknown AVal ' + (v as any).$name);
    }
  }

  /**
   * Like valSource, but for operand positions that are read after other
   * operands have been evaluated: temps handed out here stay live until
   * the whole instruction is emitted.
   */
  private valSources(ctx: FuncCtx, vs: N.AVal[]): number[] {
    return vs.map((v) => this.valSource(ctx, v));
  }

  // ---------- annotations ----------

  /**
   * Some annotations ARE a value that is already to hand -- a named type
   * (`n :: Number`), or one of the runtime's fixed annotations. Checking
   * against those needs no descriptor walk at all, just the value, which
   * matters because annotation checks sit inside loops. Returns undefined
   * for annotations that have to be built (records, tuples, refinements).
   */
  annValueSource(ctx: FuncCtx, ann: A.Ann): number | undefined {
    switch (ann.$name) {
      case 'a-name': return this.idSource(ctx, ann.id);
      case 'a-type-var':
      case 'a-blank':
      case 'a-any': return OP.vsConst(this.constK([OP.CONST_RT, 'Any']));
      case 'a-arrow':
      case 'a-arrow-argnames': return OP.vsConst(this.constK([OP.CONST_RT, 'Function']));
      case 'a-method': return OP.vsConst(this.constK([OP.CONST_RT, 'Method']));
      case 'a-app': return this.annValueSource(ctx, ann.ann);
      default: return undefined;
    }
  }

  annDesc(ctx: FuncCtx, ann: A.Ann, optName: string | undefined): number {
    switch (ann.$name) {
      case 'a-name':
        return this.annK([OP.ANN_VALUE, this.idSource(ctx, ann.id)]);
      case 'a-type-var':
        return this.annK([OP.ANN_ANY]);
      case 'a-arrow':
      case 'a-arrow-argnames':
        return this.annK([OP.ANN_FUNCTION]);
      case 'a-method':
        return this.annK([OP.ANN_METHOD]);
      case 'a-app':
        return this.annDesc(ctx, ann.ann, optName);
      case 'a-record': {
        const names: number[] = [];
        const locs: number[] = [];
        const anns: number[] = [];
        for (const f of ann.fields) {
          names.push(this.nameK(f.name));
          locs.push(this.locK(f.l));
          anns.push(this.annDesc(ctx, f.ann, undefined));
        }
        return this.annK([OP.ANN_RECORD, names, locs, anns,
          optName === undefined ? -1 : this.nameK(optName)]);
      }
      case 'a-tuple': {
        const locs: number[] = [];
        const anns: number[] = [];
        for (const f of ann.fields) {
          locs.push(this.locK(annLoc(f)));
          anns.push(this.annDesc(ctx, f, optName));
        }
        return this.annK([OP.ANN_TUPLE, locs, anns,
          optName === undefined ? -1 : this.nameK(optName)]);
      }
      case 'a-pred': {
        const exp = ann.exp;
        let name: string;
        let src: number;
        let deref: number;
        switch (exp.$name) {
          case 's-id':
            name = exp.id.toname();
            src = this.idSource(ctx, exp.id);
            deref = OP.DEREF_NONE;
            break;
          case 's-id-letrec':
            // Name the CELL, not its contents, and let the machine read
            // through it when it builds the annotation. A `data` member's
            // refinement can name a function defined later in the same
            // letrec group -- reading it here would be too early, which is
            // the same reason the JS backend thunks its compiled anns.
            name = exp.id.toname();
            src = this.idSource(ctx, exp.id);
            deref = exp.safe ? OP.DEREF_VAR : OP.DEREF_VAR_CHECKED;
            break;
          default:
            throw new InternalCompilerError('vm-compile: unknown name in a-pred: ' + (exp as any).$name);
        }
        const base = this.annDesc(ctx, ann.ann, optName);
        // The JS backend picks makeFlatPredAnn when flatness analysis says
        // the predicate cannot bounce. The machine has no per-call stack
        // cost to save, and makePredAnn is correct in every case, so the
        // interpreter always takes the general one.
        return this.annK([OP.ANN_PRED, base, src, this.nameK(name), deref, this.locK(exp.l)]);
      }
      case 'a-dot':
        return this.annK([OP.ANN_DOT, this.locK(ann.l), this.nameK(ann.obj.toname()),
          this.idSource(ctx, ann.obj), this.nameK(ann.field)]);
      case 'a-blank':
      case 'a-any':
        return this.annK([OP.ANN_ANY]);
      default:
        throw new InternalCompilerError('vm-compile: unknown ann ' + (ann as any).$name);
    }
  }

  // ---------- functions ----------

  private compileFunc(
    parent: FuncCtx | undefined,
    name: string,
    l: Loc,
    args: N.ABind[],
    arity: number,
    isMethod: boolean,
    body: N.AExpr,
    allowTcoBase: boolean,
    isFlat: boolean
  ): number {
    const ctx = new FuncCtx(parent, name, this.locK(l));
    ctx.arity = args.length;
    ctx.allowTco = allowTcoBase && !argUsedInNestedLambda(args, body);
    for (const a of args) { ctx.slotFor(a.id); }
    ctx.scratch = ctx.allocSlot();
    this.compileAnnChecks(ctx, args);
    const ans = ctx.allocSlot();
    this.compileAExpr(ctx, body, ans, RETURN);
    const fn: VMFunc = {
      n: name,
      a: arity,
      m: isMethod,
      s: ctx.nslots,
      k: ctx.scratch,
      u: ctx.upvals,
      c: ctx.code,
      l: ctx.loc,
      fl: isFlat ? 1 : 0,
      ff: -1,
      fa: [],
    };
    const idx = this.prog.funcs.length;
    this.prog.funcs.push(fn);
    // Fast-form plumbing: a factory compiling an enclosing flat function
    // replaces nested lambdas with bytecode-closure builders and needs
    // this function's index and upval order, keyed by body identity.
    this.nestedIdx.set(body, { idx, upvalNames: ctx.upvalNames });
    return idx;
  }

  private nestedIdx: Map<N.AExpr, { idx: number; upvalNames: A.Name[] }> = new Map();

  /** The `compile-anns` pass: argument annotations, checked left to right. */
  private compileAnnChecks(ctx: FuncCtx, binds: N.ABind[]): void {
    for (const b of binds) {
      this.compileAnnCheck(ctx, b);
    }
  }

  private compileAnnCheck(ctx: FuncCtx, b: N.ABind): void {
    this.compileAnnCheckAt(ctx, b, OP.vsLocal(ctx.slotFor(b.id)));
  }

  private compileAnnCheckAt(ctx: FuncCtx, b: N.ABind, vs: number): void {
    const ann = b.ann;
    if (A.isABlank(ann) || A.isAAny(ann)) { return; }
    if (A.isATuple(ann) && ann.fields.every((a) => A.isABlank(a) || A.isAAny(a))) {
      emit(ctx, OP.OP_TUPLECHK, vs, ann.fields.length, this.locK(ann.l));
      return;
    }
    const direct = this.annValueSource(ctx, ann);
    if (direct !== undefined) {
      emit(ctx, OP.OP_ANNCHECKV, direct, vs, this.locK(annLoc(ann)));
      return;
    }
    emit(ctx, OP.OP_ANNCHECK, this.annDesc(ctx, ann, undefined), vs, this.locK(annLoc(ann)));
  }

  // ---------- expressions ----------

  /**
   * Compile `expr`, leaving its value in slot `dest`, then transfer control
   * to `cont` (RETURN meaning "return it"). The statement spine (`heads`) is
   * a flat array; only genuinely nested constructs (lambda bodies, the taken
   * arm of a conditional) recur, and chained `cases`-in-else loops here.
   */
  compileAExpr(ctx: FuncCtx, expr0: N.AExpr, dest: number, cont: Label): void {
    let expr = expr0;
    for (;;) {
      for (const head of expr.heads) {
        this.compileHead(ctx, head);
      }
      const e = expr.e;
      if (e.$name === 'a-if') {
        // A branch's heads are the lets its test needs, evaluated only once
        // every earlier branch's test has failed.
        for (const b of e.branches) {
          for (const head of b.heads) {
            this.compileHead(ctx, head);
          }
          const elseL = newLabel();
          emit(ctx, OP.OP_IF, this.valSource(ctx, b.test));
          emitRef(ctx, elseL);
          this.compileAExpr(ctx, b.body, dest, cont);
          place(ctx, elseL);
        }
        expr = e.elseBody;
        continue;
      }
      if (e.$name === 'a-cases') {
        expr = this.compileCases(ctx, e, dest, cont);
        continue;
      }
      this.compileLettable(ctx, e, dest, cont);
      return;
    }
  }

  /** One statement of the spine: binds a name (or performs an effect); no result. */
  private compileHead(ctx: FuncCtx, head: N.AExprHead): void {
    switch (head.$name) {
      case 'a-type-let': {
        const bind = head.bind;
        switch (bind.$name) {
          case 'a-type-bind': {
            // optName only reaches makeRecordAnn/makeTupleAnn, which are
            // exactly the cases annValueSource declines, so binding a
            // directly-available annotation loses nothing.
            const direct = this.annValueSource(ctx, bind.ann);
            if (direct !== undefined) {
              ctx.aliases.set(bind.name.key(), direct);
              break;
            }
            const slot = ctx.slotFor(bind.name);
            emit(ctx, OP.OP_MKANN, slot, this.annDesc(ctx, bind.ann, bind.name.toname()));
            break;
          }
          case 'a-newtype-bind': {
            const brander = ctx.slotFor(bind.namet);
            const annSlot = ctx.slotFor(bind.name);
            emit(ctx, OP.OP_NEWTYPE, brander, annSlot,
              this.nameK(bind.name.toname()), this.locK(bind.l));
            break;
          }
          default:
            throw new InternalCompilerError('vm-compile: unknown ATypeBind');
        }
        break;
      }
      case 'a-let': {
        // `x = <atomic>` needs no instruction and no slot: the binding is
        // just another name for a value source that already exists, and
        // ANF's single-assignment rule means it stays that way.
        if (head.e.$name === 'a-val') {
          const src = this.valSource(ctx, head.e.v);
          ctx.aliases.set(head.bind.id.key(), src);
          this.compileAnnCheckAt(ctx, head.bind, src);
          break;
        }
        const slot = ctx.slotFor(head.bind.id);
        const next = newLabel();
        // The binding's key travels along so a directly-let-bound lambda
        // can be recognized as cont-flat (compileALam's isFlat condition).
        this.compileLettable(ctx, head.e, slot, next, head.bind.id.key());
        place(ctx, next);
        this.compileAnnCheck(ctx, head.bind);
        break;
      }
      case 'a-arr-let': {
        const arr = this.idSource(ctx, head.bind.id);
        if (head.e.$name === 'a-val') {
          emit(ctx, OP.OP_ARRSET, arr, head.idx, this.valSource(ctx, head.e.v));
          break;
        }
        const tmp = ctx.newTemp();
        const next = newLabel();
        this.compileLettable(ctx, head.e, tmp, next);
        place(ctx, next);
        emit(ctx, OP.OP_ARRSET, arr, head.idx, OP.vsLocal(tmp));
        ctx.freeTemp(tmp);
        break;
      }
      case 'a-var': {
        const slot = ctx.slotFor(head.bind.id);
        if (head.e.$name === 'a-val') {
          emit(ctx, OP.OP_BOX, slot, this.valSource(ctx, head.e.v));
          break;
        }
        const tmp = ctx.newTemp();
        const next = newLabel();
        this.compileLettable(ctx, head.e, tmp, next);
        place(ctx, next);
        emit(ctx, OP.OP_BOX, slot, OP.vsLocal(tmp));
        ctx.freeTemp(tmp);
        break;
      }
      case 'a-seq': {
        const tmp = ctx.newTemp();
        const next = newLabel();
        this.compileLettable(ctx, head.e1, tmp, next);
        place(ctx, next);
        ctx.freeTemp(tmp);
        break;
      }
      default:
        throw new InternalCompilerError('vm-compile: unknown AExprHead ' + (head as any).$name);
    }
  }

  /**
   * Emits the dispatch and every branch of an `a-cases`, and returns the
   * else-branch for the caller to continue with (kept out of the recursion
   * so chained `cases` do not nest).
   */
  private compileCases(ctx: FuncCtx, e: N.ACases, dest: number, cont: Label): N.AExpr {
    const valSrc = this.valSource(ctx, e.val);
    const dispatchIdx = this.prog.dispatches.length;
    const table: Record<string, number> = {};
    this.prog.dispatches.push(table);
    const casesLocK = this.locK(e.l);
    const elseL = newLabel();
    emit(ctx, OP.OP_CASES, valSrc, dispatchIdx, casesLocK);
    emitRef(ctx, elseL);
    for (const branch of e.branches) {
      table[branch.name] = ctx.code.length;
      // The JS backend lifts a branch whose body mints too many switch
      // cases into its own function; the machine must match its frame
      // and fuel granularity exactly, so it consults the same metric.
      const lifted =
        this.liftCaseCount(branch.body, ctx.arity, ctx.allowTco) >= this.inlineCaseBodyLimit;
      if (branch.$name === 'a-cases-branch') {
        emit(ctx, OP.OP_CASESPRE, valSrc, branch.args.length,
          this.locK(branch.l), casesLocK);
        if (lifted) {
          this.compileLiftedBranch(ctx, e, branch, valSrc, dest, cont);
          continue;
        }
        if (branch.args.length > 0) {
          const operands: number[] = [];
          for (const a of branch.args) {
            operands.push(ctx.slotFor(a.bind.id));
            operands.push(A.isSCasesBindRef(a.fieldType) ? 1 : 0);
          }
          emit(ctx, OP.OP_CASESBIND, valSrc, branch.args.length, ...operands);
          this.compileAnnChecks(ctx, branch.args.map((a) => a.bind));
        }
      } else {
        emit(ctx, OP.OP_CASESPRE, valSrc, -1, this.locK(branch.l), casesLocK);
        if (lifted) {
          this.compileLiftedBranch(ctx, e, branch, valSrc, dest, cont);
          continue;
        }
      }
      this.compileAExpr(ctx, branch.body, dest, cont);
    }
    place(ctx, elseL);
    return e._else;
  }

  /**
   * The JS backend's lifted-branch shape: `$step = curTarget; $al =
   * branch.l; var temp = function(args) {body}; $ans =
   * v.$app_fields(temp, refmask)`. The branch body becomes its own
   * non-flat function (allowTco false, no arity check -- the runtime's
   * $app_fields supplies exactly the fields), entered through APPFIELDS.
   */
  private compileLiftedBranch(
    ctx: FuncCtx,
    e: N.ACases,
    branch: N.ACasesBranch,
    valSrc: number,
    dest: number,
    cont: Label
  ): void {
    const branchArgs: N.ABind[] =
      (branch.$name === 'a-cases-branch' && branch.args.length > 0)
        ? branch.args.map((a) => a.bind)
        : [];
    const mask: number[] =
      (branch.$name === 'a-cases-branch')
        ? branch.args.map((a) => (A.isSCasesBindRef(a.fieldType) ? 1 : 0))
        : [];
    if (this.properTailCalls && cont === RETURN) { emit(ctx, OP.OP_SETRET); }
    const funcIdx = this.compileFunc(ctx, '', branch.body.l, branchArgs, -1, false,
      branch.body, false, false);
    emit(ctx, OP.OP_APPFIELDS, dest, valSrc, funcIdx,
      (this.locK(branch.l) << 1) | 1, mask.length, ...mask);
    jump(ctx, cont, dest);
  }

  // ---------- lettables ----------

  compileLettable(ctx: FuncCtx, e: N.ALettable, dest: number, cont: Label, bindKey?: string): void {
    switch (e.$name) {
      case 'a-val': {
        const src = this.valSource(ctx, e.v);
        // In tail position the copy is pointless: return the source.
        if (cont === RETURN) { emit(ctx, OP.OP_RET, src); return; }
        emit(ctx, OP.OP_MOVE, dest, src);
        break;
      }
      case 'a-id-var':
        emit(ctx, OP.OP_UNBOX, dest, this.idSource(ctx, e.id));
        break;
      case 'a-id-var-modref': {
        // The *cell* can be hoisted even though its contents cannot: what
        // changes over time is the `$var` inside it, not which cell it is.
        const hoisted = this.hoistedModuleField(ctx, e.id, e.name);
        if (hoisted !== undefined) { emit(ctx, OP.OP_UNBOX, dest, hoisted); break; }
        emit(ctx, OP.OP_MODVARREF, dest, this.idSource(ctx, e.id), this.nameK(e.name));
        break;
      }
      case 'a-id-letrec':
        if (e.safe) {
          emit(ctx, OP.OP_UNBOX, dest, this.idSource(ctx, e.id));
        } else {
          emit(ctx, OP.OP_LETREC, dest, this.idSource(ctx, e.id),
            this.locK(e.l), this.nameK(e.id.toname()));
        }
        break;
      case 'a-assign':
        emit(ctx, OP.OP_SETVAR, this.idSource(ctx, e.id), this.valSource(ctx, e.value), dest);
        break;
      case 'a-app': {
        const f = this.valSource(ctx, e._fun);
        const args = this.valSources(ctx, e.args);
        // The cont backend's loop-back TCO fires on appInfo alone
        // (buildSplitApp) -- even at a structurally non-tail site, e.g.
        // under a non-stateful return annotation, where it discards the
        // pending binding exactly as `continue` does.
        if (e.appInfo.isRecursive && e.appInfo.isTail && ctx.allowTco &&
            this.properTailCalls && args.length === ctx.arity) {
          emit(ctx, OP.OP_SELFTAIL, args.length, ...args);
          return;
        }
        // The apploc flag: cont updates $al at split call sites but not at
        // statically-flat ones (buildFlatApp) -- preLettable's condition.
        const fv = e._fun;
        const staticFlat =
          (fv.$name === 'a-id' || fv.$name === 'a-id-safe-letrec') &&
          isFunctionFlat(this.flatnessEnv, fv.id.key());
        const lkOp = (this.locK(e.l) << 1) | (staticFlat ? 0 : 1);
        // Frame elision is structural: any call in return position leaves
        // the frame at its return label (elided at captures).
        if (this.properTailCalls && cont === RETURN) {
          emit(ctx, OP.OP_TAILCALL, f, lkOp, args.length, ...args);
          // Reached only when the callee was JS-land: the machine parks
          // its result in the scratch slot and falls through to here.
          emit(ctx, OP.OP_RET, OP.vsLocal(ctx.scratch));
          return;
        }
        emit(ctx, OP.OP_CALL, dest, f, lkOp, args.length, ...args);
        break;
      }
      case 'a-method-app': {
        const o = this.valSource(ctx, e.obj);
        const args = this.valSources(ctx, e.args);
        if (this.properTailCalls && cont === RETURN) { emit(ctx, OP.OP_SETRET); }
        // cont updates $al only on the getColonField path (receiver not a
        // plain identifier); the maybeMethodCall path leaves it stale.
        const mflag = (e.obj.$name === 'a-id') ? 0 : 1;
        emit(ctx, OP.OP_METHCALL, dest, o, this.nameK(e.meth),
          (this.locK(e.l) << 1) | mflag, args.length, ...args);
        break;
      }
      case 'a-prim-app': {
        const args = this.valSources(ctx, e.args);
        if (this.properTailCalls && cont === RETURN) { emit(ctx, OP.OP_SETRET); }
        // cont updates $al only for split prims (needsStep); flat prims
        // (buildFlatPrimApp) leave it stale.
        emit(ctx, OP.OP_PRIMAPP, dest, this.nameK(e.f),
          (this.locK(e.l) << 1) | (e.appInfo.needsStep ? 1 : 0),
          args.length, ...args);
        break;
      }
      case 'a-lam': {
        const isFlat = bindKey !== undefined &&
          isFunctionFlat(this.flatnessEnv, bindKey);
        const idx = this.compileFunc(ctx, e.name, e.l, e.args, e.args.length, false, e.body,
          true, isFlat);
        if (isFlat && this.makeFlatFactory !== undefined) {
          // The factory's parameters are the lambda's free names (sorted
          // by key for determinism); fa records how the CREATING frame
          // supplies each one.
          const fvs = N.freevarsL(e);
          const freeNames = [...fvs.keys()].sort().map((k) => fvs.get(k)!);
          const fdef = this.prog.funcs[idx];
          fdef.fa = freeNames.map((n) => this.idSource(ctx, n));
          fdef.ff = this.makeFlatFactory(e.name, e.l, e.args, e.body, freeNames,
            (bodyKey, _isMethod) => {
              const rec = this.nestedIdx.get(bodyKey);
              if (rec === undefined) {
                throw new InternalCompilerError('vm-compile: flat factory saw an unknown nested lambda');
              }
              return rec;
            });
        }
        emit(ctx, OP.OP_CLOSURE, dest, idx);
        break;
      }
      case 'a-method': {
        const idx = this.compileFunc(ctx, e.name, e.l, e.args, e.args.length, true, e.body,
          true, false);
        emit(ctx, OP.OP_METHOD, dest, idx);
        break;
      }
      case 'a-ref':
        if (e.ann !== undefined) {
          throw new InternalCompilerError('vm-compile: annotations in refs are not supported');
        }
        emit(ctx, OP.OP_REF, dest);
        break;
      case 'a-obj': {
        const operands: number[] = [];
        for (const f of e.fields) {
          operands.push(this.nameK(f.name));
          operands.push(this.valSource(ctx, f.value));
        }
        emit(ctx, OP.OP_OBJ, dest, e.fields.length, ...operands);
        break;
      }
      case 'a-extend': {
        const o = this.valSource(ctx, e.supe);
        const operands: number[] = [];
        for (const f of e.fields) {
          operands.push(this.nameK(f.name));
          operands.push(this.valSource(ctx, f.value));
        }
        emit(ctx, OP.OP_EXTEND, dest, o, this.locK(e.l), e.fields.length, ...operands);
        break;
      }
      case 'a-update': {
        const o = this.valSource(ctx, e.supe);
        const operands: number[] = [];
        for (const f of e.fields) {
          operands.push(this.nameK(f.name));
          operands.push(this.valSource(ctx, f.value));
          operands.push(this.locK(f.l));
        }
        emit(ctx, OP.OP_UPDATE, dest, o, this.locK(e.l), this.locK(e.supe.l),
          e.fields.length, ...operands);
        break;
      }
      case 'a-dot':
        emit(ctx, OP.OP_DOT, dest, this.valSource(ctx, e.obj),
          this.nameK(e.field), this.locK(e.l));
        break;
      case 'a-colon':
        emit(ctx, OP.OP_COLON, dest, this.valSource(ctx, e.obj),
          this.nameK(e.field), this.locK(e.l));
        break;
      case 'a-get-bang':
        emit(ctx, OP.OP_GETBANG, dest, this.valSource(ctx, e.obj),
          this.nameK(e.field), this.locK(e.l));
        break;
      case 'a-tuple': {
        const vals = this.valSources(ctx, e.fields);
        emit(ctx, OP.OP_TUPLE, dest, vals.length, ...vals);
        break;
      }
      case 'a-tuple-get':
        emit(ctx, OP.OP_TUPLEGET, dest, this.valSource(ctx, e.tup), e.index, this.locK(e.l));
        break;
      case 'a-data-expr':
        emit(ctx, OP.OP_DATA, dest, this.dataDesc(ctx, e));
        break;
      case 'a-if':
      case 'a-cases': {
        // A conditional in a head's right-hand side: hand it back to the
        // AExpr walker, which owns branch/dispatch emission.
        this.compileAExpr(ctx, new N.AExpr([], e), dest, cont);
        return;
      }
      case 'a-module':
        emit(ctx, OP.OP_MODULE, dest, this.moduleDesc(ctx, e));
        break;
      default:
        throw new InternalCompilerError('vm-compile: unknown ALettable ' + (e as any).$name);
    }
    jump(ctx, cont, dest);
  }

  // ---------- data declarations ----------

  private dataDesc(ctx: FuncCtx, e: N.ADataExpr): number {
    const variants: VMVariant[] = e.variants.map((v) => {
      const withMembers: Array<[string, number]> = v.withMembers.map(
        (wm) => [wm.name, this.valSource(ctx, wm.value)] as [string, number]);
      if (v.$name === 'a-variant') {
        const ms: VMVariantMember[] = v.members.map((m) => {
          const blank = A.isABlank(m.bind.ann) || A.isAAny(m.bind.ann);
          return {
            n: m.bind.id.toname(),
            j: jsIdOf(m.bind.id).tosourcestring(),
            m: N.isAMutable(m.memberType),
            a: blank ? -1 : this.annDesc(ctx, m.bind.ann, undefined),
            al: blank ? -1 : this.locK(annLoc(m.bind.ann)),
          };
        });
        return { k: 'v', n: v.name, l: this.locK(v.l), ms, w: withMembers } as VMVariant;
      }
      return { k: 's', n: v.name, l: this.locK(v.l), ms: [], w: withMembers } as VMVariant;
    });
    const desc: VMData = {
      l: this.locK(e.l),
      n: e.name,
      b: this.idSource(ctx, e.namet),
      vs: variants,
      sh: e.shared.map((f) => [f.name, this.valSource(ctx, f.value)] as [string, number]),
    };
    const idx = this.prog.datas.length;
    this.prog.datas.push(desc);
    return idx;
  }

  // ---------- the module value ----------

  private moduleDesc(ctx: FuncCtx, e: N.AModule): number {
    const pb = this.progProvides!;
    const provideValues: Array<[string, any]> = [];
    for (const pv of pb.specs.filter(A.isSProvideName)) {
      const ns = pv.nameSpec;
      switch (ns.$name) {
        case 's-local-ref': {
          const valBind = mapGetValue(this.bindings, ns.name.key());
          // letrec bindings live in a `{"$var": v}` cell; `var` bindings
          // hand out the cell itself (that is what makes an importer's
          // `a-id-var-modref` able to read through it).
          const deref = CS.isVbLetrec(valBind.binder) ? 1 : 0;
          provideValues.push([ns.asName.toname(),
            [OP.REF_LOCAL, this.idSource(ctx, ns.name), deref]]);
          break;
        }
        case 's-remote-ref':
          provideValues.push([ns.asName.toname(),
            [OP.REF_REMOTE, ns.uri, 'values', ns.name.toname()]]);
          break;
        default:
          throw new InternalCompilerError('vm-compile: unknown NameSpec in provide');
      }
    }
    const provideTypes: Array<[string, any]> = [];
    for (const tp of pb.specs.filter(A.isSProvideType)) {
      const ns = tp.nameSpec;
      switch (ns.$name) {
        case 's-local-ref':
          provideTypes.push([ns.asName.toname(),
            ['a', this.annDesc(ctx, new A.AName(e.l, ns.name), undefined)]]);
          break;
        case 's-remote-ref':
          provideTypes.push([ns.asName.toname(), ['r', ns.uri, 'types', ns.name.toname()]]);
          break;
        default:
          throw new InternalCompilerError('vm-compile: unknown NameSpec in provide-type');
      }
    }
    const provideModules: Array<[string, any]> = [];
    for (const pm of pb.specs.filter(A.isSProvideModule)) {
      const ns = pm.nameSpec;
      switch (ns.$name) {
        case 's-local-ref':
          provideModules.push([ns.asName.toname(), ['l', this.idSource(ctx, ns.name)]]);
          break;
        case 's-remote-ref':
          provideModules.push([ns.asName.toname(), ['u', ns.uri]]);
          break;
        default:
          throw new InternalCompilerError('vm-compile: unknown NameSpec in provide-module');
      }
    }
    const desc: VMModule = {
      answer: this.valSource(ctx, e.answer),
      checks: this.valSource(ctx, e.checks),
      definedModules: e.definedModules.map(
        (dm) => [dm.name, this.idSource(ctx, dm.value)] as [string, number]),
      definedValues: e.definedValues.map((dv) => {
        switch (dv.$name) {
          case 'a-defined-value':
            return [dv.name, this.valSource(ctx, dv.value)] as [string, number];
          case 'a-defined-var':
            return [dv.name, this.idSource(ctx, dv.id)] as [string, number];
          default:
            throw new InternalCompilerError('vm-compile: unknown ADefinedValue');
        }
      }),
      definedTypes: e.definedTypes.map(
        (dt) => [dt.name, this.annDesc(ctx, dt.typ, undefined)] as [string, number]),
      provideValues: provideValues as any,
      provideTypes: provideTypes as any,
      provideModules: provideModules as any,
    };
    const idx = this.prog.modules.length;
    this.prog.modules.push(desc);
    return idx;
  }

  // ---------- whole-program entry ----------

  private progProvides: A.ProvideBlock | undefined;

  compileProgram(node: N.AProgram): VMProgram {
    this.progProvides = node.provides;
    const l = node.l;
    const freevars = new Map(N.freevarsProg(node) as Map<string, A.Name>);

    const imports = (node.imports.filter(A.isSImport) as A.SImport[]).slice().sort(
      (i1, i2) => {
        const k1 = AU.importToDep(i1.file).key();
        const k2 = AU.importToDep(i2.file).key();
        return k1 < k2 ? -1 : (k1 > k2 ? 1 : 0);
      });
    for (const i of imports) { freevars.delete(i.name.key()); }

    // Imported modules come in as instantiation arguments; everything else
    // free in the program is a cross-module reference resolved once here.
    imports.forEach((imp, i) => {
      this.globalK(['d', i], imp.name.key());
    });

    for (const key of [...freevars.keys()].sort()) {
      const n = mapGetValue(freevars, key);
      if (A.isSAtom(n)) {
        let which: string;
        let uri: string;
        let lookupName: A.Name;
        if (this.bindings.has(key)) {
          const vb = mapGetValue(this.bindings, key);
          which = 'values'; uri = vb.origin.uriOfDefinition; lookupName = vb.origin.originalName;
        } else if (this.typeBindings.has(key)) {
          const tb = mapGetValue(this.typeBindings, key);
          which = 'types'; uri = tb.origin.uriOfDefinition; lookupName = tb.origin.originalName;
        } else if (this.moduleBindings.has(key)) {
          const mb = mapGetValue(this.moduleBindings, key);
          which = 'modules'; uri = mb.origin.uriOfDefinition; lookupName = mb.origin.originalName;
        } else {
          throw new InternalCompilerError('vm-compile: no binding found for ' + key);
        }
        this.globalK(['m', uri, which, lookupName.toname()], key);
      } else {
        let maybeOrigin: CS.BindOrigin | undefined;
        let which: string;
        switch (n.$name) {
          case 's-module-global':
            maybeOrigin = this.env.originByModuleName(n.toname()); which = 'modules'; break;
          case 's-global':
            maybeOrigin = this.env.originByValueName(n.toname()); which = 'values'; break;
          case 's-type-global':
            maybeOrigin = this.env.originByTypeName(n.toname()); which = 'types'; break;
          default:
            throw new InternalCompilerError('vm-compile: unknown global name ' + n.$name);
        }
        if (maybeOrigin === undefined) {
          throw new InternalCompilerError(n.toname() + ' not found');
        }
        this.globalK(['m', maybeOrigin.uriOfDefinition, which,
          maybeOrigin.originalName.toname()], key);
      }
    }

    // Freshened per compile so that repeated REPL interactions over the
    // "same" source do not collide, exactly as the JS backend's module id is.
    this.prog.moduleId = freshId(compilerName((l as SL.Srcloc).source)).tosourcestring();
    // compileFunc appends children before their parent, so the toplevel is
    // whatever index it reports; the VM starts there.
    // The toplevel matches the cont backend's: non-flat, allowTco false.
    this.prog.main = this.compileFunc(undefined, '$toplevel', l, [], -1, false, node.body,
      false, false);
    return this.prog;
  }
}

// ---------- tiny assembler ----------

function emit(ctx: FuncCtx, ...xs: number[]): void {
  for (let i = 0; i < xs.length; i++) { ctx.code.push(xs[i]); }
}

function newLabel(): Label { return { pc: -1, refs: [] }; }

/** Emits a jump-target operand to be back-patched when `l` is placed. */
function emitRef(ctx: FuncCtx, l: Label): void {
  if (l.pc >= 0) { ctx.code.push(l.pc); return; }
  l.refs.push(ctx.code.length);
  ctx.code.push(0);
}

function place(ctx: FuncCtx, l: Label): void {
  // Fallthrough peephole: a JMP that targets the very next instruction is
  // dropped rather than emitted.
  if (ctx.code.length >= 2
      && ctx.code[ctx.code.length - 2] === OP.OP_JMP
      && l.refs.length > 0
      && l.refs[l.refs.length - 1] === ctx.code.length - 1) {
    l.refs.pop();
    ctx.code.pop();
    ctx.code.pop();
  }
  l.pc = ctx.code.length;
  for (const r of l.refs) { ctx.code[r] = l.pc; }
  l.refs = [];
}

function jump(ctx: FuncCtx, cont: Label, dest: number): void {
  if (cont === RETURN) {
    emit(ctx, OP.OP_RET, OP.vsLocal(dest));
    return;
  }
  if (cont.pc >= 0) {
    emit(ctx, OP.OP_JMP, cont.pc);
    return;
  }
  emit(ctx, OP.OP_JMP);
  emitRef(ctx, cont);
}

// ---------- misc ----------

function annLoc(ann: A.Ann): Loc {
  if (A.isABlank(ann)) { return A.dummyLoc; }
  return (ann as any).l;
}

export function locArray(l: Loc): any[] {
  switch (l.$name) {
    case 'builtin':
      return [l.moduleName];
    case 'srcloc':
      return [l.source, l.startLine, l.startColumn, l.startChar,
        l.endLine, l.endColumn, l.endChar];
    default:
      throw new InternalCompilerError('vm-compile: unknown Loc');
  }
}
