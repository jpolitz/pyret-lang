// In-process back end for `pyret --repl --no-server`.
//
// Runs the TypeScript compiler (pyret-lang/build/ts-compiler) and a Pyret
// runtime inside this process: no compile server, no socket, no subprocess.
// The compile side is repl.ts (the port of src/arr/compiler/repl.arr, which
// the server back end also drives); execution goes through load-lib's
// run-program against a persistent realm, the way code.pyret.org does it in
// the browser. Structure follows src/ts-compiler/tests/in-process-host.js,
// with the AMD/native-dependency bootstrap taken from what a standalone
// .jarr does (amd_loader + the browserified deps bundle) so it needs
// nothing beyond what the package already ships.

const fs = require('fs');
const path = require('path');

const ui = require('./repl-ui');
const { BOLD, DIM, RED, RESET } = ui.colors;

// ── AMD environment ──────────────────────────────────────────────────────────

// Concatenate the pieces make-standalone puts at the top of every .jarr:
// the AMD loader, the browserified node dependencies, and the raw runtime
// support files named by config.json. Evaluating that gives a module table
// with pyret-base/js/runtime and friends already define()d.
function loadAmdEnv(tsOut) {
  const config = JSON.parse(fs.readFileSync(path.join(tsOut, 'config.json'), 'utf8'));
  if (!config['use-raw-files']) {
    throw new Error('ts-compiler config.json must use raw files');
  }
  const parts = [
    fs.readFileSync(path.join(tsOut, 'js', 'amd_loader.js'), 'utf8'),
    fs.readFileSync(path.join(tsOut, 'bundled-node-deps.js'), 'utf8'),
  ];
  const rawJs = config['raw-js'];
  // Sorted, matching make-standalone's concatenation order.
  for (const key of Object.keys(rawJs).sort()) {
    parts.push(fs.readFileSync(rawJs[key].replace('$PYRET', tsOut), 'utf8'));
  }
  parts.push('\nreturn { requirejs: requirejs, define: define };\n');
  // `require` is this module's require, so the bundle's nodeRequire() calls
  // (vega, resolve, fs, ...) resolve against the package's node_modules.
  return new Function('require', parts.join('\n'))(require);
}

function amdRequire(env, names) {
  return new Promise((resolve, reject) => {
    try {
      env.requirejs(names, function() { resolve(Array.prototype.slice.call(arguments)); });
    } catch (e) { reject(e); }
  });
}

// ── Host: compiler pieces + a live Pyret runtime with load-lib ───────────────

function loadTs(tsOut, mod) { return require(path.join(tsOut, mod)); }

// Build a standalone program SOURCE string for a Pyret source, using the
// same compile path repl.ts uses internally.
async function makeStandaloneSource(TS, src, uri, context, options) {
  const { CL, CML } = TS;
  const finder = (ctx, dep) => CML.moduleFinder(ctx, dep);
  const loc = CL.stringLocator(uri, src);
  const ws = await CL.compileWorklistKnownModules(finder, loc, context, new Map());
  const compiled = CL.compileProgramWith(ws, new Map(), options);
  const errs = compiled.loadables.filter(CL.isErrorCompilation);
  if (errs.length > 0) {
    throw new Error('REPL bootstrap compile failed');
  }
  const standalone = CL.makeStandalone(ws, compiled, options);
  if (standalone.$name === 'left') {
    throw new Error('REPL bootstrap makeStandalone failed');
  }
  return standalone.v.jsAst.toUglySource();
}

async function makeHost(tsOut, context, bootstrapOptions) {
  const TS = {
    CS: loadTs(tsOut, 'compile-structs.js'),
    CL: loadTs(tsOut, 'compile-lib.js'),
    CML: loadTs(tsOut, 'cli-module-loader.js'),
    RED: loadTs(tsOut, 'render-error-display.js'),
    REPL: loadTs(tsOut, 'repl.js'),
  };

  const env = loadAmdEnv(tsOut);
  const [runtimeLib, loadHooksLib] = await amdRequire(env, [
    'pyret-base/js/runtime',
    'pyret-base/js/post-load-hooks',
    'pyret-base/js/exn-stack-parser',
  ]);

  const runtime = runtimeLib.makeRuntime({
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    stdin: process.stdin,
  });

  // Bootstrap: instantiate runtime-lib + load-lib into the host runtime by
  // running a tiny program that imports them (same as handalone.js).
  const bootSrc = 'import load-lib as L\nimport runtime-lib as R\n';
  const bootStandalone = await makeStandaloneSource(
    TS, bootSrc, 'bootstrap://', context, bootstrapOptions);
  const program = eval('(' + bootStandalone + ')'); // eslint-disable-line no-eval

  const realmObj = { instantiated: {}, static: {} };
  const main = program.toLoad[program.toLoad.length - 1];
  runtime.setParam('command-line-arguments', []);
  const postLoadHooks = loadHooksLib.makeDefaultPostLoadHooks(
    runtime, { main, checks: 'none' });

  // Compiled modules look each other up via thisRuntime.modules[uri], but
  // runStandalone stores into realm.instantiated[uri]; alias them (this is
  // what handalone.js and load-lib's run-program both do).
  runtime.modules = realmObj.instantiated;
  await new Promise((resolve, reject) => {
    runtime.runThunk(
      () => runtime.runStandalone(
        program.staticModules, realmObj, program.depMap, program.toLoad, postLoadHooks),
      (bootResult) => {
        if (!runtime.isSuccessResult(bootResult)) {
          return reject(bootResult.exn);
        }
        resolve();
      });
  });

  const gf = (o, f) => runtime.getField(o, f);
  const ppt = (m) => gf(m, 'provide-plus-types');
  const internalOf = (m) => gf(ppt(m), 'internal');
  const valueOf = (m, f) => gf(gf(ppt(m), 'values'), f);

  const loadLibMod = runtime.modules['builtin://load-lib'];
  const runtimeLibMod = runtime.modules['builtin://runtime-lib'];
  if (!loadLibMod || !runtimeLibMod) {
    throw new Error('REPL bootstrap did not instantiate load-lib/runtime-lib');
  }

  // Wrap the host runtime as a Pyret Runtime value, and make a fresh realm.
  const brandRuntime = internalOf(runtimeLibMod).brandRuntime;
  const pyRuntime = gf(brandRuntime, 'brand').app(
    runtime.makeObject({ runtime: runtime.makeOpaque(runtime) }));
  const initialRealm = internalOf(loadLibMod).makeRealm({ instantiated: {}, static: {} });
  const runProgram = valueOf(loadLibMod, 'run-program');

  // Call a Pyret function on the host runtime and await its value. load-lib's
  // renderers pause the stack, so they have to run inside a trampoline.
  function callPyret(fn, args) {
    return new Promise((resolve, reject) => {
      runtime.runThunk(
        () => fn.app.apply(fn, args),
        (r) => { if (runtime.isSuccessResult(r)) { resolve(r.result); } else { reject(r.exn); } });
    });
  }

  const executor = {
    run(realm, programJsSource, options) {
      return new Promise((res, rej) => {
        runtime.runThunk(
          () => runProgram.app(
            pyRuntime,
            realm,
            programJsSource,
            runtime.makeObject({ checks: (options && options.checks) || 'main' }),
            runtime.ffi.makeList([])),
          (result) => {
            if (runtime.isSuccessResult(result)) { res(result.result); }
            else { rej(result.exn); }
          });
      });
    },
    isSuccessResult(mr) { return mr.val.runtime.isSuccessResult(mr.val.result); },
    getResultRealm(mr) { return mr.val.realm; },
  };

  return {
    TS,
    executor,
    runtime,
    realm: initialRealm,
    modules: new Map(),
    makeFinder: () => (ctx, dep) => TS.CML.moduleFinder(ctx, dep),
    // The same load-lib entry points server.arr uses to render an interaction.
    loadLib: {
      getResultRepr: (mr) => callPyret(valueOf(loadLibMod, 'get-result-repr'), [mr]),
      resultHasChecks: (mr) => callPyret(valueOf(loadLibMod, 'result-has-checks'), [mr]),
      renderCheckResults: (mr) => callPyret(valueOf(loadLibMod, 'render-check-results'), [mr]),
      renderErrorMessage: (mr) => callPyret(valueOf(loadLibMod, 'render-error-message'), [mr]),
    },
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

// Pyret torepr for the values that reach compile-error messages (the same
// cases cli-module-loader.ts handles for its own error rendering).
function makeToRepr(CS) {
  return function toRepr(x) {
    if (CS.isDependency(x)) {
      return 'dependency("' + x.protocol + '", [list: ' +
        x.arguments.map((a) => JSON.stringify(a)).join(', ') + '])';
    } else if (CS.isBuiltin(x)) {
      return 'builtin("' + x.modname + '")';
    } else if (typeof x === 'string') {
      return JSON.stringify(x);
    } else if (x !== null && x !== undefined && typeof x.toString === 'function'
               && x.toString !== Object.prototype.toString) {
      return x.toString();
    } else {
      return JSON.stringify(x);
    }
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────

function start(options) {
  const tsOut = path.dirname(options.client.compiler);

  const localParley = options['_all']['local-parley'];
  const localParleyDir = path.resolve(path.join(process.cwd(), localParley));
  if (!fs.existsSync(localParleyDir)) {
    try {
      fs.mkdirSync(localParleyDir, { recursive: true });
      // Same layout the server-backed path and client-lib create, so a
      // project directory looks the same whichever back end made it.
      fs.symlinkSync(path.join(__dirname, 'node_modules'),
                     path.join(localParleyDir, 'node_modules'));
    } catch (e) {
      process.stderr.write('Could not create ' + localParley + ' directory: ' + e + '\n');
      process.exit(1);
    }
  }

  const compiledDir = options['pyret-options']['compiled-dir']
    || path.join(localParleyDir, 'compiled');
  const baseDir = options['pyret-options']['base-dir'] || path.resolve(process.cwd());

  let CS, RED, toRepr;

  async function boot() {
    const CSmod = loadTs(tsOut, 'compile-structs.js');
    CS = CSmod;
    RED = loadTs(tsOut, 'render-error-display.js');
    toRepr = makeToRepr(CS);

    const context = {
      currentLoadPath: path.resolve(baseDir),
      cacheBaseDir: compiledDir,
      // Builtins come from the precompiled cache the package ships, exactly
      // as the compile server's `compiled-read-only` does.
      compiledReadOnlyDirs: [path.resolve(path.join(tsOut, 'lib-compiled'))],
      urlFileMode: CS.allRemote,
      urlCache: new Map(),
    };

    const replOptions = {
      ...CS.defaultCompileOptions,
      thisPyretDir: tsOut,
      baseDir: baseDir,
      compiledCache: compiledDir,
      compiledReadOnly: [path.resolve(path.join(tsOut, 'lib-compiled'))],
      checks: options['pyret-options']['checks'] || 'main',
      checksFormat: 'text',
      typeCheck: options['pyret-options']['type-check'] || false,
      userAnnotations: !options['pyret-options']['perilous'],
      displayProgress: false,
    };
    const bootstrapOptions = { ...replOptions, checks: 'none' };

    process.stdout.write(DIM + 'Initializing REPL...' + RESET + '\n');

    const host = await makeHost(tsOut, context, bootstrapOptions);
    const repl = host.TS.REPL.makeRepl(
      host.executor, host.modules, host.realm, context, host.makeFinder);
    const defs = repl.makeDefinitionsLocator(() => '', CS.standardGlobals);
    const init = await repl.restartInteractions(defs, replOptions);
    if (init.$name === 'left') {
      throw new Error(renderCompileErrors(init.v).join('\n'));
    }
    return makeBackend(host, repl);
  }

  function renderCompileErrors(problems) {
    const out = [];
    for (const ce of problems) {
      if (CS.isOk(ce)) { continue; }
      for (const p of ce.problems) {
        out.push(RED.displayToString(p.renderReason(), toRepr, []));
      }
    }
    return out;
  }

  function makeBackend(host, repl) {
    return {
      async interact(code) {
        const responses = [];
        let result;
        try {
          result = await repl.runInteraction(repl.makeInteractionLocator(() => code));
        } catch (e) {
          return [{ type: 'repl-error', kind: 'internal', message: String(e && e.message || e) }];
        }
        if (result.$name === 'left') {
          return [{ type: 'repl-error', kind: 'compile',
                    message: renderCompileErrors(result.v).join('\n') }];
        }
        const mr = result.v;
        if (host.executor.isSuccessResult(mr)) {
          const repr = await host.loadLib.getResultRepr(mr);
          if (host.runtime.ffi.isSome(repr)) {
            responses.push({ type: 'repl-value',
                             repr: host.runtime.unwrap(host.runtime.getField(repr, 'value')) });
          }
          // Only render checks when the interaction actually defined tests;
          // otherwise render-check-results reports "didn't define any tests"
          // after every line.
          if (await host.loadLib.resultHasChecks(mr)) {
            const rendered = await host.loadLib.renderCheckResults(mr);
            const message = host.runtime.unwrap(host.runtime.getField(rendered, 'message'));
            if (message !== '') {
              responses.push({ type: 'repl-check', message });
            }
          }
        } else {
          const rendered = await host.loadLib.renderErrorMessage(mr);
          responses.push({ type: 'repl-error', kind: 'runtime',
                           message: host.runtime.unwrap(host.runtime.getField(rendered, 'message')) });
        }
        return responses;
      },
      close() { return Promise.resolve(); },
      interrupt() {
        // The interaction runs on this process's Pyret runtime; breakAll is
        // the same stop mechanism the server exposes as its "stop" command.
        try { host.runtime.breakAll(); } catch (e) { /* best effort */ }
      },
    };
  }

  boot().then(function(backend) {
    ui.runLoop(backend);
  }, function(err) {
    process.stderr.write(BOLD + RED + 'Failed to start REPL: ' + RESET +
                         String(err && err.message || err) + '\n');
    process.exit(1);
  });
}

module.exports = { start };
