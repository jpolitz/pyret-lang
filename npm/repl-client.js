// Compile-server back end for `pyret --repl`: each interaction is a
// repl-interact round trip to the background pyret.jarr server, which owns
// the REPL session state (see server.arr). The terminal front end lives in
// repl-ui.js.

const WebSocket = require('ws');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const os = require('os');

const ui = require('./repl-ui');
const { BOLD, DIM, RED, RESET } = ui.colors;

// ── Server startup (mirrors client-lib.js) ────────────────────────────────────

const nodeModulesPath = path.join(__dirname, 'node_modules');

function findLocalParleyDir(base, localParley) {
  if (fs.existsSync(path.resolve(path.join(base, localParley)))) {
    return path.resolve(path.join(base, localParley));
  }
  return false;
}

function tmpdir() {
  const name = 'parley-' + os.userInfo().username;
  const fulldir = '/tmp/' + name;
  if (!fs.existsSync(fulldir)) {
    mkdirp.sync(fulldir);
  }
  return fulldir;
}

function getSocket() {
  return path.join(tmpdir(), 'comm.sock');
}

function startupServer(serverModule, portFile) {
  return new Promise((resolve, reject) => {
    const child = childProcess.fork(
      serverModule,
      ['-serve', '--port', portFile],
      // The server outlives this process. Inheriting fds 1/2 would leave it
      // holding the write end of our stdout/stderr, so anything reading them
      // (a shell pipeline, spawnSync in a test) blocks until the server dies.
      // Inheriting fd 0 would also let it steal the REPL's own input.
      { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: ['-max-old-space-size=8192'] }
    );
    child.on('message', function(msg) {
      if (msg.type === 'success') {
        child.unref();
        child.disconnect();
        resolve(msg);
      } else {
        reject(msg);
      }
    });
  });
}

// ── Single-message WebSocket helper ──────────────────────────────────────────

// Opens a connection, sends one message, collects all responses until close,
// then resolves with the array of parsed response objects.
function wsRound(portFile, payload) {
  return new Promise((resolve, reject) => {
    const client = new WebSocket('ws+unix://' + portFile);
    const responses = [];

    client.on('error', reject);
    client.on('open', function() {
      client.send(JSON.stringify(payload));
    });
    client.on('message', function(data) {
      try { responses.push(JSON.parse(data)); } catch(e) {}
    });
    client.on('close', function() {
      resolve(responses);
    });
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

function start(options) {
  const localParley = options['_all']['local-parley'];
  const serverModule = options.client.compiler;
  let portFile = getSocket();
  if (options.client.port) {
    portFile = path.resolve(options.client.port);
  }

  // Ensure .pyret/ directory exists (same as client-lib)
  let localParleyDir = findLocalParleyDir(process.cwd(), localParley);
  if (localParleyDir === false) {
    try {
      mkdirp.sync(localParley);
      fs.symlinkSync(nodeModulesPath, path.join(process.cwd(), localParley, 'node_modules'));
      localParleyDir = path.resolve(path.join(process.cwd(), localParley));
    } catch(e) {
      process.stderr.write('Could not create ' + localParley + ' directory: ' + e + '\n');
      process.exit(1);
    }
  }

  const compiledDir = options['pyret-options']['compiled-dir']
    || path.join(localParleyDir, 'compiled');
  const baseDir = options['pyret-options']['base-dir']
    || path.resolve(process.cwd());

  // Ensure server is running, then open the REPL
  function ensureServer() {
    if (fs.existsSync(portFile)) {
      const compilerStats = fs.lstatSync(serverModule);
      const portStats = fs.lstatSync(portFile);
      if (portStats.mtime.getTime() < compilerStats.mtime.getTime()) {
        // Compiler newer than server socket — restart
        const client = new WebSocket('ws+unix://' + portFile);
        client.on('open', () => client.send(JSON.stringify({ command: 'shutdown' })));
        client.on('error', () => {});
        if (fs.existsSync(portFile)) fs.unlinkSync(portFile);
        return startupServer(serverModule, portFile).then(openRepl);
      }
      return openRepl();
    } else {
      process.stdout.write(DIM + 'Starting Parley server...' + RESET + '\n');
      return startupServer(serverModule, portFile).then(openRepl);
    }
  }

  function openRepl() {
    // Build repl-start options from the parsed CLI options
    const replStartMsg = {
      command: 'repl-start',
      'compiled-dir': compiledDir,
      'base-dir': baseDir,
      checks: options['pyret-options']['checks'] || 'main',
      'type-check': options['pyret-options']['type-check'] || false,
      perilous: options['pyret-options']['perilous'] || false,
    };
    if (options['pyret-options']['builtin-js-dir']) {
      replStartMsg['builtin-js-dir'] = options['pyret-options']['builtin-js-dir'];
    }
    if (options['pyret-options']['builtin-arr-dir']) {
      replStartMsg['builtin-arr-dir'] = options['pyret-options']['builtin-arr-dir'];
    }

    process.stdout.write(DIM + 'Initializing REPL (compiling standard library)...' + RESET + '\n');

    return wsRound(portFile, replStartMsg).then(function(responses) {
      const ready = responses.find(r => r.type === 'repl-ready');
      const errMsg = responses.find(r => r.type === 'repl-error');

      if (errMsg) {
        process.stderr.write(BOLD + RED + 'REPL init failed: ' + RESET + errMsg.message + '\n');
        process.exit(1);
      }
      if (!ready) {
        process.stderr.write(BOLD + RED + 'REPL did not send ready signal\n' + RESET);
        process.exit(1);
      }

      ui.runLoop(makeBackend(ready.session));
    }).catch(function(err) {
      process.stderr.write(BOLD + RED + 'Failed to start REPL: ' + RESET + String(err) + '\n');
      process.exit(1);
    });
  }

  function makeBackend(sessionId) {
    return {
      interact(code) {
        return wsRound(portFile, {
          command: 'repl-interact',
          session: sessionId,
          code: code,
        });
      },
      close() {
        return wsRound(portFile, { command: 'repl-close', session: sessionId });
      },
      interrupt() {
        const client = new WebSocket('ws+unix://' + portFile);
        client.on('open', () => client.send(JSON.stringify({ command: 'stop' })));
        client.on('error', () => {});
      },
    };
  }

  ensureServer().catch(function(err) {
    process.stderr.write('Failed to start server: ' + String(err) + '\n');
    process.exit(1);
  });
}

module.exports = { start, needsContinuation: ui.needsContinuation };
