/*
  pvm -- the Pyret virtual machine.

  This is the execution half of the interpreter backend. Its input is the
  bytecode produced by src/ts-compiler/src/vm/vm-compile.ts from the
  same ANF the JS code generator consumes, and it runs that bytecode
  against the unmodified runtime in this directory: identical value
  representations (PFunction/PMethod/PObject, js-numbers, `{"$var": v}`
  cells), identical helper entry points (makeVariantConstructor, _checkAnn,
  getFieldLoc, ...), identical module/Loadable protocol. A program can
  therefore mix interpreted and compiled modules freely, which is exactly
  what code.pyret.org does: its builtins ship precompiled and only the
  user's modules are interpreted.

  Shape of the machine
  --------------------
  A register machine over an explicit array of frames. Each frame is
    { fdef, code, pc, locals, upvals, mod, dest, locK }
  where `locals` is the flat slot array the compiler sized, `upvals` are
  the by-value captures of the closure being run, `dest` is the caller
  slot the result goes to, and `locK` indexes the call site currently
  being evaluated (used for stack traces). Calls between interpreted
  functions push a frame and jump; they do not grow the JS stack, which is
  what makes the two hard parts easy:

    * Suspension. When the runtime's trampoline wants the program to
      yield -- to service the event loop, or because a builtin called
      pauseStack for I/O -- the machine's entire continuation is already
      a heap object. It hands the state to one ActivationRecord and
      returns the Cont; resuming re-enters `runMachine` with that state.
      No per-function step-numbering, no saved-variable lists.
    * Deep recursion. Frames live on the heap, so interpreted recursion
      is bounded by memory, not by the JS stack, and proper tail calls
      reuse the frame outright.

  Crossing into JS-land (a builtin, or a module compiled by the JS
  backend) is an ordinary `.app(...)` call. If it comes back a Cont, the
  machine appends its own ActivationRecord and returns it, exactly as
  generated code does -- so from the trampoline's point of view an
  interpreted activation is just one more frame.
*/
define("pyret-base/js/pyret-vm", [], function() {

  // Must match src/ts-compiler/src/vm/opcodes.ts.
  var FORMAT_VERSION = 3;

  var OPCODE_NAMES = [
    'MOVE', 'BOX', 'UNBOX', 'SETVAR', 'LETREC', 'MODREF', 'MODVARREF', 'ARRSET',
    'JMP', 'IF', 'RET', 'CALL', 'TAILCALL', 'METHCALL', 'PRIMAPP', 'CLOSURE',
    'METHOD', 'OBJ', 'EXTEND', 'UPDATE', 'DOT', 'COLON', 'GETBANG', 'TUPLE',
    'TUPLEGET', 'REF', 'CASES', 'CASESPRE', 'CASESBIND', 'DATA', 'NEWTYPE',
    'MKANN', 'ANNCHECK', 'TUPLECHK', 'MODULE', 'ANNCHECKV'
  ];

  var OP_MOVE = 0, OP_BOX = 1, OP_UNBOX = 2, OP_SETVAR = 3, OP_LETREC = 4,
      OP_MODREF = 5, OP_MODVARREF = 6, OP_ARRSET = 7, OP_JMP = 8, OP_IF = 9,
      OP_RET = 10, OP_CALL = 11, OP_TAILCALL = 12, OP_METHCALL = 13,
      OP_PRIMAPP = 14, OP_CLOSURE = 15, OP_METHOD = 16, OP_OBJ = 17,
      OP_EXTEND = 18, OP_UPDATE = 19, OP_DOT = 20, OP_COLON = 21,
      OP_GETBANG = 22, OP_TUPLE = 23, OP_TUPLEGET = 24, OP_REF = 25,
      OP_CASES = 26, OP_CASESPRE = 27, OP_CASESBIND = 28, OP_DATA = 29,
      OP_NEWTYPE = 30, OP_MKANN = 31, OP_ANNCHECK = 32, OP_TUPLECHK = 33,
      OP_MODULE = 34, OP_ANNCHECKV = 35;

  // value-source tags
  var VS_LOCAL = 0, VS_UPVAL = 1, VS_CONST = 2, VS_GLOBAL = 3;

  // constant-pool descriptor tags
  var CONST_NUM_STR = 0, CONST_FIXNUM = 1, CONST_STR = 2, CONST_BOOL = 3,
      CONST_UNDEFINED = 4, CONST_RT = 5, CONST_LOC = 6;

  // annotation descriptor tags
  var ANN_VALUE = 0, ANN_ANY = 1, ANN_FUNCTION = 2, ANN_METHOD = 3,
      ANN_RECORD = 4, ANN_TUPLE = 5, ANN_PRED = 6, ANN_DOT = 7;

  // ANN_PRED dereference modes; see opcodes.ts.
  var DEREF_NONE = 0, DEREF_VAR = 1, DEREF_VAR_CHECKED = 2;

  // provided-value descriptor tags
  var REF_LOCAL = 0, REF_REMOTE = 1;

  // ---------------------------------------------------------------
  // Closure values
  //
  // Interpreted closures must satisfy the runtime's isFunction/isMethod
  // (`instanceof PFunction` / `PMethod`), so they are built on the very
  // same prototypes -- borrowed once from a throwaway instance rather
  // than duplicated here, so there is exactly one definition of what a
  // Pyret function is. The extra `$pvm` field is what lets a call site
  // recognize "this callee is bytecode, push a frame" instead of
  // crossing into JS.
  // ---------------------------------------------------------------

  function getCtors(R) {
    if (R.$pvmCtors !== undefined) { return R.$pvmCtors; }
    function PVMFunction(app, name, pvm) {
      this.app = app;
      // Same fallback PFunction applies: an anonymous lambda carries the
      // empty string as its name, and prints as <function:anonymous>.
      this.name = name || "anonymous";
      this.$pvm = pvm;
    }
    PVMFunction.prototype = Object.getPrototypeOf(R.makeFunction(function() {}, "$pvm"));
    // Methods carry their descriptor under a *different* name than
    // functions do: a call site that says `f(x)` must reject a method
    // exactly as generated code's `typeof f.app !== "function"` does, so
    // it must not find anything under $pvm on a method.
    function PVMMethod(meth, full_meth, name, pvm) {
      this["meth"] = meth;
      this["full_meth"] = full_meth;
      this.name = name || "anonymous";
      this.$pvmm = pvm;
    }
    PVMMethod.prototype = Object.getPrototypeOf(R.makeMethodN(function() {}, "$pvm"));
    // The runtime's continuation class, borrowed the same way: the dispatch
    // loop tests for one after every crossing into JS-land, and a direct
    // `instanceof` against a cached constructor is what makes that test
    // free on the overwhelmingly common non-continuation result.
    // (Pause derives from Cont, so it is covered too.)
    R.$pvmCtors = { fun: PVMFunction, meth: PVMMethod, cont: R.makeCont().constructor };
    return R.$pvmCtors;
  }

  // ---------------------------------------------------------------
  // Loading a program
  // ---------------------------------------------------------------

  function Mod(R, NS, uri, prog) {
    this.R = R;
    this.NS = NS;
    this.uri = uri;
    this.prog = prog;
    this.locs = prog.locs;
    this.names = prog.names;
    this.funcs = prog.funcs;
    this.dispatches = prog.dispatches;
    this.anns = prog.anns;
    this.datas = prog.datas;
    this.modules = prog.modules;
    this.consts = new Array(prog.consts.length);
    this.globals = new Array(prog.globals.length);
  }

  function resolveConsts(mod) {
    var R = mod.R, descs = mod.prog.consts, out = mod.consts;
    for (var i = 0; i < descs.length; i++) {
      var d = descs[i];
      switch (d[0]) {
        case CONST_NUM_STR: out[i] = R.makeNumberFromString(d[1]); break;
        case CONST_FIXNUM: out[i] = d[1]; break;
        case CONST_STR: out[i] = d[1]; break;
        case CONST_BOOL: out[i] = d[1]; break;
        case CONST_UNDEFINED: out[i] = undefined; break;
        case CONST_RT: out[i] = R[d[1]]; break;
        case CONST_LOC: out[i] = mod.locs[d[1]]; break;
        default: throw new Error("pvm: unknown constant tag " + d[0]);
      }
    }
  }

  // Resolved in order, which is why a hoisted field ('f') may refer to an
  // earlier global: the emitter only ever derives one from a global it has
  // already created.
  function resolveGlobals(mod, deps) {
    var R = mod.R, descs = mod.prog.globals, out = mod.globals;
    for (var i = 0; i < descs.length; i++) {
      var d = descs[i];
      switch (d[0]) {
        case 'd': out[i] = deps[d[1]]; break;
        case 'm': out[i] = R.getModuleField(d[1], d[2], d[3]); break;
        default: out[i] = out[d[1]].dict.values.dict[d[2]]; break;
      }
    }
  }

  // ---------------------------------------------------------------
  // Frames and machine state
  // ---------------------------------------------------------------

  // One frame. Frames are pooled per machine state (see runMachine), so a
  // call reuses the object at its depth rather than allocating one.
  // `locK` is the loc *index* of the call site currently being evaluated:
  // storing the index rather than the array keeps the per-call cost to one
  // integer store, and the srcloc itself is only needed on the cold paths
  // (suspension and stack traces), where frameLoc resolves it.
  function Frame() {
    this.fdef = null;
    this.code = null;
    this.pc = 0;
    this.locals = null;
    this.upvals = null;
    this.mod = null;
    this.dest = -1;
    this.locK = 0;
  }

  function setFrame(f, fdef, mod, upvals, locals, dest) {
    f.fdef = fdef;
    f.code = fdef.c;
    f.pc = 0;
    f.locals = locals;
    f.upvals = upvals;
    f.mod = mod;
    f.dest = dest;
    f.locK = fdef.l;
    return f;
  }

  function frameLoc(f) { return f.mod.locs[f.locK]; }

  // The frame at depth `fp`, reusing the pooled object if there is one.
  function frameAt(frames, fp) {
    var f = frames[fp];
    if (f === undefined) { f = frames[fp] = new Frame(); }
    return f;
  }

  function State(frame) {
    this.frames = [frame];
    this.fp = 0;
    // Where the value handed back by a resumed activation goes: a slot
    // index in the top frame, or -1 to discard it (an annotation check,
    // whose result generated code discards too).
    this.resumeDest = -1;
    this.resumeVal = undefined;
  }

  // Slot arrays are built by pushing, never `new Array(n)`: an array made
  // with a length is HOLEY in V8, and every read of a holey element pays a
  // prototype check. Pushing (including pushing `undefined`, which is a
  // value and not a hole) keeps them PACKED, which is what the dispatch
  // loop reads on every single operand.
  function newLocals(fdef, args, nargs) {
    var locals = [];
    var i = 0;
    for (; i < nargs; i++) { locals.push(args[i]); }
    for (; i < fdef.s; i++) { locals.push(undefined); }
    return locals;
  }

  // Read a tagged value source in the context of frame `f`. Deliberately a
  // free function rather than a closure over the interpreter's loop
  // variables: the loop is re-entered on every crossing from JS-land (every
  // `map` callback, say), and a closure would mean allocating a context
  // each time for the sake of the hottest operation in the machine.
  function rd(vs, f) {
    var i = vs >> 2;
    switch (vs & 3) {
      case VS_LOCAL: return f.locals[i];
      case VS_UPVAL: return f.upvals[i];
      case VS_CONST: return f.mod.consts[i];
      default: return f.mod.globals[i];
    }
  }

  // Suspend: hand the whole machine state to one ActivationRecord and let
  // the trampoline resume us later. `dest` is the slot the resumed value
  // belongs in, or -1 to discard it.
  function suspend(st, f, fp, cont, dest, resumePc) {
    var R = f.mod.R;
    f.pc = resumePc;
    st.fp = fp;
    st.resumeDest = dest;
    cont.stack[R.EXN_STACKHEIGHT++] =
      R.makeActivationRecord(frameLoc(f), resumeMachine, 0, [st], [], 0);
    return cont;
  }

  // Yield to the trampoline at an instruction boundary so the event loop
  // gets a turn. The instruction is re-executed on resume; only operand
  // reads have happened, and those are pure.
  function bounce(st, f, fp, retryPc) {
    var R = f.mod.R;
    f.pc = retryPc;
    st.fp = fp;
    st.resumeDest = -1;
    R.EXN_STACKHEIGHT = 0;
    var cont = R.makeCont();
    cont.stack[R.EXN_STACKHEIGHT++] =
      R.makeActivationRecord(frameLoc(f), resumeMachine, 0, [st], [], 0);
    return cont;
  }

  // Arity mismatch on a call to interpreted code. Cold, and kept out of
  // the dispatch loop so the call cases stay small enough to inline well.
  function arityFail(R, pvm, callee, code, pc, n, f) {
    var args = new Array(n);
    for (var i = 0; i < n; i++) { args[i] = rd(code[pc + i], f); }
    R.checkArityC(pvm.m.locs[callee.l], callee.a, args, callee.m);
  }

  // ---------------------------------------------------------------
  // The interpreter
  // ---------------------------------------------------------------

  function runMachine(st) {
    var frames = st.frames;
    var fp = st.fp;
    var f = frames[fp];
    var R = f.mod.R;
    var CONT = getCtors(R).cont;
    var code = f.code, pc = f.pc, locals = f.locals, upvals = f.upvals, mod = f.mod;
    var names = mod.names, locs = mod.locs;
    var ans;

    if (st.resumeDest >= 0) { locals[st.resumeDest] = st.resumeVal; }
    st.resumeDest = -1;
    st.resumeVal = undefined;

    try {
      for (;;) {
        var op = code[pc++];
        switch (op) {

          case OP_MOVE: {
            var d = code[pc++]; locals[d] = rd(code[pc++], f);
            continue;
          }

          case OP_BOX: {
            var d = code[pc++]; locals[d] = { "$var": rd(code[pc++], f) };
            continue;
          }

          case OP_UNBOX: {
            var d = code[pc++]; locals[d] = rd(code[pc++], f)["$var"];
            continue;
          }

          case OP_SETVAR: {
            var box = rd(code[pc++], f);
            box["$var"] = rd(code[pc++], f);
            locals[code[pc++]] = R.nothing;
            continue;
          }

          case OP_LETREC: {
            var d = code[pc++];
            var cell = rd(code[pc++], f);
            var lk = code[pc++], nk = code[pc++];
            var v = cell["$var"];
            if (v === undefined) {
              R.ffi.throwUninitializedIdMkLoc(locs[lk], names[nk]);
            }
            locals[d] = v;
            continue;
          }

          case OP_MODREF: {
            var d = code[pc++];
            var m = rd(code[pc++], f);
            locals[d] = m.dict.values.dict[names[code[pc++]]];
            continue;
          }

          case OP_MODVARREF: {
            var d = code[pc++];
            var m = rd(code[pc++], f);
            locals[d] = m.dict.values.dict[names[code[pc++]]]["$var"];
            continue;
          }

          case OP_ARRSET: {
            var arr = rd(code[pc++], f);
            var idx = code[pc++];
            arr[idx] = rd(code[pc++], f);
            continue;
          }

          case OP_JMP: {
            pc = code[pc];
            continue;
          }

          case OP_IF: {
            var c = rd(code[pc++], f);
            var target = code[pc++];
            // Pyret booleans are JS booleans; checkPyretTrue is only needed
            // for its error on anything else, so it stays on the cold path.
            if (c === true) { continue; }
            if (c === false) { pc = target; continue; }
            R.checkPyretTrue(c);
            continue;
          }

          case OP_RET: {
            var rv = rd(code[pc++], f);
            var dest = f.dest;
            fp--;
            if (fp < 0) { ++R.GAS; st.fp = -1; return rv; }
            f.locals = null;   // don't pin the returning frame's values
            var callerF = frames[fp];
            callerF.locals[dest] = rv;
            f = callerF;
            code = f.code; pc = f.pc; locals = f.locals; upvals = f.upvals;
            if (mod !== f.mod) {
              mod = f.mod;
              names = mod.names; locs = mod.locs;
            }
            continue;
          }

          case OP_CALL: {
            var ipc = pc - 1;
            var d = code[pc++];
            var fnv = rd(code[pc++], f);
            var lk = code[pc++];
            var n = code[pc++];
            f.locK = lk;
            var pvm = (fnv === undefined || fnv === null) ? undefined : fnv.$pvm;
            if (pvm !== undefined) {
              var callee = pvm.f;
              if (callee.a !== n) { arityFail(R, pvm, callee, code, pc, n, f); }
              if (--R.RUNGAS <= 0) { return bounce(st, f, fp, ipc); }
              // The arguments are written straight into the callee's slot
              // array; there is no intermediate argument array on this path.
              var nlocals = [];
              for (var i = 0; i < n; i++) { nlocals.push(rd(code[pc++], f)); }
              for (var i = n; i < callee.s; i++) { nlocals.push(undefined); }
              f.pc = pc;
              fp++;
              f = setFrame(frameAt(frames, fp), callee, pvm.m, pvm.u, nlocals, d);
              code = f.code; pc = 0; locals = nlocals; upvals = f.upvals;
              if (mod !== f.mod) {
                mod = f.mod;
                names = mod.names; locs = mod.locs;
              }
              continue;
            }
            if (fnv === undefined || fnv === null || typeof fnv.app !== "function") {
              R.ffi.throwNonFunApp(locs[lk], fnv);
            }
            ans = applyJS(fnv, code, pc, n, f);
            pc += n;
            if (ans instanceof CONT) { return suspend(st, f, fp, ans, d, pc); }
            locals[d] = ans;
            continue;
          }

          case OP_TAILCALL: {
            var ipc = pc - 1;
            var fnv = rd(code[pc++], f);
            var lk = code[pc++];
            var n = code[pc++];
            f.locK = lk;
            var pvm = (fnv === undefined || fnv === null) ? undefined : fnv.$pvm;
            if (pvm !== undefined) {
              var callee = pvm.f;
              if (callee.a !== n) { arityFail(R, pvm, callee, code, pc, n, f); }
              // Before anything is written: reusing the frame overwrites the
              // slots a retried instruction would read its arguments from,
              // so the yield has to happen while the frame is untouched.
              if (--R.RUNGAS <= 0) { return bounce(st, f, fp, ipc); }
              // Frame reuse is safe because ANF bindings are
              // single-assignment and closures captured their upvalues by
              // value: nothing can observe the outgoing slots. The slot
              // array is reused too when it is large enough -- which is
              // always the case for a self tail call, i.e. every loop --
              // so an iteration allocates nothing.
              var reuse = (locals.length >= callee.s);
              var nlocals = reuse ? locals : [];
              // Arguments are all read before any is written, because under
              // frame reuse they are read out of the very array being
              // overwritten.
              if (n === 1) {
                var a0 = rd(code[pc], f);
                if (reuse) { nlocals[0] = a0; } else { nlocals.push(a0); }
                pc += 1;
              } else if (n === 2) {
                var b0 = rd(code[pc], f), b1 = rd(code[pc + 1], f);
                if (reuse) { nlocals[0] = b0; nlocals[1] = b1; }
                else { nlocals.push(b0); nlocals.push(b1); }
                pc += 2;
              } else if (n === 3) {
                var c0 = rd(code[pc], f), c1 = rd(code[pc + 1], f), c2 = rd(code[pc + 2], f);
                if (reuse) { nlocals[0] = c0; nlocals[1] = c1; nlocals[2] = c2; }
                else { nlocals.push(c0); nlocals.push(c1); nlocals.push(c2); }
                pc += 3;
              } else if (n > 0) {
                var incoming = [];
                for (var i = 0; i < n; i++) { incoming.push(rd(code[pc + i], f)); }
                for (var i = 0; i < n; i++) {
                  if (reuse) { nlocals[i] = incoming[i]; } else { nlocals.push(incoming[i]); }
                }
                pc += n;
              }
              if (!reuse) {
                for (var i = n; i < callee.s; i++) { nlocals.push(undefined); }
              }
              f.fdef = callee;
              f.code = code = callee.c;
              f.upvals = upvals = pvm.u;
              f.locals = locals = nlocals;
              f.mod = pvm.m;
              pc = 0;
              if (mod !== f.mod) {
                mod = f.mod;
                names = mod.names; locs = mod.locs;
              }
              continue;
            }
            // The callee turned out to be JS-land, so this is an ordinary
            // call whose result the following RET hands back.
            if (fnv === undefined || fnv === null || typeof fnv.app !== "function") {
              R.ffi.throwNonFunApp(locs[lk], fnv);
            }
            ans = applyJS(fnv, code, pc, n, f);
            pc += n;
            if (ans instanceof CONT) { return suspend(st, f, fp, ans, f.fdef.k, pc); }
            locals[f.fdef.k] = ans;
            continue;
          }

          case OP_METHCALL: {
            var ipc = pc - 1;
            var d = code[pc++];
            var obj = rd(code[pc++], f);
            var nameK = code[pc++];
            var lk = code[pc++];
            var n = code[pc++];
            f.locK = lk;
            var field = R.getColonFieldLoc(obj, names[nameK], locs[lk]);
            var isMeth = false;
            var pvm = undefined;
            if (field !== undefined && field !== null) {
              pvm = field.$pvmm;
              if (pvm !== undefined) { isMeth = true; }
              else { pvm = field.$pvm; }
            }
            if (pvm !== undefined) {
              var callee = pvm.f;
              var off = isMeth ? 1 : 0;
              var nAll = n + off;
              if (callee.a !== nAll) {
                var badArgs = new Array(nAll);
                if (isMeth) { badArgs[0] = obj; }
                for (var i = 0; i < n; i++) { badArgs[i + off] = rd(code[pc + i], f); }
                R.checkArityC(pvm.m.locs[callee.l], callee.a, badArgs, callee.m);
              }
              if (--R.RUNGAS <= 0) { return bounce(st, f, fp, ipc); }
              var nlocals = [];
              if (isMeth) { nlocals.push(obj); }
              for (var i = 0; i < n; i++) { nlocals.push(rd(code[pc++], f)); }
              for (var i = nAll; i < callee.s; i++) { nlocals.push(undefined); }
              f.pc = pc;
              fp++;
              f = setFrame(frameAt(frames, fp), callee, pvm.m, pvm.u, nlocals, d);
              code = f.code; pc = 0; locals = nlocals; upvals = f.upvals;
              if (mod !== f.mod) {
                mod = f.mod;
                names = mod.names; locs = mod.locs;
              }
              continue;
            }
            ans = applyField(R, obj, field, locs[lk], code, pc, n, f);
            pc += n;
            if (ans instanceof CONT) { return suspend(st, f, fp, ans, d, pc); }
            locals[d] = ans;
            continue;
          }

          case OP_PRIMAPP: {
            var d = code[pc++];
            var prim = names[code[pc++]];
            var lk = code[pc++];
            var n = code[pc++];
            f.locK = lk;
            ans = applyPrim(R, prim, code, pc, n, f);
            pc += n;
            if (ans instanceof CONT) { return suspend(st, f, fp, ans, d, pc); }
            locals[d] = ans;
            continue;
          }

          case OP_CLOSURE: {
            var d = code[pc++];
            locals[d] = makeClosure(R, mod, mod.funcs[code[pc++]], locals, upvals);
            continue;
          }

          case OP_METHOD: {
            var d = code[pc++];
            locals[d] = makeMethodClosure(R, mod, mod.funcs[code[pc++]], locals, upvals);
            continue;
          }

          case OP_OBJ: {
            var d = code[pc++];
            var n = code[pc++];
            var dict = {};
            for (var i = 0; i < n; i++) {
              var k = names[code[pc++]];
              dict[k] = rd(code[pc++], f);
            }
            locals[d] = R.makeObject(dict);
            continue;
          }

          case OP_EXTEND: {
            var d = code[pc++];
            var obj = rd(code[pc++], f);
            var lk = code[pc++];
            var n = code[pc++];
            var ext = {};
            for (var i = 0; i < n; i++) {
              var k = names[code[pc++]];
              ext[k] = rd(code[pc++], f);
            }
            locals[d] = R.extendObj(locs[lk], obj, ext);
            continue;
          }

          case OP_UPDATE: {
            var d = code[pc++];
            var obj = rd(code[pc++], f);
            var lk = code[pc++];
            var objLk = code[pc++];
            var n = code[pc++];
            var fieldNames = new Array(n), fieldVals = new Array(n), fieldLocs = new Array(n);
            for (var i = 0; i < n; i++) {
              fieldNames[i] = names[code[pc++]];
              fieldVals[i] = rd(code[pc++], f);
              fieldLocs[i] = locs[code[pc++]];
            }
            f.locK = lk;
            ans = R.checkRefAnns(obj, fieldNames, fieldVals, fieldLocs, locs[lk], locs[objLk]);
            if (ans instanceof CONT) { return suspend(st, f, fp, ans, d, pc); }
            locals[d] = ans;
            continue;
          }

          case OP_DOT: {
            var d = code[pc++];
            var obj = rd(code[pc++], f);
            var nameK = code[pc++];
            var lk = code[pc++];
            f.locK = lk;
            locals[d] = R.getFieldLoc(obj, names[nameK], locs[lk]);
            continue;
          }

          case OP_COLON: {
            var d = code[pc++];
            var obj = rd(code[pc++], f);
            var nameK = code[pc++];
            var lk = code[pc++];
            locals[d] = R.getColonFieldLoc(obj, names[nameK], locs[lk]);
            continue;
          }

          case OP_GETBANG: {
            var d = code[pc++];
            var obj = rd(code[pc++], f);
            var nameK = code[pc++];
            var lk = code[pc++];
            locals[d] = R.getFieldRef(obj, names[nameK], locs[lk]);
            continue;
          }

          case OP_TUPLE: {
            var d = code[pc++];
            var n = code[pc++];
            var vals = new Array(n);
            for (var i = 0; i < n; i++) { vals[i] = rd(code[pc++], f); }
            locals[d] = R.makeTuple(vals);
            continue;
          }

          case OP_TUPLEGET: {
            var d = code[pc++];
            var t = rd(code[pc++], f);
            var idx = code[pc++];
            locals[d] = R.getTuple(t, idx, locs[code[pc++]]);
            continue;
          }

          case OP_REF: {
            locals[code[pc++]] = R.makeGraphableRef();
            continue;
          }

          case OP_CASES: {
            var v = rd(code[pc++], f);
            var table = mod.dispatches[code[pc++]];
            var lk = code[pc++];
            var elseTarget = code[pc++];
            f.locK = lk;
            var target = table[v.$name];
            pc = (target === undefined) ? elseTarget : target;
            continue;
          }

          case OP_CASESPRE: {
            var v = rd(code[pc++], f);
            var wanted = code[pc++];
            var brLk = code[pc++];
            var casesLk = code[pc++];
            var got = v.$arity;
            if (wanted < 0) {
              if (got !== -1) {
                R.ffi.throwCasesSingletonErrorC(locs[brLk], false, locs[casesLk], v.$loc);
              }
            } else if (got !== wanted) {
              if (got >= 0) {
                R.ffi.throwCasesArityErrorC(locs[brLk], wanted, got, locs[casesLk], v.$loc);
              } else {
                R.ffi.throwCasesSingletonErrorC(locs[brLk], true, locs[casesLk], v.$loc);
              }
            }
            continue;
          }

          case OP_CASESBIND: {
            var v = rd(code[pc++], f);
            var n = code[pc++];
            var fieldNames = v.$constructor.$fieldNames;
            var mask = v.$mut_fields_mask;
            for (var i = 0; i < n; i++) {
              var slot = code[pc++];
              var isRef = code[pc++] === 1;
              locals[slot] = R.derefField(v.dict[fieldNames[i]], mask[i], isRef);
            }
            continue;
          }

          case OP_DATA: {
            var d = code[pc++];
            locals[d] = buildData(R, mod, mod.datas[code[pc++]], f);
            continue;
          }

          case OP_NEWTYPE: {
            var dBrander = code[pc++];
            var dAnn = code[pc++];
            var nm = names[code[pc++]];
            var brander = R.namedBrander(nm, locs[code[pc++]]);
            locals[dBrander] = brander;
            locals[dAnn] = R.makeBranderAnn(brander, nm);
            continue;
          }

          case OP_MKANN: {
            var d = code[pc++];
            locals[d] = buildAnn(R, mod, code[pc++], f);
            continue;
          }

          case OP_ANNCHECK: {
            var annIdx = code[pc++];
            var v = rd(code[pc++], f);
            var lk = code[pc++];
            f.locK = lk;
            ans = R._checkAnn(locs[lk], buildAnn(R, mod, annIdx, f), v);
            if (ans instanceof CONT) { return suspend(st, f, fp, ans, -1, pc); }
            continue;
          }

          case OP_ANNCHECKV: {
            var annVal = rd(code[pc++], f);
            var v = rd(code[pc++], f);
            var lk = code[pc++];
            f.locK = lk;
            ans = R._checkAnn(locs[lk], annVal, v);
            if (ans instanceof CONT) { return suspend(st, f, fp, ans, -1, pc); }
            continue;
          }

          case OP_TUPLECHK: {
            var v = rd(code[pc++], f);
            var n = code[pc++];
            R.checkTupleBind(v, n, locs[code[pc++]]);
            continue;
          }

          case OP_MODULE: {
            var d = code[pc++];
            locals[d] = buildModuleValue(R, mod, mod.modules[code[pc++]], f);
            continue;
          }

          default:
            throw new Error("pvm: unknown opcode " + op + " at pc " + (pc - 1) +
                            " in " + f.fdef.n + " (" + mod.uri + ")");
        }
      }
    } catch (e) {
      if (R.isPyretException(e)) {
        // Attribute the failure to the interpreted frames it passed
        // through, innermost first -- the same information the JS backend
        // contributes from its ActivationRecords.
        f.pc = pc;
        for (var i = fp; i >= 0; i--) {
          e.pyretStack.push(frameLoc(frames[i]));
        }
      }
      throw e;
    }
  }

  function resumeMachine(ar) {
    var st = ar.args[0];
    st.resumeVal = ar.ans;
    return runMachine(st);
  }

  // ---------------------------------------------------------------
  // Calling out
  // ---------------------------------------------------------------

  // Applying a JS-land callee. Spelled out per arity so that the common
  // cases neither allocate an argument array nor go through `apply`.
  function applyJS(fnv, code, pc, n, f) {
    switch (n) {
      case 0: return fnv.app();
      case 1: return fnv.app(rd(code[pc], f));
      case 2: return fnv.app(rd(code[pc], f), rd(code[pc + 1], f));
      case 3: return fnv.app(rd(code[pc], f), rd(code[pc + 1], f), rd(code[pc + 2], f));
      case 4: return fnv.app(rd(code[pc], f), rd(code[pc + 1], f), rd(code[pc + 2], f),
                             rd(code[pc + 3], f));
      default: {
        var args = new Array(n);
        for (var i = 0; i < n; i++) { args[i] = rd(code[pc + i], f); }
        return fnv.app.apply(null, args);
      }
    }
  }

  // `obj.m(...)` where the field turned out not to be interpreted code:
  // a method takes the receiver as its first argument, a plain function does
  // not. Spelled out per arity for the same reason applyJS is.
  function applyField(R, obj, field, loc, code, pc, n, f) {
    if (R.isMethod(field)) {
      switch (n) {
        case 0: return field.full_meth(obj);
        case 1: return field.full_meth(obj, rd(code[pc], f));
        case 2: return field.full_meth(obj, rd(code[pc], f), rd(code[pc + 1], f));
        case 3: return field.full_meth(obj, rd(code[pc], f), rd(code[pc + 1], f),
                                       rd(code[pc + 2], f));
        default: {
          var args = new Array(n + 1);
          args[0] = obj;
          for (var i = 0; i < n; i++) { args[i + 1] = rd(code[pc + i], f); }
          return field.full_meth.apply(null, args);
        }
      }
    }
    if (!R.isFunction(field)) {
      R.ffi.throwNonFunApp(loc, field);
    }
    return applyJS(field, code, pc, n, f);
  }

  function applyPrim(R, prim, code, pc, n, f) {
    var fn = R[prim];
    if (typeof fn !== "function") {
      throw new Error("pvm: no runtime primitive named " + prim);
    }
    switch (n) {
      case 0: return fn();
      case 1: return fn(rd(code[pc], f));
      case 2: return fn(rd(code[pc], f), rd(code[pc + 1], f));
      case 3: return fn(rd(code[pc], f), rd(code[pc + 1], f), rd(code[pc + 2], f));
      default: {
        var args = new Array(n);
        for (var i = 0; i < n; i++) { args[i] = rd(code[pc + i], f); }
        return fn.apply(R, args);
      }
    }
  }

  // ---------------------------------------------------------------
  // Calling in: the .app / .full_meth wrappers a JS caller sees
  // ---------------------------------------------------------------

  function captureUpvals(fdef, locals, upvals) {
    var descs = fdef.u, n = descs.length;
    if (n === 0) { return EMPTY_UPVALS; }
    var out = [];
    for (var i = 0; i < n; i++) {
      var dsc = descs[i];
      out.push((dsc & 1) ? upvals[dsc >> 1] : locals[dsc >> 1]);
    }
    return out;
  }
  var EMPTY_UPVALS = [];

  function enter(R, mod, fdef, captured, args, nargs) {
    if (fdef.a >= 0 && fdef.a !== nargs) {
      R.checkArityC(mod.locs[fdef.l], fdef.a, args, fdef.m);
    }
    var st = new State(setFrame(new Frame(), fdef, mod, captured,
      newLocals(fdef, args, nargs), -1));
    if (--R.GAS <= 0 || --R.RUNGAS <= 0) {
      R.EXN_STACKHEIGHT = 0;
      var cont = R.makeCont();
      cont.stack[R.EXN_STACKHEIGHT++] =
        R.makeActivationRecord(mod.locs[fdef.l], resumeMachine, 0, [st], [], 0);
      return cont;
    }
    return runMachine(st);
  }

  function makeClosure(R, mod, fdef, locals, upvals) {
    var captured = captureUpvals(fdef, locals, upvals);
    var pvm = { f: fdef, u: captured, m: mod };
    return new (getCtors(R).fun)(function() {
      var n = arguments.length;
      var args = new Array(n);
      for (var i = 0; i < n; i++) { args[i] = arguments[i]; }
      return enter(R, mod, fdef, captured, args, n);
    }, fdef.n, pvm);
  }

  function makeMethodClosure(R, mod, fdef, locals, upvals) {
    var captured = captureUpvals(fdef, locals, upvals);
    var pvm = { f: fdef, u: captured, m: mod };
    var full = function() {
      var n = arguments.length;
      var args = new Array(n);
      for (var i = 0; i < n; i++) { args[i] = arguments[i]; }
      return enter(R, mod, fdef, captured, args, n);
    };
    // `meth` is the curried form the runtime uses when a method is looked
    // up with `.` rather than called: it must yield a function of the
    // remaining arguments.
    var curried = function(obj) {
      return function() {
        var n = arguments.length;
        var args = new Array(n + 1);
        args[0] = obj;
        for (var i = 0; i < n; i++) { args[i + 1] = arguments[i]; }
        return enter(R, mod, fdef, captured, args, n + 1);
      };
    };
    return new (getCtors(R).meth)(curried, full, fdef.n, pvm);
  }

  // ---------------------------------------------------------------
  // Annotations
  // ---------------------------------------------------------------

  /*
    Building an annotation happens in two steps, because of one case: a
    `data` member's refinement may name a function defined LATER in the same
    letrec group. The JS back end handles this by thunking its compiled anns
    ("references to rec ids that should be resolved later"), and the machine
    has to do the same -- except that by the time such a thunk runs, the
    frame the annotation's operands came from is long gone (frames are
    pooled, slot arrays reused).

    So: `captureAnn` resolves every value source against the frame NOW,
    which for a letrec id yields the {"$var": v} cell rather than its
    contents; `forceAnn` builds the annotation objects later, reading
    through those cells at that point. Immediate uses just do both at once.
  */
  function captureAnn(mod, idx, f) {
    var d = mod.anns[idx];
    switch (d[0]) {
      case ANN_VALUE: return [ANN_VALUE, rd(d[1], f)];
      case ANN_ANY: case ANN_FUNCTION: case ANN_METHOD: return d;
      case ANN_RECORD: {
        var kids = new Array(d[3].length);
        for (var i = 0; i < d[3].length; i++) { kids[i] = captureAnn(mod, d[3][i], f); }
        return [ANN_RECORD, d[1], d[2], kids, d[4]];
      }
      case ANN_TUPLE: {
        var tkids = new Array(d[2].length);
        for (var j = 0; j < d[2].length; j++) { tkids[j] = captureAnn(mod, d[2][j], f); }
        return [ANN_TUPLE, d[1], tkids, d[3]];
      }
      case ANN_PRED:
        return [ANN_PRED, captureAnn(mod, d[1], f), rd(d[2], f), d[3], d[4], d[5]];
      case ANN_DOT:
        return [ANN_DOT, d[1], d[2], rd(d[3], f), d[4]];
      default:
        throw new Error("pvm: unknown annotation tag " + d[0]);
    }
  }

  function forceAnn(R, mod, c) {
    switch (c[0]) {
      case ANN_VALUE: return c[1];
      case ANN_ANY: return R.Any;
      case ANN_FUNCTION: return R.Function;
      case ANN_METHOD: return R.Method;
      case ANN_RECORD: {
        var nameKs = c[1], locKs = c[2], kids = c[3], optNameK = c[4];
        var names = new Array(nameKs.length), locsArr = new Array(locKs.length), obj = {};
        for (var i = 0; i < nameKs.length; i++) {
          names[i] = mod.names[nameKs[i]];
          locsArr[i] = mod.locs[locKs[i]];
          obj[names[i]] = forceAnn(R, mod, kids[i]);
        }
        return R.makeRecordAnn(names, locsArr, obj,
          optNameK < 0 ? undefined : mod.names[optNameK]);
      }
      case ANN_TUPLE: {
        var tlocKs = c[1], tkids = c[2], toptNameK = c[3];
        var tlocs = new Array(tlocKs.length), anns = new Array(tkids.length);
        for (var j = 0; j < tlocKs.length; j++) {
          tlocs[j] = mod.locs[tlocKs[j]];
          anns[j] = forceAnn(R, mod, tkids[j]);
        }
        return R.makeTupleAnn(tlocs, anns,
          toptNameK < 0 ? undefined : mod.names[toptNameK]);
      }
      case ANN_PRED: {
        var pred = c[2];
        if (c[4] !== DEREF_NONE) {
          var v = pred["$var"];
          if (v === undefined && c[4] === DEREF_VAR_CHECKED) {
            R.ffi.throwUninitializedIdMkLoc(mod.locs[c[5]], mod.names[c[3]]);
          }
          pred = v;
        }
        return R.makePredAnn(forceAnn(R, mod, c[1]), pred, mod.names[c[3]]);
      }
      case ANN_DOT:
        return R.getDotAnn(mod.locs[c[1]], mod.names[c[2]], c[3].dict.types, mod.names[c[4]]);
      default:
        throw new Error("pvm: unknown captured annotation tag " + c[0]);
    }
  }

  function buildAnn(R, mod, idx, f) {
    return forceAnn(R, mod, captureAnn(mod, idx, f));
  }

  // ---------------------------------------------------------------
  // data declarations
  // ---------------------------------------------------------------

  // A variant's $app_fields: hands each field to `k`, dereferenced
  // according to whether the field is a `ref` and whether the caller asked
  // for the reference or the value (`refmask`) -- the same contract the JS
  // back end generates per variant.
  function makeAppFields(R, fieldNames, muts) {
    var n = fieldNames.length;
    if (n === 0) {
      return function(k) { return k(); };
    }
    return function(k, refmask) {
      var args = new Array(n);
      for (var i = 0; i < n; i++) {
        args[i] = R.derefField(this.dict[fieldNames[i]], muts[i], refmask[i]);
      }
      return k.apply(null, args);
    };
  }

  // The deferred half of the two-step above: makeVariantConstructor calls
  // this once, when it first generates the variant's constructor.
  function makeAnnThunk(R, mod, caps) {
    return function() {
      var out = new Array(caps.length);
      for (var i = 0; i < caps.length; i++) { out[i] = forceAnn(R, mod, caps[i]); }
      return out;
    };
  }

  function buildData(R, mod, desc, f) {
    var externalBrand = rd(desc.b, f);
    var dataLoc = mod.locs[desc.l];
    var shared = {};
    for (var i = 0; i < desc.sh.length; i++) {
      shared[desc.sh[i][0]] = rd(desc.sh[i][1], f);
    }
    var dict = {};
    dict[desc.n] = R.getFieldLoc(externalBrand, "test", dataLoc);
    for (var vi = 0; vi < desc.vs.length; vi++) {
      var v = desc.vs[vi];
      var vLoc = mod.locs[v.l];
      var fieldNames = [], muts = [], jsNames = [];
      var annCaps = [], checkArgs = [], checkLocs = [];
      for (var mi = 0; mi < v.ms.length; mi++) {
        var m = v.ms[mi];
        fieldNames.push(m.n);
        muts.push(m.m);
        jsNames.push(m.j);
        if (m.a >= 0) {
          // Captured here, built when the constructor is first called --
          // the refinement may name something not yet initialized.
          annCaps.push(captureAnn(mod, m.a, f));
          checkArgs.push(m.j);
          checkLocs.push(mod.locs[m.al]);
        }
      }
      var base = {};
      if (v.k === 'v') { base["$fieldNames"] = fieldNames; }
      for (var si = 0; si < desc.sh.length; si++) {
        base[desc.sh[si][0]] = shared[desc.sh[si][0]];
      }
      for (var wi = 0; wi < v.w.length; wi++) {
        base[v.w[wi][0]] = rd(v.w[wi][1], f);
      }
      base["_match"] = R.makeMatch(v.n, fieldNames.length);
      var brander = R.namedBrander(v.n, vLoc);
      var brands = {};
      brands[externalBrand._brand] = true;
      brands[brander._brand] = true;
      var appFields = makeAppFields(R, fieldNames, muts);
      dict[checkerName(v.n)] = R.getFieldLoc(brander, "test", vLoc);
      if (v.k === 'v') {
        dict[v.n] = R.makeVariantConstructor(
          vLoc,
          makeAnnThunk(R, mod, annCaps),
          checkArgs, checkLocs, muts,
          jsNames, muts,
          base, brands, v.n, appFields, base);
      } else {
        dict[v.n] = R.makeDataValue(base, brands, v.n, appFields, -1, muts, base, false, vLoc);
      }
    }
    return R.makeObject(dict);
  }

  // Mirrors ast.arr's make-checker-name.
  function checkerName(name) { return "is-" + name; }

  // ---------------------------------------------------------------
  // The module value
  // ---------------------------------------------------------------

  function readRef(R, ref, f) {
    if (ref[0] === REF_LOCAL) {
      var v = rd(ref[1], f);
      return ref[2] ? v["$var"] : v;
    }
    return R.getModuleField(ref[1], ref[2], ref[3]);
  }

  function buildModuleValue(R, mod, desc, f) {
    var definedModules = {};
    for (var i = 0; i < desc.definedModules.length; i++) {
      definedModules[desc.definedModules[i][0]] = rd(desc.definedModules[i][1], f);
    }
    var definedValues = {};
    for (var i = 0; i < desc.definedValues.length; i++) {
      definedValues[desc.definedValues[i][0]] = rd(desc.definedValues[i][1], f);
    }
    var definedTypes = {};
    for (var i = 0; i < desc.definedTypes.length; i++) {
      definedTypes[desc.definedTypes[i][0]] = buildAnn(R, mod, desc.definedTypes[i][1], f);
    }
    var provideValues = {};
    for (var i = 0; i < desc.provideValues.length; i++) {
      provideValues[desc.provideValues[i][0]] = readRef(R, desc.provideValues[i][1], f);
    }
    var provideTypes = {};
    for (var i = 0; i < desc.provideTypes.length; i++) {
      var t = desc.provideTypes[i][1];
      provideTypes[desc.provideTypes[i][0]] =
        (t[0] === 'a') ? buildAnn(R, mod, t[1], f) : R.getModuleField(t[1], t[2], t[3]);
    }
    var provideModules = {};
    for (var i = 0; i < desc.provideModules.length; i++) {
      var pm = desc.provideModules[i][1];
      provideModules[desc.provideModules[i][0]] =
        (pm[0] === 'l') ? rd(pm[1], f) : R.modules[pm[1]];
    }
    return R.makeObject({
      "answer": rd(desc.answer, f),
      "namespace": mod.NS,
      "locations": mod.locs,
      "defined-modules": definedModules,
      "defined-values": definedValues,
      "defined-types": definedTypes,
      "provide-plus-types": R.makeObject({
        "values": R.makeObject(provideValues),
        "types": provideTypes,
        "modules": provideModules
      }),
      "checks": rd(desc.checks, f)
    });
  }

  // ---------------------------------------------------------------
  // Entry point used by every compiled-by-vm module
  // ---------------------------------------------------------------

  function runModule(R, NS, uri, deps, prog) {
    if (prog.v !== FORMAT_VERSION) {
      throw new Error(
        "pvm: module " + uri + " was compiled for bytecode format " + prog.v +
        " but this machine speaks " + FORMAT_VERSION +
        " (delete the interpreter's compiled-module cache and rebuild)");
    }
    var mod = new Mod(R, NS, uri, prog);
    resolveConsts(mod);
    resolveGlobals(mod, deps);
    var main = prog.funcs[prog.main];
    return R.safeCall(function() {
      return enter(R, mod, main, EMPTY_UPVALS, EMPTY_ARGS, 0);
    }, function(moduleVal) {
      R.modules[prog.moduleId] = moduleVal;
      return moduleVal;
    }, "pvm: evaluating " + uri);
  }
  var EMPTY_ARGS = [];

  return {
    runModule: runModule,
    FORMAT_VERSION: FORMAT_VERSION,
    OPCODE_NAMES: OPCODE_NAMES
  };
});
