// Preloaded into every node process in the CLI (client + forked server) to
// find who reads global.localStorage.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get() {
    const tag = process.argv.slice(1, 3).join(' ');
    process.stderr.write('\n[LOCALSTORAGE READ] pid=' + process.pid + ' argv=' + tag + '\n');
    process.stderr.write(new Error('stack').stack.split('\n').slice(1, 7).join('\n') + '\n');
    return undefined;
  },
});
