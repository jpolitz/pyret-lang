({
  provides: {
    values: { "readline": ["arrow", [], "String"]},
    types: {}
  },
  requires: [],
  nativeRequires: [],
  theModule: function(rt, ns, uri) {
    var lines = [];
    var readline = require('readline');
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    rl.on('line', function(line){
      lines.push(line);
    });
    function hasLine() {
      return lines.length > 0;
    }
    function readlineFromPyret() {
      return rt.pauseStack(function(restarter) {
        function readLineWait() {
          if(lines.length === 0) { return setTimeout(readLineWait, 0); }
          else {
            var line = lines.shift();
            return restarter.resume(line);
          }
        }
        return readLineWait();
      });
    }
    return rt.makeModuleReturn({
      "readline": rt.makeFunction(readlineFromPyret)
    }, {});
  }
})
