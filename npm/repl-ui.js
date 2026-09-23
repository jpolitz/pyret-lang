// Terminal front-end for `pyret --repl`, shared by both back ends
// (repl-client.js: compile server; repl-local.js: in-process).
//
// A back end is an object:
//   interact(code) -> Promise<Response[]>   run one snippet
//   close()        -> Promise               tear the session down
//   interrupt()                             best-effort stop of a running interaction
// A Response is one of the message shapes the compile server already sends
// (repl-stdout / repl-value / repl-check / repl-error / echo-log / echo-err),
// so both back ends render identically.

const readline = require('readline');

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
// incomplete and more input should be read before running it.
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

// ── Output rendering ──────────────────────────────────────────────────────────

function renderResponses(responses) {
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

function runLoop(backend) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: isaTTY,
    historySize: 500,
  });

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

  // A REPL session is single-threaded: overlapping interactions corrupt its
  // state. readline delivers piped input (and fast type-ahead) as many
  // synchronous 'line' events, so we can't rely on awaiting between them --
  // instead queue complete snippets and run them strictly one at a time.
  const interactionQueue = [];

  function shutdown() {
    closed = true;
    Promise.resolve()
      .then(() => backend.close())
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
    Promise.resolve()
      .then(() => backend.interact(code))
      .then(function(responses) {
        interacting = false;
        renderResponses(responses);
        pump();
      })
      .catch(function(err) {
        interacting = false;
        process.stderr.write(BOLD + RED + 'REPL error: ' + RESET + String(err) + '\n');
        pump();
      });
  }

  rl.on('line', function(line) {
    // A blank line while mid-construct force-submits, so a wrong
    // continuation guess can never leave the user stuck.
    const blankForceSubmit = line.trim() === '' && pendingLines.length > 0;

    pendingLines.push(line);

    if (!blankForceSubmit && needsContinuation(pendingLines)) {
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

  process.on('SIGINT', function() {
    if (interacting) {
      backend.interrupt();
      process.stdout.write('\n' + YELLOW + 'Interrupted' + RESET + '\n');
      interacting = false;
    } else {
      pendingLines = [];
      process.stdout.write('\n');
    }
    prompt();
  });

  prompt();
}

module.exports = {
  needsContinuation,
  renderResponses,
  runLoop,
  colors: { RESET, BOLD, DIM, RED, GREEN, YELLOW, CYAN },
  isaTTY,
};
