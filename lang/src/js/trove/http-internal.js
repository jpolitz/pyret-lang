({
    provides: {
        values: {},
        types: {},
    },
    requires: [],
    nativeRequires: ['http'],
    theModule: function(runtime, _, uri, http) {
        const MAX_BODY = 1 << 20;
        const RESPONSE_TIMEOUT_MS = 30000;
        const PORT_ATTEMPTS = 20;
        const servers = new Map();
        let requestCounter = 0;
        let serverCounter = 0;

        function listenOn(server, port) {
            return new Promise((resolve, reject) => {
                const onError = (e) => { server.off('listening', onListening); reject(e); };
                const onListening = () => { server.off('error', onError); resolve(server.address().port); };
                server.once('error', onError);
                server.once('listening', onListening);
                server.listen(port, '0.0.0.0');
            });
        }

        function deliver(s, r) {
            const waiter = s.waiters.shift();
            if(waiter) { waiter(r); } else { s.queue.push(r); }
        }

        async function listen(port) {
            const id = `server-${++serverCounter}`;
            const s = { server: http.createServer(), queue: [], waiters: [], open: new Map(), closed: false };
            s.server.on('request', (req, res) => {
                const chunks = [];
                let size = 0;
                req.on('data', (c) => {
                    size += c.length;
                    if(size > MAX_BODY) { res.writeHead(413); res.end(); req.destroy(); return; }
                    chunks.push(c);
                });
                req.on('end', () => {
                    if(s.closed || res.writableEnded) { return; }
                    const rid = `${id}-${++requestCounter}`;
                    const url = new URL(req.url || '/', 'http://localhost');
                    const headers = {};
                    for(const [k, v] of Object.entries(req.headers)) {
                        headers[k] = Array.isArray(v) ? v.join(', ') : String(v === undefined ? '' : v);
                    }
                    s.open.set(rid, res);
                    const timer = setTimeout(() => {
                        if(s.open.delete(rid)) {
                            res.writeHead(504, { 'content-type': 'text/plain' });
                            res.end('The Pyret reactor did not respond in time.\n');
                        }
                    }, RESPONSE_TIMEOUT_MS);
                    res.on('close', () => { clearTimeout(timer); s.open.delete(rid); });
                    deliver(s, {
                        id: rid,
                        method: req.method || 'GET',
                        path: url.pathname,
                        query: url.search.replace(/^\?/, ''),
                        headers,
                        body: Buffer.concat(chunks).toString('utf8'),
                    });
                });
            });
            let bound;
            let lastError;
            for(let i = 0; i < PORT_ATTEMPTS && bound === undefined; i++) {
                try { bound = await listenOn(s.server, port + i); }
                catch(e) {
                    lastError = e;
                    if(!e || e.code !== 'EADDRINUSE') { break; }
                }
            }
            if(bound === undefined) { throw lastError; }
            servers.set(id, s);
            return { server: id, port: bound, url: `http://localhost:${bound}/` };
        }

        async function nextRequest(id) {
            const s = servers.get(id);
            if(!s) { return null; }
            const queued = s.queue.shift();
            if(queued) { return queued; }
            return new Promise((resolve) => s.waiters.push(resolve));
        }

        async function respond(requestId, status, headers, body) {
            for(const s of servers.values()) {
                const res = s.open.get(requestId);
                if(res) {
                    s.open.delete(requestId);
                    res.writeHead(status, headers);
                    res.end(body);
                    return true;
                }
            }
            return false;
        }

        async function close(id) {
            const s = servers.get(id);
            if(!s) { return; }
            servers.delete(id);
            s.closed = true;
            s.waiters.splice(0).forEach((w) => w(null));
            s.queue = [];
            for(const res of s.open.values()) {
                res.writeHead(503, { 'content-type': 'text/plain' });
                res.end('The Pyret reactor serving this request stopped.\n');
            }
            s.open.clear();
            s.server.close();
            if(typeof s.server.closeAllConnections === 'function') { s.server.closeAllConnections(); }
        }

        return runtime.makeJSModuleReturn({ listen, nextRequest, respond, close });
    }
})
