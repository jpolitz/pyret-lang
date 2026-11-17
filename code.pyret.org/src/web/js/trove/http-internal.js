({
    provides: {
        values: {},
        types: {}
    },
    requires: [],
    nativeRequires: [],
    theModule: function(runtime, _, uri) {
        function rpc(method) {
            return async function(...args) {
                if(!(window.MESSAGES && window.MESSAGES.sendRpc)) {
                    throw new Error("http-internal: " + method + " needs an embedding context that provides an http RPC module, such as the Pyret VS Code extension");
                }
                return window.MESSAGES.sendRpc('http', method, args);
            };
        }
        return runtime.makeJSModuleReturn({
            listen: rpc('listen'),
            nextRequest: rpc('nextRequest'),
            respond: rpc('respond'),
            close: rpc('close'),
        });
    }
})
