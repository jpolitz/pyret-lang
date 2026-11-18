/*
 * "Work on GitHub" launcher (prototype).
 *
 * code.pyret.org copies the student's program to the clipboard and opens a
 * launcher repo (e.g. brownplt/pyret-launcher) in vscode.dev / github.dev. That
 * repo carries a `pyret-launcher.json` marker at its root and recommends this
 * extension in .vscode/extensions.json. Once the extension is installed, the
 * `workspaceContains:pyret-launcher.json` activation event fires and we:
 *
 *   1. remember which repo this is (so a student who has forked the launcher
 *      can be sent back to their fork next time),
 *   2. offer to import the clipboard, showing a preview of what will be pasted,
 *   3. write it to a new .arr file and open it in the Parley editor.
 *
 * Transport is the clipboard on purpose: vscode.dev sends
 * Cross-Origin-Opener-Policy: same-origin, so the CPO tab cannot postMessage
 * into it, and CPO must not hold student bytes on a server. The clipboard text
 * is the bare program, so if anything here fails the student can still paste
 * by hand.
 *
 * Writes in a vscode.dev GitHub workspace are uncommitted changes held in that
 * browser's storage until the student commits; committing to a repo they can't
 * push to is where vscode.dev offers to fork.
 */
import * as vscode from 'vscode';
import { Buffer } from 'buffer';

export const MARKER = 'pyret-launcher.json';
const PARLEY_VIEW_TYPE = 'pyret-parley.cpo';

// globalState keys. globalState is per browser origin (vscode.dev and
// github.dev are separate), shared across all workspaces opened there.
const HOME_KEY = 'pyret-parley.launcher.home';
const PENDING_KEY = 'pyret-parley.launcher.pending';
const LAST_IMPORTED_KEY = 'pyret-parley.launcher.lastImported';

// A handed-off import older than this is stale and dropped.
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

type LauncherConfig = {
  // "owner/repo" of the shared launcher. Any other repo carrying the marker is
  // taken to be a student's own copy (fork) and remembered as their home.
  upstream?: string;
  // Folder (relative to the repo root) that imported programs go into.
  folder?: string;
  // Base name for imported files; becomes program.arr, program-2.arr, ...
  baseName?: string;
};

type Pending = { text: string; at: number };

export type RepoId = { owner: string; repo: string };

/**
 * Identify the GitHub repo a workspace folder is backed by. vscode.dev and
 * github.dev mount GitHub repos as `vscode-vfs://github/<owner>/<repo>`
 * (a branch or PR can follow as a `+ref` suffix on the authority, which we
 * don't need). Anything else -- a local folder, the test-web mount -- is not a
 * GitHub repo and returns undefined.
 */
export function repoOf(uri: vscode.Uri): RepoId | undefined {
  if (uri.scheme !== 'vscode-vfs') { return undefined; }
  if (!/^github(\+|$)/.test(uri.authority)) { return undefined; }
  const parts = uri.path.split('/').filter((p) => p.length > 0);
  if (parts.length < 2) { return undefined; }
  return { owner: parts[0], repo: parts[1] };
}

export function repoName(r: RepoId): string { return `${r.owner}/${r.repo}`; }

/** First few lines of the text, for the "is this your code?" prompt. */
export function previewOf(text: string, maxLines = 8, maxCols = 80): string {
  const lines = text.replace(/(\r\n?|\n)$/, '').split(/\r\n?|\n/);
  // The dialog collapses leading spaces, so keep indentation with NBSPs.
  const shown = lines.slice(0, maxLines).map((l) =>
    (l.length > maxCols ? l.slice(0, maxCols - 1) + '…' : l)
      .replace(/^ +/, (sp) => '\u00a0'.repeat(sp.length)));
  const more = lines.length - shown.length;
  return shown.join('\n') + (more > 0 ? `\n… (${more} more line${more === 1 ? '' : 's'})` : '');
}

/** Cheap stable fingerprint so a reload doesn't re-offer the same import. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}:${(h >>> 0).toString(16)}`;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try { await vscode.workspace.fs.stat(uri); return true; }
  catch { return false; }
}

async function readConfig(root: vscode.Uri): Promise<LauncherConfig | undefined> {
  const uri = vscode.Uri.joinPath(root, MARKER);
  let bytes: Uint8Array;
  try { bytes = await vscode.workspace.fs.readFile(uri); }
  catch { return undefined; }
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')) as LauncherConfig; }
  catch (e) {
    console.warn(`Pyret launcher: ${MARKER} is not valid JSON; using defaults`, e);
    return {};
  }
}

/** First unused `<folder>/<base>.arr`, `<folder>/<base>-2.arr`, ... */
async function freshName(root: vscode.Uri, folder: string, base: string): Promise<string> {
  const prefix = folder ? `${folder.replace(/\/+$/, '')}/` : '';
  for (let n = 1; n < 1000; n++) {
    const rel = `${prefix}${base}${n === 1 ? '' : `-${n}`}.arr`;
    if (!(await exists(vscode.Uri.joinPath(root, rel)))) { return rel; }
  }
  return `${prefix}${base}-${Date.now()}.arr`;
}

async function readClipboard(): Promise<string | undefined> {
  try {
    return await vscode.env.clipboard.readText();
  } catch (e) {
    // Browsers gate clipboard reads behind a permission prompt (Chromium) or a
    // fresh user gesture (Firefox, Safari); a refusal lands here.
    console.warn('Pyret launcher: clipboard read failed', e);
    return undefined;
  }
}

/** URL that opens `home` in the same web host we're running in. */
function webUrlFor(home: string): vscode.Uri {
  return vscode.env.appHost === 'github.dev'
    ? vscode.Uri.parse(`https://github.dev/${home}`)
    : vscode.Uri.parse(`https://vscode.dev/github/${home}`);
}

/**
 * Write `text` to a fresh file under the workspace root (asking the student to
 * confirm the name) and open it in the Parley editor. Returns the file's URI,
 * or undefined if they cancelled.
 */
async function writeAndOpen(
  context: vscode.ExtensionContext,
  root: vscode.Uri,
  config: LauncherConfig,
  text: string
): Promise<vscode.Uri | undefined> {
  const suggested = await freshName(root, config.folder ?? '', config.baseName ?? 'program');
  const rel = await vscode.window.showInputBox({
    title: 'Name for your Pyret file',
    value: suggested,
    valueSelection: [suggested.lastIndexOf('/') + 1, suggested.length - '.arr'.length],
    validateInput: async (v) => {
      if (!/\.arr$/.test(v)) { return 'The name must end in .arr'; }
      if (/(^|\/)\.\.(\/|$)/.test(v) || v.startsWith('/')) { return 'Use a name inside this repository'; }
      if (await exists(vscode.Uri.joinPath(root, v))) { return `${v} already exists`; }
      return undefined;
    },
  });
  if (rel === undefined) { return undefined; }
  const uri = vscode.Uri.joinPath(root, rel);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
  await context.globalState.update(LAST_IMPORTED_KEY, fingerprint(text));
  await vscode.commands.executeCommand('vscode.openWith', uri, PARLEY_VIEW_TYPE);
  return uri;
}

/**
 * The import flow. `auto` is true when we got here from activation rather than
 * the command; in that case we stay quiet if there's nothing new to import.
 */
export async function runImport(context: vscode.ExtensionContext, auto: boolean): Promise<vscode.Uri | undefined> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    if (!auto) { vscode.window.showWarningMessage('Open a folder or repository first, then import.'); }
    return undefined;
  }
  const config = (await readConfig(root)) ?? {};
  const here = repoOf(root);

  // Remember a student's own copy of the launcher. Synced via Settings Sync
  // when they have it on, so it can follow them to another machine.
  if (here && config.upstream && repoName(here).toLowerCase() !== config.upstream.toLowerCase()) {
    await context.globalState.update(HOME_KEY, repoName(here));
  }

  // An import handed off from another window (see "my copy" below) wins over
  // the clipboard, which may have changed since.
  let text: string | undefined;
  let handedOff = false;
  const pending = context.globalState.get<Pending>(PENDING_KEY);
  if (pending) {
    await context.globalState.update(PENDING_KEY, undefined);
    if (Date.now() - pending.at < PENDING_MAX_AGE_MS) { text = pending.text; handedOff = true; }
  }
  if (text === undefined) { text = await readClipboard(); }

  if (text === undefined || text.trim() === '') {
    if (auto && text !== undefined) { return undefined; } // empty clipboard on a plain visit: nothing to do
    const choice = await vscode.window.showInformationMessage(
      text === undefined
        ? "Couldn't read your clipboard. You can make a new file and paste your code into it (Ctrl+V / Cmd+V)."
        : 'Your clipboard is empty. Copy your code from code.pyret.org, or make an empty file and paste into it.',
      'Try again', 'New empty file');
    if (choice === 'Try again') { return runImport(context, false); }
    if (choice === 'New empty file') { return writeAndOpen(context, root, config, ''); }
    return undefined;
  }

  // On reload, activation runs again with the same clipboard. Don't re-offer.
  if (auto && !handedOff && context.globalState.get<string>(LAST_IMPORTED_KEY) === fingerprint(text)) {
    return undefined;
  }

  const lineCount = text.replace(/(\r\n?|\n)$/, '').split(/\r\n?|\n/).length;
  const detail = `${lineCount} line${lineCount === 1 ? '' : 's'}, starting with:\n\n${previewOf(text)}`;
  const home = context.globalState.get<string>(HOME_KEY);
  const inUpstreamWithHome = !handedOff && here && home && repoName(here).toLowerCase() !== home.toLowerCase();

  const IMPORT = 'Import';
  const IMPORT_HERE = 'Import here';
  const myCopy = home ? `Import into my copy (${home})` : '';
  const choice = inUpstreamWithHome
    ? await vscode.window.showInformationMessage('Import your code from code.pyret.org?',
        { modal: true, detail: detail + `\n\nYou saved your own copy at ${home} before.` },
        myCopy, IMPORT_HERE)
    : await vscode.window.showInformationMessage('Import your code from code.pyret.org?',
        { modal: true, detail }, IMPORT);

  if (choice === myCopy && home) {
    await context.globalState.update(PENDING_KEY, { text, at: Date.now() } satisfies Pending);
    await vscode.env.openExternal(webUrlFor(home));
    return undefined;
  }
  if (choice === IMPORT || choice === IMPORT_HERE) {
    return writeAndOpen(context, root, config, text);
  }
  return undefined;
}

export function registerLauncher(context: vscode.ExtensionContext): void {
  context.globalState.setKeysForSync([HOME_KEY]);
  context.subscriptions.push(vscode.commands.registerCommand(
    'pyret-parley.import-from-clipboard', () => runImport(context, false)));

  // Activation can be for any reason (a .arr file, the command); only the
  // launcher repo gets the automatic offer.
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) { return; }
  void exists(vscode.Uri.joinPath(root, MARKER)).then((isLauncher) => {
    if (isLauncher) { return runImport(context, true); }
  }).catch((e) => console.error('Pyret launcher: import failed', e));
}
