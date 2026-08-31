/*
  Opcode table and program-format constants for the Pyret VM ("pvm").

  This is the *compiler* side of the contract; the machine side is
  src/js/base/pyret-vm.js, which repeats the same ordered opcode list.
  The two are kept in lockstep by tests/vm/opcode-parity-test (which
  diffs OPCODE_NAMES against the VM's exported table) and, at run time, by
  the FORMAT_VERSION stamped into every emitted program: the VM refuses a
  program whose version it does not recognize, so a stale compiled-module
  cache fails loudly instead of misinterpreting bytecode.

  Instruction encoding
  --------------------
  Code is a flat array of small non-negative integers: an opcode followed
  by a fixed (or self-describing, for the variadic call/object forms)
  operand list. Destinations are always plain local-slot indices. Operands
  that read a value use the tagged "value source" encoding below, so a
  single integer can name a local, a captured upvalue, a program constant
  or a module-level global without an extra load instruction.

      vs & 3 === VS_LOCAL   -> frame locals[vs >> 2]
      vs & 3 === VS_UPVAL   -> closure upvals[vs >> 2]
      vs & 3 === VS_CONST   -> program consts[vs >> 2]
      vs & 3 === VS_GLOBAL  -> module globals[vs >> 2]

  ANF guarantees every binding is assigned exactly once, so upvalues are
  captured *by value* when a closure is built: Pyret's mutable bindings
  (`var`, and the letrec cells) are themselves {"$var": v} boxes bound
  once, exactly as the JS backend represents them. That is what makes
  frame reuse on tail calls safe, and it is why there are no upvalue
  cells in this machine.
*/

// Bump when the bytecode format or opcode numbering changes; compiled
// modules cached from an older VM are then rejected on load.
//
// Since version 5, the locK operand of CALL/TAILCALL/METHCALL is
// (lk << 1) | alFlag: the machine always sets the frame's locK (error
// attribution), and sets locKS -- the cont backend's stale $al shadow,
// read by pause traces -- only when the flag is set (cont does not update
// $al at statically-flat call sites or maybeMethodCall sites). PRIMAPP,
// DOT, CASES, ANNCHECK, ANNCHECKV and TUPLECHK carry unshifted locKs and
// always update both, matching where generated code assigns $al.
export const FORMAT_VERSION = 5;

// The AMD module name the emitted stub pulls the machine in from.
export const VM_MODULE_NAME = 'pyret-base/js/pyret-vm';

// ---------- value sources ----------

export const VS_LOCAL = 0;
export const VS_UPVAL = 1;
export const VS_CONST = 2;
export const VS_GLOBAL = 3;

export const vsLocal = (i: number): number => (i << 2) | VS_LOCAL;
export const vsUpval = (i: number): number => (i << 2) | VS_UPVAL;
export const vsConst = (i: number): number => (i << 2) | VS_CONST;
export const vsGlobal = (i: number): number => (i << 2) | VS_GLOBAL;

// ---------- upvalue descriptors ----------
// (index << 1) | 1 captures the enclosing frame's upvalue `index`;
// (index << 1) | 0 captures the enclosing frame's local slot `index`.

export const uvLocal = (i: number): number => i << 1;
export const uvUpval = (i: number): number => (i << 1) | 1;

// ---------- constant-pool descriptors ----------

export const CONST_NUM_STR = 0;   // [0, "1/3"]   -> R.makeNumberFromString(s)
export const CONST_FIXNUM = 1;    // [1, 42]      -> 42
export const CONST_STR = 2;       // [2, "abc"]
export const CONST_BOOL = 3;      // [3, true]
export const CONST_UNDEFINED = 4; // [4]          -> undefined (letrec placeholder)
export const CONST_RT = 5;        // [5, "nothing"] -> R.nothing (a-prim-val)
export const CONST_LOC = 6;       // [6, 12]      -> locs[12] (a-srcloc)

// ---------- annotation descriptors ----------

export const ANN_VALUE = 0;   // [0, vs]                     a-name: an ann already in a slot
export const ANN_ANY = 1;     // [1]                         R.Any
export const ANN_FUNCTION = 2;// [2]                         R.Function
export const ANN_METHOD = 3;  // [3]                         R.Method
export const ANN_RECORD = 4;  // [4, nameKs, locKs, annIdxs, optNameK]
export const ANN_TUPLE = 5;   // [5, locKs, annIdxs, optNameK]
export const ANN_PRED = 6;    // [6, baseAnnIdx, vs, nameK, deref, locK]
// How to get the predicate value out of ANN_PRED's value source. A `data`
// member's refinement may name a function defined LATER in the same letrec
// group, so the source names the {"$var": v} cell and the dereference is
// deferred to when the annotation is actually built.
export const DEREF_NONE = 0;
export const DEREF_VAR = 1;
export const DEREF_VAR_CHECKED = 2;
export const ANN_DOT = 7;     // [7, locK, objNameK, vs, fieldNameK]

// ---------- provide/module-field descriptors ----------

export const REF_LOCAL = 0;   // [0, vs]
export const REF_REMOTE = 1;  // [1, uriK, whichK, nameK]

// ---------- opcodes ----------
// Order is the contract with pyret-vm.js. Append only.

export const OPCODE_NAMES: readonly string[] = [
  'MOVE',      // d, s                       locals[d] = read(s)
  'BOX',       // d, s                       locals[d] = {"$var": read(s)}
  'UNBOX',     // d, s                       locals[d] = read(s).$var
  'SETVAR',    // b, s, d                    read(b).$var = read(s); locals[d] = nothing
  'LETREC',    // d, s, locK, nameK          checked read of a letrec cell
  // Only for a module reference that is NOT module-level: those are
  // resolved once at instantiation and become globals (see VMGlobal 'f').
  'MODREF',    // d, s, nameK                read(s).dict.values.dict[name]
  'MODVARREF', // d, s, nameK                (as MODREF).$var
  'ARRSET',    // a, idx, s                  read(a)[idx] = read(s)
  'JMP',       // target
  'IF',        // c, elseTarget              R.checkPyretTrue(read(c)) ? fall through : jump
  'RET',       // s
  'CALL',      // d, f, locK, n, args...
  'TAILCALL',  // f, locK, n, args...  (followed by RET of the scratch slot)
  'METHCALL',  // d, o, nameK, locK, n, args...
  'PRIMAPP',   // d, primK, locK, n, args...
  'CLOSURE',   // d, funcIdx
  'METHOD',    // d, funcIdx
  'OBJ',       // d, n, (nameK, s) * n
  'EXTEND',    // d, o, locK, n, (nameK, s) * n
  'UPDATE',    // d, o, locK, objLocK, n, (nameK, s, locK) * n
  'DOT',       // d, o, nameK, locK
  'COLON',     // d, o, nameK, locK
  'GETBANG',   // d, o, nameK, locK
  'TUPLE',     // d, n, s * n
  'TUPLEGET',  // d, t, idx, locK
  'REF',       // d
  'CASES',     // v, dispatchIdx, locK, elseTarget
  'CASESPRE',  // v, branchArity, branchLocK, casesLocK
  'CASESBIND', // v, n, (d, isRef) * n
  'DATA',      // d, dataIdx
  'NEWTYPE',   // dBrander, dAnn, nameK, locK
  'MKANN',     // d, annIdx
  // ANNCHECK builds the annotation from a descriptor; ANNCHECKV is the
  // common case where the annotation is already a value (a named type, or
  // one of the runtime's fixed annotations).
  'ANNCHECK',  // annIdx, v, locK
  'TUPLECHK',  // v, n, locK
  'MODULE',    // d, moduleDescIdx
  'ANNCHECKV', // a, v, locK   -- annotation already available as a value
  // The cont backend's loop-back TCO (self-recursive tail call with
  // matching arity, allowTco): reuse the frame, --RUNGAS only.
  'SELFTAIL',  // n, args...
  // Marks the current frame at-return before a tail-position crossing
  // (method/prim call followed by RET): elided at capture events, as the
  // cont backend's step==retLabel stack-attach guard elides its frame.
  'SETRET',    // (no operands)
] as const;

const ops: Record<string, number> = {};
OPCODE_NAMES.forEach((n, i) => { ops[n] = i; });

export const OP_MOVE = ops.MOVE;
export const OP_BOX = ops.BOX;
export const OP_UNBOX = ops.UNBOX;
export const OP_SETVAR = ops.SETVAR;
export const OP_LETREC = ops.LETREC;
export const OP_MODREF = ops.MODREF;
export const OP_MODVARREF = ops.MODVARREF;
export const OP_ARRSET = ops.ARRSET;
export const OP_JMP = ops.JMP;
export const OP_IF = ops.IF;
export const OP_RET = ops.RET;
export const OP_CALL = ops.CALL;
export const OP_TAILCALL = ops.TAILCALL;
export const OP_METHCALL = ops.METHCALL;
export const OP_PRIMAPP = ops.PRIMAPP;
export const OP_CLOSURE = ops.CLOSURE;
export const OP_METHOD = ops.METHOD;
export const OP_OBJ = ops.OBJ;
export const OP_EXTEND = ops.EXTEND;
export const OP_UPDATE = ops.UPDATE;
export const OP_DOT = ops.DOT;
export const OP_COLON = ops.COLON;
export const OP_GETBANG = ops.GETBANG;
export const OP_TUPLE = ops.TUPLE;
export const OP_TUPLEGET = ops.TUPLEGET;
export const OP_REF = ops.REF;
export const OP_CASES = ops.CASES;
export const OP_CASESPRE = ops.CASESPRE;
export const OP_CASESBIND = ops.CASESBIND;
export const OP_DATA = ops.DATA;
export const OP_NEWTYPE = ops.NEWTYPE;
export const OP_MKANN = ops.MKANN;
export const OP_ANNCHECK = ops.ANNCHECK;
export const OP_TUPLECHK = ops.TUPLECHK;
export const OP_MODULE = ops.MODULE;
export const OP_ANNCHECKV = ops.ANNCHECKV;
export const OP_SELFTAIL = ops.SELFTAIL;
export const OP_SETRET = ops.SETRET;

// ---------- emitted program shape ----------

export interface VMFunc {
  /** Display name, used for arity errors and stack frames. */
  n: string;
  /** Declared arity, or -1 for the module toplevel (no arity check). */
  a: number;
  /** True for `a-method` bodies: arity errors read differently. */
  m: boolean;
  /** Number of local slots the frame needs. */
  s: number;
  /** Scratch slot: where a tail call that crossed into JS lands. */
  k: number;
  /** Upvalue capture descriptors (see uvLocal/uvUpval). */
  u: number[];
  /** Instruction stream. */
  c: number[];
  /** Loc index of the function itself (arity errors, stack frames). */
  l: number;
  /** 1 when the cont backend compiles this function FLAT (a-let-bound,
      flatness <= 5): no entry fuel check, no ret refund, never captured. */
  fl: number;
}

export interface VMVariantMember {
  /** Pyret field name. */
  n: string;
  /** JS identifier the runtime's constructor generator uses for this arg. */
  j: string;
  /** Mutable (`ref`) member. */
  m: boolean;
  /** Annotation, or -1 when blank/Any (those are not checked). */
  a: number;
  /** Loc index of the annotation (only meaningful when a >= 0). */
  al: number;
}

export interface VMVariant {
  /** 'v' for a-variant, 's' for a-singleton-variant. */
  k: 'v' | 's';
  n: string;
  l: number;
  ms: VMVariantMember[];
  /** with-members: (name, value source) pairs. */
  w: Array<[string, number]>;
}

export interface VMData {
  l: number;
  n: string;
  /** Value source of the data type's external brander. */
  b: number;
  vs: VMVariant[];
  /** sharing: fields shared by every variant. */
  sh: Array<[string, number]>;
}

// A provided value: either a slot/upvalue/global of the instantiating
// module (with a flag saying whether to read through its {"$var": v} cell),
// or a field of some other module.
export type VMRef =
  | [typeof REF_LOCAL, number, number]
  | [typeof REF_REMOTE, string, string, string];

export interface VMModule {
  answer: number;
  checks: number;
  definedModules: Array<[string, number]>;
  /** name, value source (a-defined-value and a-defined-var alike). */
  definedValues: Array<[string, number]>;
  definedTypes: Array<[string, number]>;
  provideValues: Array<[string, VMRef]>;
  /** provided types are annotations for local refs, module fields for remote. */
  provideTypes: Array<[string, ['a', number] | ['r', string, string, string]]>;
  provideModules: Array<[string, ['l', number] | ['u', string]]>;
}

export type VMGlobal =
  /** Instantiation argument (an imported module), by position. */
  | ['d', number]
  /** A field of another module, by uri/which/name. */
  | ['m', string, string, string]
  /** A value field of an earlier global (a hoisted cross-module read). */
  | ['f', number, string];

export interface VMProgram {
  v: number;
  uri: string;
  /** Key under which the instantiated module registers itself in R.modules. */
  moduleId: string;
  /** Raw srcloc arrays, exactly the `L` table the JS backend emits. */
  locs: any[][];
  /** Interned strings: field names, prim names, identifier names. */
  names: string[];
  consts: any[][];
  globals: VMGlobal[];
  funcs: VMFunc[];
  /** cases dispatch tables: variant name -> branch pc. */
  dispatches: Array<Record<string, number>>;
  anns: any[][];
  datas: VMData[];
  modules: VMModule[];
  /** Index in `funcs` of the module's toplevel function. */
  main: number;
}
