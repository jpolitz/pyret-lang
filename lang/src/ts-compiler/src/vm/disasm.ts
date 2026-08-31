/*
  Disassembler and verifier for pvm bytecode.

  Bytecode is a flat integer array, which is fast to execute and opaque to
  read; this is the file that makes it legible again. `disassemble` prints
  a program the way you would want to read it while debugging the back end
  (one instruction per line, operands resolved against the name/const/loc
  tables). `checkFunc` is the same walk used as an assertion: it rejects an
  unknown opcode, an operand list that runs off the end of the stream, or a
  jump that does not land on an instruction boundary -- the three ways a
  bad emitter can produce bytecode that the machine would misread rather
  than reject.

  The instruction-length table below is the single description of operand
  layout; the machine decodes the same shapes inline for speed.
*/

import { OPCODE_NAMES, VMProgram, VMFunc, VS_LOCAL, VS_UPVAL, VS_CONST } from './opcodes';

/** Fixed operand count, then `varMult` extra operands per unit of the count. */
interface Layout {
  fixed: number;
  /** Index (within operands) of the repeat count, or -1 for none. */
  countAt: number;
  varMult: number;
  /** Operand indices that are jump targets. */
  jumps: number[];
}

const L = (fixed: number, countAt = -1, varMult = 0, jumps: number[] = []): Layout =>
  ({ fixed, countAt, varMult, jumps });

const LAYOUTS: Record<string, Layout> = {
  MOVE: L(2),
  BOX: L(2),
  UNBOX: L(2),
  SETVAR: L(3),
  LETREC: L(4),
  MODREF: L(3),
  MODVARREF: L(3),
  ARRSET: L(3),
  JMP: L(1, -1, 0, [0]),
  IF: L(2, -1, 0, [1]),
  RET: L(1),
  CALL: L(4, 3, 1),
  TAILCALL: L(3, 2, 1),
  METHCALL: L(5, 4, 1),
  PRIMAPP: L(4, 3, 1),
  CLOSURE: L(2),
  METHOD: L(2),
  OBJ: L(2, 1, 2),
  EXTEND: L(4, 3, 2),
  UPDATE: L(5, 4, 3),
  DOT: L(4),
  COLON: L(4),
  GETBANG: L(4),
  TUPLE: L(2, 1, 1),
  TUPLEGET: L(4),
  REF: L(1),
  CASES: L(4, -1, 0, [3]),
  CASESPRE: L(4),
  CASESBIND: L(2, 1, 2),
  DATA: L(2),
  NEWTYPE: L(4),
  MKANN: L(2),
  ANNCHECK: L(3),
  TUPLECHK: L(3),
  MODULE: L(2),
  ANNCHECKV: L(3),
  SELFTAIL: L(1, 0, 1),
  SETRET: L(0),
};

export interface Instr {
  pc: number;
  op: number;
  name: string;
  operands: number[];
  next: number;
}

export function decodeAt(code: number[], pc: number): Instr {
  const op = code[pc];
  const name = OPCODE_NAMES[op];
  if (name === undefined) {
    throw new Error(`pvm disasm: unknown opcode ${op} at pc ${pc}`);
  }
  const layout = LAYOUTS[name];
  let n = layout.fixed;
  if (layout.countAt >= 0) {
    const count = code[pc + 1 + layout.countAt];
    if (!(count >= 0)) {
      throw new Error(`pvm disasm: bad repeat count for ${name} at pc ${pc}`);
    }
    n += count * layout.varMult;
  }
  const next = pc + 1 + n;
  if (next > code.length) {
    throw new Error(`pvm disasm: ${name} at pc ${pc} runs past the end of the stream`);
  }
  return { pc, op, name, operands: code.slice(pc + 1, next), next };
}

/** Every instruction of `fn`, in layout order. */
export function instructions(fn: VMFunc): Instr[] {
  const out: Instr[] = [];
  let pc = 0;
  while (pc < fn.c.length) {
    const i = decodeAt(fn.c, pc);
    out.push(i);
    pc = i.next;
  }
  return out;
}

/**
 * Verifies one function's instruction stream. Throws with a located
 * message on the first problem.
 */
export function checkFunc(prog: VMProgram, fn: VMFunc): void {
  const starts = new Set<number>();
  const instrs = instructions(fn);
  for (const i of instrs) { starts.add(i.pc); }
  starts.add(fn.c.length);
  for (const i of instrs) {
    const layout = LAYOUTS[i.name];
    for (const j of layout.jumps) {
      const target = i.operands[j];
      if (!starts.has(target)) {
        throw new Error(
          `pvm disasm: ${i.name} at pc ${i.pc} in ${fn.n} jumps to ${target}, ` +
          'which is not an instruction boundary');
      }
    }
    if (i.name === 'CASES') {
      const table = prog.dispatches[i.operands[1]];
      if (table === undefined) {
        throw new Error(`pvm disasm: CASES at pc ${i.pc} names dispatch table ${i.operands[1]}, which does not exist`);
      }
      for (const k of Object.keys(table)) {
        if (!starts.has(table[k])) {
          throw new Error(
            `pvm disasm: cases branch ${k} targets ${table[k]} in ${fn.n}, ` +
            'which is not an instruction boundary');
        }
      }
    }
  }
  if (fn.k < 0 || fn.k >= fn.s) {
    throw new Error(`pvm disasm: ${fn.n} has scratch slot ${fn.k} outside its ${fn.s} slots`);
  }
}

/**
 * Reports letrec cells a straight-line prefix reads before anything has
 * assigned them.
 *
 * This is a heuristic, and deliberately a narrow one: it only follows the
 * instruction stream in layout order, so it is meaningful for the flat
 * spine of a module toplevel and says nothing about code behind a branch.
 * That is enough, because the mistake it exists to catch is a *scheduling*
 * one -- emitting a read of a letrec cell earlier in the module than the
 * assignment that fills it. One such bug (annotation refinements on `data`
 * members, which must be built lazily) shipped past every runtime test in
 * the suite and only surfaced when a differently-ordered module was
 * compiled; this finds that shape statically.
 */
export function readsBeforeAssignment(prog: VMProgram, fn: VMFunc): string[] {
  const boxed = new Set<number>();
  const assigned = new Set<number>();
  const out: string[] = [];
  for (const i of instructions(fn)) {
    const o = i.operands;
    if (i.name === 'BOX') { boxed.add(o[0]); }
    if (i.name === 'SETVAR' && (o[0] & 3) === VS_LOCAL) { assigned.add(o[0] >> 2); }
    if (i.name === 'LETREC') {
      const src = o[1];
      if ((src & 3) === VS_LOCAL && boxed.has(src >> 2) && !assigned.has(src >> 2)) {
        const loc = prog.locs[o[2]];
        out.push(`${fn.n} pc ${i.pc}: reads ${JSON.stringify(prog.names[o[3]])} ` +
          `before it is assigned (${loc[0]}:${loc[1]}:${loc[2]})`);
      }
    }
  }
  return out;
}

// ---------- printing ----------

function vsToString(prog: VMProgram, vs: number): string {
  const i = vs >> 2;
  switch (vs & 3) {
    case VS_LOCAL: return 'r' + i;
    case VS_UPVAL: return 'u' + i;
    case VS_CONST: {
      const c = prog.consts[i];
      return 'k' + i + '(' + JSON.stringify(c).slice(0, 40) + ')';
    }
    default: {
      const g = prog.globals[i];
      return 'g' + i + '(' + (g[0] === 'd' ? 'dep ' + g[1] : g[3] + '@' + g[1]) + ')';
    }
  }
}

/** A human-readable listing of a whole program. */
export function disassemble(prog: VMProgram): string {
  const out: string[] = [];
  out.push(`; ${prog.uri}  (format ${prog.v}, ${prog.funcs.length} functions)`);
  prog.globals.forEach((g, i) => {
    out.push(`; g${i} = ${g[0] === 'd' ? 'dependency ' + g[1] : g[1] + '.' + g[2] + '.' + g[3]}`);
  });
  prog.funcs.forEach((fn, fi) => {
    out.push('');
    out.push(`function ${fi}${fi === prog.main ? ' (main)' : ''}: ${fn.n} ` +
      `arity=${fn.a}${fn.m ? ' method' : ''} slots=${fn.s} upvals=[${fn.u.join(',')}]`);
    for (const i of instructions(fn)) {
      out.push('  ' + String(i.pc).padStart(5) + '  ' + i.name.padEnd(10) + ' ' +
        formatOperands(prog, i));
    }
  });
  return out.join('\n');
}

function formatOperands(prog: VMProgram, i: Instr): string {
  const o = i.operands;
  const vs = (x: number) => vsToString(prog, x);
  const nm = (x: number) => JSON.stringify(prog.names[x]);
  switch (i.name) {
    case 'MOVE': case 'BOX': case 'UNBOX':
      return `r${o[0]}, ${vs(o[1])}`;
    case 'SETVAR': return `${vs(o[0])}, ${vs(o[1])} -> r${o[2]}`;
    case 'LETREC': return `r${o[0]}, ${vs(o[1])}, ${nm(o[3])}`;
    case 'MODREF': case 'MODVARREF': return `r${o[0]}, ${vs(o[1])}, ${nm(o[2])}`;
    case 'ARRSET': return `${vs(o[0])}[${o[1]}] = ${vs(o[2])}`;
    case 'JMP': return String(o[0]);
    case 'IF': return `${vs(o[0])} else -> ${o[1]}`;
    case 'RET': return vs(o[0]);
    case 'CALL':
      return `r${o[0]}, ${vs(o[1])}(${o.slice(4).map(vs).join(', ')})`;
    case 'TAILCALL':
      return `${vs(o[0])}(${o.slice(3).map(vs).join(', ')})`;
    case 'METHCALL':
      return `r${o[0]}, ${vs(o[1])}.${nm(o[2])}(${o.slice(5).map(vs).join(', ')})`;
    case 'PRIMAPP':
      return `r${o[0]}, %${prog.names[o[1]]}(${o.slice(4).map(vs).join(', ')})`;
    case 'CLOSURE': case 'METHOD': return `r${o[0]}, function ${o[1]}`;
    case 'DOT': case 'COLON': case 'GETBANG':
      return `r${o[0]}, ${vs(o[1])}.${nm(o[2])}`;
    case 'TUPLEGET': return `r${o[0]}, ${vs(o[1])}.{${o[2]}}`;
    case 'REF': return `r${o[0]}`;
    case 'CASES': return `${vs(o[0])}, table ${o[1]}, else -> ${o[3]}`;
    case 'CASESPRE': return `${vs(o[0])}, arity ${o[1]}`;
    case 'DATA': return `r${o[0]}, data ${o[1]}`;
    case 'NEWTYPE': return `r${o[0]} (brander), r${o[1]} (ann), ${nm(o[2])}`;
    case 'MKANN': return `r${o[0]}, ann ${o[1]}`;
    case 'ANNCHECK': return `ann ${o[0]}, ${vs(o[1])}`;
    case 'ANNCHECKV': return `${vs(o[0])}, ${vs(o[1])}`;
    case 'TUPLECHK': return `${vs(o[0])}, ${o[1]}`;
    case 'MODULE': return `r${o[0]}, module ${o[1]}`;
    default: return o.join(', ');
  }
}

/**
 * Recovers the bytecode from a compiled-on-disk module, for tooling and
 * tests. Returns undefined for a module the js back end produced.
 */
export function extractProgram(moduleFileText: string): VMProgram | undefined {
  // eslint-disable-next-line no-new-func
  const record = new Function('return ' + moduleFileText)();
  const theModule = record.theModule;
  if (typeof theModule !== 'string') { return undefined; }
  const marker = 'JSON.parse(';
  const at = theModule.indexOf(marker);
  if (at < 0) { return undefined; }
  const literalStart = at + marker.length;
  const literalEnd = theModule.lastIndexOf('))');
  if (literalEnd <= literalStart) { return undefined; }
  const literal = theModule.slice(literalStart, literalEnd);
  // eslint-disable-next-line no-new-func
  return JSON.parse(new Function('return ' + literal)());
}
