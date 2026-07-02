const WebSocket = require('ws');
const childProcess = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const os = require('os');

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const isaTTY = process.stdout.isTTY;

function ansi(code) {
  return isaTTY ? '\x1b[' + code + 'm' : '';
}

const RESET  = ansi('0');
const BOLD   = ansi('1');
const DIM    = ansi('2');
const RED    = ansi('31');
const GREEN  = ansi('32');
const YELLOW = ansi('33');
const CYAN   = ansi('36');

// ── Multiline detection ───────────────────────────────────────────────────────

// Heuristic: count unmatched block-openers vs 'end' keywords.
// Also tracks open backtick strings. Returns true when the snippet looks
// incomplete and more input should be read before sending to the server.
function needsContinuation(lines) {
  const code = lines.join('\n');

  // Backtick multi-line strings: count ``` occurrences
  const btCount = (code.match(/```/g) || []).length;
  if (btCount % 2 !== 0) return true;

  // Strip single-line comments and string literals for keyword counting
  // (rough approximation — good enough for balanced-block detection)
  const stripped = code
    .replace(/#[^\n]*/g, '')           // line comments
    .replace(/"(?:[^"\\]|\\.)*"/g, '"..."')  // double-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, '"..."'); // backtick strings (single)

  // Only count constructs that introduce their OWN `end`. Clause keywords
  // like `block`, `where`, `shared`/`sharing` attach to an enclosing
  // construct and share its single `end`, so counting them over-counts and
  // would wedge the REPL waiting for an `end` that never comes.
  const opens = (stripped.match(
    /\b(fun|lam|if|ask|cases|when|check|examples|for|data|try|method|reactor|table)\b/g
  ) || []).length;
  const closes = (stripped.match(/\bend\b/g) || []).length;

  return opens > closes;
}

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
      { stdio: [0, 1, 2, 'ipc'], execArgv: ['-max-old-space-size=8192'] }
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

// ── Output rendering ──────────────────────────────────────────────────────────

function renderResponses(responses, rl) {
  for (const r of responses) {
    switch (r.type) {
      case 'repl-stdout':
        process.stdout.write(r.contents);
        break;

      case 'repl-value':
        // Values: bold so they stand out from stdout
        process.stdout.write(BOLD + r.repr + RESET + '\n');
        break;

      case 'repl-check':
        process.stdout.write(CYAN + r.message + RESET + '\n');
        break;

      case 'repl-error': {
        const label = r.kind === 'compile' ? 'Compile error'
                    : r.kind === 'runtime' ? 'Runtime error'
                    : r.kind === 'init'    ? 'Init error'
                    : 'Error';
        process.stderr.write(BOLD + RED + label + ':' + RESET + '\n');
        process.stderr.write(RED + r.message + RESET + '\n');
        break;
      }

      case 'echo-log':
        if (r['clear-first']) {
          process.stdout.write('\r' + ' '.repeat(r['clear-first']) + '\r');
        }
        process.stdout.write(r.contents);
        break;

      case 'echo-err':
        process.stderr.write(r.contents);
        break;
    }
  }
}

// ── Main REPL loop ────────────────────────────────────────────────────────────

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
      // Find the repl-ready message
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

      const sessionId = ready.session;
      runReplLoop(sessionId);
    }).catch(function(err) {
      process.stderr.write(BOLD + RED + 'Failed to start REPL: ' + RESET + String(err) + '\n');
      process.exit(1);
    });
  }

  function runReplLoop(sessionId) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: isaTTY,
      historySize: 500,
    });

    // Print banner
    process.stdout.write(
      BOLD + GREEN + 'Pyret REPL' + RESET +
      DIM + ' — Ctrl-D to exit, Ctrl-C to interrupt' + RESET + '\n'
    );

    const PROMPT = BOLD + GREEN + '>>> ' + RESET;
    const CONT   = DIM  + GREEN + '... ' + RESET;

    let pendingLines = [];
    let interacting = false;
    let closed = false;
    let wantClose = false;

    function prompt() {
      // stdin may close (Ctrl-D, or end of piped input) while an interaction
      // is still in flight; its callback must not prompt a closed readline.
      if (closed) { return; }
      rl.setPrompt(pendingLines.length === 0 ? PROMPT : CONT);
      rl.prompt();
    }

    // The server session is single-threaded: overlapping repl-interact
    // requests corrupt its state. readline delivers piped input (and fast
    // type-ahead) as many synchronous 'line' events, so we can't rely on
    // awaiting between them — instead queue complete snippets and run them
    // strictly one at a time.
    const interactionQueue = [];

    function shutdown() {
      closed = true;
      wsRound(portFile, { command: 'repl-close', session: sessionId })
        .catch(() => {})
        // Flush stdout before exiting: process.exit() truncates the async
        // stdout pipe, so wait for a final write to drain first.
        .finally(() => process.stdout.write('\n', () => process.exit(0)));
    }

    function pump() {
      if (interacting || closed) { return; }
      if (interactionQueue.length === 0) {
        // Drained: if stdin already closed (Ctrl-D / end of piped input),
        // shut down now that all queued interactions have finished.
        if (wantClose) { shutdown(); } else { prompt(); }
        return;
      }
      const code = interactionQueue.shift();
      interacting = true;
      wsRound(portFile, {
        command: 'repl-interact',
        session: sessionId,
        code: code,
      }).then(function(responses) {
        interacting = false;
        renderResponses(responses, rl);
        pump();
      }).catch(function(err) {
        interacting = false;
        process.stderr.write(BOLD + RED + 'Connection error: ' + RESET + String(err) + '\n');
        pump();
      });
    }

    rl.on('line', function(line) {
      // A blank line while mid-construct force-submits, so a wrong
      // continuation guess can never leave the user stuck.
      const blankForceSubmit = line.trim() === '' && pendingLines.length > 0;

      pendingLines.push(line);

      if (!blankForceSubmit && needsContinuation(pendingLines)) {
        // More input needed — show continuation prompt
        prompt();
        return;
      }

      const code = pendingLines.join('\n');
      pendingLines = [];

      // Empty input — just re-prompt (unless an interaction is running)
      if (code.trim() === '') {
        if (!interacting) { prompt(); }
        return;
      }

      interactionQueue.push(code);
      pump();
    });

    rl.on('close', function() {
      // Ctrl-D or stdin closed. Don't tear down mid-interaction — let the
      // queue drain first (pump() calls shutdown() once idle).
      wantClose = true;
      if (!interacting && interactionQueue.length === 0) { shutdown(); }
    });

    // Ctrl-C: if mid-interaction, attempt to interrupt; otherwise clear the line
    process.on('SIGINT', function() {
      if (interacting) {
        // Try to stop the running interaction
        const client = new WebSocket('ws+unix://' + portFile);
        client.on('open', () => client.send(JSON.stringify({ command: 'stop' })));
        client.on('error', () => {});
        process.stdout.write('\n' + YELLOW + 'Interrupted' + RESET + '\n');
        interacting = false;
      } else {
        // Clear current partial input
        pendingLines = [];
        process.stdout.write('\n');
      }
      prompt();
    });

    prompt();
  }

  ensureServer().catch(function(err) {
    process.stderr.write('Failed to start server: ' + String(err) + '\n');
    process.exit(1);
  });
}

module.exports = { start, needsContinuation };
