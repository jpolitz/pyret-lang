/*
  Read-side seam for compiler-fixed sources (trove .arr/.js, the runtime JS the
  standalone concatenates, the require-config). Normally these are plain
  fs.readFileSync/existsSync/statSync. The single-executable entry
  (sea/pyret-sea.ts, sea/pyret-cli.ts) registers a provider that supplies
  *embedded* copies of exactly these files, so the binary can compile with no
  asset tree on disk.

  Semantics: disk-first, embedded-fallback — the real file is used whenever it
  exists (a present checkout always wins, so behavior/bytes are unchanged and a
  user's own --builtin-*-dir is never shadowed); the embedded copy is served
  only when the file is missing. With no provider registered (the node build)
  these are exactly the underlying fs calls.
*/
import * as fs from 'fs';

export interface FixedFsProvider {
  // Returns the embedded contents for `path`, or undefined if not embedded.
  read(path: string): string | undefined;
  // Embedded mtimeMs for `path`. Sources report 0 ("always happy with the
  // compiled version"); precompiled cache entries report > 0 so
  // cachedAvailable accepts them. Defaults to 0 when omitted.
  mtime?(path: string): number;
}

let provider: FixedFsProvider | undefined;
export function setFixedFsProvider(p: FixedFsProvider): void { provider = p; }

function embedded(path: string): string | undefined {
  return provider ? provider.read(path) : undefined;
}
function isMissing(e: any): boolean {
  return e && (e.code === 'ENOENT' || e.code === 'ENOTDIR');
}

export function readFixed(path: string, encoding: 'utf8'): string {
  try {
    return fs.readFileSync(path, encoding) as string;
  } catch (e) {
    if (isMissing(e)) {
      const c = embedded(path);
      if (c !== undefined) return c;
    }
    throw e;
  }
}

export function existsFixed(path: string): boolean {
  return fs.existsSync(path) || embedded(path) !== undefined;
}

export function mtimeFixed(path: string): number {
  try {
    return fs.statSync(path).mtimeMs;
  } catch (e) {
    // Embedded sources report mtime 0 (the "always happy with the compiled
    // version" convention at cli-module-loader.cachedAvailable); embedded
    // precompiled cache entries report the provider's mtime (> 0) so they are
    // accepted as available.
    if (isMissing(e) && embedded(path) !== undefined) {
      return provider && provider.mtime ? provider.mtime(path) : 0;
    }
    throw e;
  }
}
