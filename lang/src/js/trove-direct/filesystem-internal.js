({
    provides: {
        values: {},
        types: {},
    },
    requires: [ ],
    nativeRequires: ['fs', 'path'],
    /**
     * Direct-mode override of filesystem-internal: same API, but all
     * operations are synchronous and return synchronously-resolved
     * thenables.  filesystem.js's `.then(...).catch(...)` chains therefore
     * run eagerly, and the direct runtime's `await` unwraps the result
     * without capturing the stack (which direct mode cannot do).
     */
    theModule: function(runtime, _, uri, fs, path) {
        function SyncResult(value, isError) {
            this.value = value;
            this.isError = isError;
        }
        SyncResult.prototype.$syncThen = true;
        SyncResult.prototype.then = function(onOk, onErr) {
            try {
                if (this.isError) {
                    if (onErr) {
                        var handled = onErr(this.value);
                        return (handled instanceof SyncResult) ? handled : new SyncResult(handled, false);
                    }
                    return this;
                }
                if (!onOk) { return this; }
                var res = onOk(this.value);
                return (res instanceof SyncResult) ? res : new SyncResult(res, false);
            } catch(e) {
                return new SyncResult(e, true);
            }
        };
        SyncResult.prototype["catch"] = function(onErr) {
            return this.then(undefined, onErr);
        };
        function sync(f) {
            return function() {
                try {
                    return new SyncResult(f.apply(null, arguments), false);
                } catch(e) {
                    return new SyncResult(e, true);
                }
            };
        }
        return runtime.makeJSModuleReturn({
            readFile: sync(function(p) { return fs.readFileSync(p); }),
            writeFile: sync(function(p, data) { return fs.writeFileSync(p, data); }),
            stat: sync(function(p) {
                var stats = fs.statSync(p);
                return {
                    ctime: Math.floor(stats.ctimeMs),
                    mtime: Math.floor(stats.mtimeMs),
                    size: stats.size,
                    native: stats
                };
            }),
            resolve: sync(function() { return path.resolve.apply(path, arguments); }),
            exists: sync(function(p) { return fs.existsSync(p); }),
            join: sync(function() { return path.join.apply(path, arguments); }),
            'path-sep': path.sep,
            createDir: sync(function(p) { return fs.mkdirSync(p); }),
            relative: sync(function(from, to) { return path.relative(from, to); }),
            isAbsolute: sync(function(p) { return path.isAbsolute(p); }),
            basename: sync(function(p) { return path.basename(p); }),
            dirname: sync(function(p) { return path.dirname(p); }),
        });
    }
})
