#!/usr/bin/env node
/*
  Divergence probe: server.ts `stop` command handler vs the original server.js.

  Original (lang/src/arr/compiler/server.js:107-112):
      if (parsed.command === "stop") {
        runtime.schedulePause(restarter => restarter.break()); // break IN-FLIGHT compile
        tryQueue();                                            // queue left INTACT
      }
  Port (lang/src/ts-compiler/src/server.ts:206-212):
      if (parsed.command === "stop") {
        runQueue.length = 0;   // clears the QUEUE; does nothing to the in-flight job
      }
  The port's comment claims compiles run synchronously so no job is in flight when a
  message is processed. That is stale: the handler chain is async (server.ts:185-195
  awaits onmessage because the dependency chase awaits), so a compile CAN be mid-flight.

  This probe drives the REAL server (exported `serve`) through a REAL ws client, with
  the actual compile work stubbed out to a promise we gate, so we can hold a job "in
  flight" deterministically and observe exactly what `stop` does to it.

  Run from lang/:
    node src/ts-compiler/tests/divergence/server-stop-race.js
  Requires `make ts-compiler` (build/ts-compiler present) first.
*/

'use strict';
const path = require('path');
const assert = require('assert');

const LANG = path.join(__dirname, '..', '..', '..', '..');   // .../lang
const OUT = path.join(LANG, 'build', 'ts-compiler');
const WebSocket = require(path.join(LANG, 'node_modules', 'ws'));

const SERVER = require(path.join(OUT, 'server.js'));
const CLI = require(path.join(OUT, 'cli-module-loader.js'));
const CS = require(path.join(OUT, 'compile-structs.js'));

const PORT = 39871;

// ---- Stub the heavy compile work with a gated promise per job. --------------
// compile() (server.ts) calls CS.makeDefaultCompileOptions(...) then awaits
// CLI.buildRunnableStandalone(...). We keep the getValue()-required keys present
// in the message so compile() reaches buildRunnableStandalone, then hold there.
CS.makeDefaultCompileOptions = function () { return {}; };

const calls = [];   // one record per in-flight compile, in start order
CLI.buildRunnableStandalone = function (program /*, requireConfig, outfile, opts */) {
  let resolve, reject;
  const p = new Promise((res, rej) => { resolve = res; reject = rej; });
  const rec = { program, settled: false, resolve, reject };
  rec.release = () => { rec.settled = true; resolve(undefined); };
  calls.push(rec);
  return p;
};

// A compile message whose options carry every key compile()'s getValue() needs.
function compileMsg(label) {
  return JSON.stringify({
    command: 'compile',
    compileOptions: JSON.stringify({
      program: label,
      'base-dir': '.',
      checks: 'all',
      'checks-format': 'text'
    })
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, label, ms = 3000) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for: ' + label);
    await sleep(10);
  }
}

function openClient() {
  const client = new WebSocket('ws://localhost:' + PORT);
  const state = { client, messages: [], closed: false, open: false };
  client.on('open', () => { state.open = true; });
  client.on('message', (d) => { state.messages.push(String(d)); });
  client.on('close', () => { state.closed = true; });
  client.on('error', () => { /* server closes connection after each job */ });
  return state;
}

let verdicts = [];

async function main() {
  // Start the real server. serve() -> makeServer() -> real ws layer.
  // (Passing a numeric port so node's listen() binds TCP, not a pipe path.)
  SERVER.serve(PORT, LANG);
  await sleep(150); // let the http/ws server bind

  // ======================================================================
  // PHASE 1: `stop` while a compile is IN FLIGHT.
  // ======================================================================
  const c1 = openClient();
  await waitFor(() => c1.open, 'client-1 open');

  const before = calls.length;
  c1.client.send(compileMsg('A'));
  // Job A should reach buildRunnableStandalone and hang there (in flight).
  await waitFor(() => calls.length === before + 1, 'job A in flight');
  const jobA = calls[before];
  assert.strictEqual(jobA.settled, false, 'A should be pending (in flight)');
  assert.strictEqual(c1.closed, false, 'connection should still be open during A');
  assert.strictEqual(c1.messages.length, 0, 'no compile result yet');

  // Now send `stop` while A is mid-flight.
  c1.client.send(JSON.stringify({ command: 'stop' }));
  await sleep(200); // give the stop handler every chance to act

  // OBSERVE: did stop interrupt A?
  const aInterruptedByStop = jobA.settled || c1.closed ||
    c1.messages.some((m) => m.includes('compile-failure') || m.includes('echo-err'));

  if (!aInterruptedByStop) {
    verdicts.push('PHASE1 CONFIRMED: `stop` did NOT interrupt the in-flight compile ' +
      '(A still pending, connection open, no failure/break emitted). ' +
      'Original would restarter.break() the running compile.');
  } else {
    verdicts.push('PHASE1 NOT REPRODUCED: `stop` appears to have affected the ' +
      'in-flight job (settled=' + jobA.settled + ', closed=' + c1.closed +
      ', msgs=' + JSON.stringify(c1.messages) + ').');
  }

  // Release A; it should complete NORMALLY (proving it ran to completion despite stop).
  jobA.release();
  await waitFor(() => c1.messages.some((m) => m.includes('compile-success')),
    'A compile-success after release');
  await waitFor(() => c1.closed, 'connection closed after A completes');
  verdicts.push('PHASE1 follow-through: after release, A produced compile-success ' +
    'and the connection closed -> the in-flight job ran to completion despite `stop`.');

  // ======================================================================
  // PHASE 2: does `stop` drop QUEUED jobs? (consequence #2)
  // Send A2 (in flight), then B, then stop. Observe whether B was ever queued.
  // ======================================================================
  const c2 = openClient();
  await waitFor(() => c2.open, 'client-2 open');

  const beforeP2 = calls.length;
  c2.client.send(compileMsg('A2'));
  await waitFor(() => calls.length === beforeP2 + 1, 'job A2 in flight');
  c2.client.send(compileMsg('B'));
  await sleep(200);

  const bStarted = calls.length === beforeP2 + 2;
  if (bStarted) {
    verdicts.push('PHASE2 NOTE: B started immediately (buildRunnableStandalone call #' +
      (beforeP2 + 2) + ') instead of waiting in runQueue. tryQueue() pops eagerly on ' +
      'every message and there is no busy-lock, so runQueue is empty between messages. ' +
      'Thus `stop`\'s `runQueue.length = 0` clears an already-empty queue: consequence ' +
      '#2 (dropping queued jobs) is LATENT, not observable under normal message ordering.');
  } else {
    verdicts.push('PHASE2 UNEXPECTED: B did not start immediately (calls=' + calls.length +
      ', expected ' + (beforeP2 + 2) + '); the port may actually be queuing.');
  }

  // stop now (queue empty), then release both jobs so the connection can close.
  c2.client.send(JSON.stringify({ command: 'stop' }));
  await sleep(100);
  for (let i = beforeP2; i < calls.length; i++) {
    if (!calls[i].settled) calls[i].release();
  }
  await sleep(200);

  // ---- Report ----
  console.log('');
  console.log('=== server-stop-race divergence probe ===');
  for (const v of verdicts) console.log('- ' + v);
  console.log('');

  const phase1Confirmed = verdicts.some((v) => v.startsWith('PHASE1 CONFIRMED'));
  if (phase1Confirmed) {
    console.log('DIVERGENCE CONFIRMED: `stop` ignored the in-flight job (it ran to ' +
      'completion) instead of breaking it as the original does. The queued-job-drop ' +
      'half of the finding is latent: the port never actually queues jobs (eager pop, ' +
      'no busy-lock), so `runQueue.length = 0` clears nothing in practice.');
  } else {
    console.log('DIVERGENCE NOT REPRODUCED (see phase notes above).');
  }
}

// Hard timeout so the probe can never hang the CI.
const guard = setTimeout(() => {
  console.error('PROBE BROKEN: overall timeout');
  process.exit(2);
}, 20000);
guard.unref && guard.unref();

main().then(() => {
  // makeServer keeps the http/ws server listening and returns no handle to close,
  // so force a clean exit. Verdict already printed.
  process.exit(0);
}, (err) => {
  console.error('PROBE BROKEN:', err && err.stack || err);
  process.exit(2);
});
