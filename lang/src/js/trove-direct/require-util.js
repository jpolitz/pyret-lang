({
    requires: [],
    provides: {
        values: {
            'resolve': ["arrow", ["String"], "String"],
        },
        types: {}
    },
    nativeRequires: ["resolve"],
    theModule: function(runtime, _, _, browserifyResolve) {
        function resolve(moduleName, baseDir) {
            console.log(moduleName, baseDir);
            runtime.checkArgsInternal2('require-util', 'resolve', moduleName, runtime.String, baseDir, runtime.String);
            // DIRECT-MODE OVERRIDE: use the resolve package's sync API
            try {
                return browserifyResolve.sync(moduleName, { basedir: baseDir });
            } catch (err) {
                throw runtime.throwMessageException(`Error resolving ${moduleName} from ${baseDir}: ${String(err)}`);
            }
        }
        function cannotResolve(moduleName) {
            throw runtime.throwMessageException(`Cannot resolve module: ${moduleName}; require.resolve is not available in this context (perhaps you're running a script meant for the command line in the browser?)`);
        }
        let _resolve;
        if(typeof require === 'undefined' || !require.resolve) {
            _resolve = cannotResolve;
        } else {
            _resolve = resolve;
        }
        return runtime.makeModuleReturn({
            resolve: runtime.makeFunction(_resolve, 'resolve')
        }, {});
    }
})
