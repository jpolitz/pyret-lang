// Unit tests for the interpreter back end.
//
// The opcode table and program format are written down twice on purpose --
// once in src/ts-compiler/src/vm/opcodes.ts for the emitter, once in
// src/js/base/pyret-vm.js for the machine -- so that neither file has to
// import the other (the machine is a plain AMD module loaded by the
// runtime; the emitter is TypeScript compiled into the compiler). These
// tests are what keeps the two statements in lockstep, and they walk real
// emitted bytecode with the disassembler so that a malformed instruction
// stream fails here rather than as a mystery at run time.
//
// Run from lang/: node --test src/ts-compiler/tests/vm-unit-test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OP = require(path.join(ROOT, 'build/ts-compiler/vm/opcodes.js'));
const DIS = require(path.join(ROOT, 'build/ts-compiler/vm/disasm.js'));

// Load the machine the way a host would: it registers itself with define().
function loadVM() {
  const src = fs.readFileSync(path.join(ROOT, 'src/js/base/pyret-vm.js'), 'utf8');
  let mod = null;
  const sandbox = {
    define: function(name, deps, factory) {
      assert.strictEqual(name, OP.VM_MODULE_NAME,
        'the machine must register under the name the emitter names as its nativeRequire');
      mod = factory();
    },
  };
  vm.runInNewContext(src, vm.createContext(sandbox), { filename: 'pyret-vm.js' });
  assert.ok(mod, 'pyret-vm.js did not call define()');
  return mod;
}

test('the machine and the emitter agree on the opcode table', () => {
  const machine = loadVM();
  // Array.from: the machine is loaded in its own vm context, so its
  // array has a different realm's prototype.
  assert.deepStrictEqual(Array.from(machine.OPCODE_NAMES), [...OP.OPCODE_NAMES],
    'opcode order differs between pyret-vm.js and vm/opcodes.ts');
});

test('the machine and the emitter agree on the bytecode format version', () => {
  const machine = loadVM();
  assert.strictEqual(machine.FORMAT_VERSION, OP.FORMAT_VERSION,
    'FORMAT_VERSION differs; bump both, so stale caches are rejected');
});

test('the machine numbers every opcode the way the emitter does', () => {
  // The emitter exports one OP_<NAME> per entry; the machine hard-codes
  // the same numbers. Checking the exported constants catches a
  // hand-edited constant that drifted from the table's position.
  OP.OPCODE_NAMES.forEach((name, i) => {
    assert.strictEqual(OP['OP_' + name], i, `OP_${name} should be ${i}`);
  });
});

// ---------- emitted bytecode ----------

test('disassembly of every emitted function is well formed', () => {
  // Uses the module cache the parity/test targets already populate, so
  // this covers real trove bytecode (lists, sets, string-dict, ...) rather
  // than a toy program.
  const cacheDir = path.join(ROOT, 'tests/vm-compiled');
  if (!fs.existsSync(cacheDir)) {
    console.log('  (skipped: no tests/vm-compiled cache; run make vm-pyret-test first)');
    return;
  }
  const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith('-module.js'));
  assert.ok(files.length > 0, 'expected compiled vm modules in tests/vm-compiled');
  let checkedFuncs = 0;
  for (const f of files) {
    const text = fs.readFileSync(path.join(cacheDir, f), 'utf8');
    const prog = DIS.extractProgram(text);
    if (prog === undefined) { continue; }
    assert.strictEqual(prog.v, OP.FORMAT_VERSION, `${f}: stale bytecode format`);
    assert.ok(prog.main >= 0 && prog.main < prog.funcs.length, `${f}: bad main index`);
    for (const fn of prog.funcs) {
      // Throws on an unknown opcode, an operand that runs off the end of
      // the stream, or a jump that does not land on an instruction start.
      DIS.checkFunc(prog, fn);
      checkedFuncs++;
    }
  }
  assert.ok(checkedFuncs > 100,
    `expected to check a substantial number of functions, checked ${checkedFuncs}`);
});

test('no module reads a letrec cell before its straight-line assignment', () => {
  // See readsBeforeAssignment: this is the shape of the one bug that got
  // past every runtime test -- a `data` member's refinement compiled to a
  // read scheduled before the function it names was initialized.
  const cacheDir = path.join(ROOT, 'tests/vm-compiled');
  if (!fs.existsSync(cacheDir)) {
    console.log('  (skipped: no tests/vm-compiled cache; run make vm-pyret-test first)');
    return;
  }
  const problems = [];
  let modules = 0;
  for (const f of fs.readdirSync(cacheDir).filter((n) => n.endsWith('-module.js'))) {
    const prog = DIS.extractProgram(fs.readFileSync(path.join(cacheDir, f), 'utf8'));
    if (prog === undefined) { continue; }
    modules++;
    for (const found of DIS.readsBeforeAssignment(prog, prog.funcs[prog.main])) {
      problems.push(f.split('-')[0] + ': ' + found);
    }
  }
  assert.ok(modules > 20, `expected a populated cache, saw ${modules} modules`);
  assert.deepStrictEqual(problems, [], 'letrec cells read before assignment');
});
