import * as http from 'http';
import * as vscode from 'vscode';
import type { PaneModules } from './pyretCPOWebEditor';

type WireRequest = {
  id: string,
  method: string,
  path: string,
  query: string,
  headers: { [name: string]: string },
  body: string,
};

type Server = {
  server: http.Server,
  queue: WireRequest[],
  waiters: ((r: WireRequest | null) => void)[],
  open: Map<string, http.ServerResponse>,
  closed: boolean,
};

const MAX_BODY = 1 << 20;
const RESPONSE_TIMEOUT_MS = 30000;
const PORT_ATTEMPTS = 20;

let requestCounter = 0;
let serverCounter = 0;

function listenOn(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (e: Error) => { server.off('listening', onListening); reject(e); };
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as { port: number }).port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}

export function makeHttpModule(_pane: vscode.WebviewPanel): PaneModules {
  const servers = new Map<string, Server>();

  function deliver(s: Server, r: WireRequest) {
    const waiter = s.waiters.shift();
    if (waiter) { waiter(r); } else { s.queue.push(r); }
  }

  function closeServer(id: string) {
    const s = servers.get(id);
    if (!s) { return; }
    servers.delete(id);
    s.closed = true;
    s.waiters.splice(0).forEach(w => w(null));
    s.queue = [];
    for (const res of s.open.values()) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('The Pyret reactor serving this request stopped.\n');
    }
    s.open.clear();
    s.server.close();
    s.server.closeAllConnections();
  }

  const http_ = {
    listen: async (port: number) => {
      const id = `server-${++serverCounter}`;
      const s: Server = { server: http.createServer(), queue: [], waiters: [], open: new Map(), closed: false };
      s.server.on('request', (req, res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BODY) { res.writeHead(413); res.end(); req.destroy(); return; }
          chunks.push(c);
        });
        req.on('end', () => {
          if (s.closed || res.writableEnded) { return; }
          const rid = `${id}-${++requestCounter}`;
          const url = new URL(req.url ?? '/', 'http://localhost');
          const headers: { [name: string]: string } = {};
          for (const [k, v] of Object.entries(req.headers)) {
            headers[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
          }
          s.open.set(rid, res);
          const timer = setTimeout(() => {
            if (s.open.delete(rid)) {
              res.writeHead(504, { 'content-type': 'text/plain' });
              res.end('The Pyret reactor did not respond in time.\n');
            }
          }, RESPONSE_TIMEOUT_MS);
          res.on('close', () => { clearTimeout(timer); s.open.delete(rid); });
          deliver(s, {
            id: rid,
            method: req.method ?? 'GET',
            path: url.pathname,
            query: url.search.replace(/^\?/, ''),
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
      let bound: number | undefined;
      let lastError: unknown;
      for (let i = 0; i < PORT_ATTEMPTS && bound === undefined; i++) {
        try { bound = await listenOn(s.server, port + i); }
        catch (e: any) {
          lastError = e;
          if (e?.code !== 'EADDRINUSE') { break; }
        }
      }
      if (bound === undefined) { throw lastError; }
      servers.set(id, s);
      const external = await vscode.env.asExternalUri(vscode.Uri.parse(`http://localhost:${bound}/`));
      return { server: id, port: bound, url: external.toString(true) };
    },
    nextRequest: (id: string) => {
      const s = servers.get(id);
      if (!s) { return Promise.resolve(null); }
      const queued = s.queue.shift();
      if (queued) { return Promise.resolve(queued); }
      return new Promise<WireRequest | null>(resolve => s.waiters.push(resolve));
    },
    respond: async (requestId: string, status: number, headers: { [name: string]: string }, body: string) => {
      for (const s of servers.values()) {
        const res = s.open.get(requestId);
        if (res) {
          s.open.delete(requestId);
          res.writeHead(status, headers);
          res.end(body);
          return true;
        }
      }
      return false;
    },
    close: async (id: string) => { closeServer(id); },
  };

  return {
    modules: { http: http_ },
    dispose: () => { [...servers.keys()].forEach(closeServer); },
  };
}
