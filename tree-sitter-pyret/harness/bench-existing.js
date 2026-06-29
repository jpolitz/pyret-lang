// Time the existing surface-parse over the corpus (one runtime boot). No "use strict".
var fs=require("fs"),path=require("path");
var JARR=path.resolve(__dirname,"../../lang/build/phaseA/pyret.jarr");
var MARK='requirejs(["pyret-base/js/runtime", "pyret-base/js/post-load-hooks", "pyret-base/js/exn-stack-parser", "program"]';
var FILES=fs.readFileSync(path.resolve(__dirname,"../corpus/all-arr-abs.txt"),"utf8").split("\n").map(function(s){return s.trim();}).filter(Boolean);
var txt=fs.readFileSync(JARR,"utf8"); var prefix=txt.slice(0,txt.indexOf(MARK));
var driver=';(function(){requirejs(["pyret-base/js/runtime","pyret-base/js/post-load-hooks","program"],function(rl,hl,pr){global.__B__(rl,hl,pr);});})();';
global.__B__=function(rl,hl,program){
  var rt=rl.makeRuntime({stdout:function(){}, stderr:function(){}, stdin:process.stdin});
  rt.setParam("command-line-arguments",process.argv.slice(1));
  var realm={instantiated:{},static:{}}, PP="builtin://parse-pyret";
  var sub=program.toLoad.slice(0,program.toLoad.indexOf(PP)+1);
  var hooks=hl.makeDefaultPostLoadHooks(rt,{main:PP,checks:"none",checksFormat:"text"});
  rt.runThunk(function(){rt.modules=realm.instantiated;return rt.runStandalone(program.staticModules,realm,program.depMap,sub,hooks);},function(lr){
    if(!rt.isSuccessResult(lr)){process.stderr.write("load fail\n");process.exit(1);}
    var sp=rt.getField(rt.getField(realm.instantiated[PP],"provide-plus-types"),"values");
    sp=rt.getField(sp,"surface-parse");
    var srcs=[]; var bytes=0;
    for(var i=0;i<FILES.length;i++){ var s=fs.readFileSync(FILES[i],"utf8"); srcs.push(s); bytes+=Buffer.byteLength(s); }
    var ok=0;
    function pass(timed,cb){
      var idx=0; var t0=process.hrtime.bigint();
      function step(){
        if(idx>=srcs.length){ var t1=process.hrtime.bigint(); return cb(Number(t1-t0)/1e6); }
        var s=srcs[idx++];
        rt.runThunk(function(){return sp.app(rt.makeString(s),rt.makeString("file://bench"));},function(r){ if(timed&&rt.isSuccessResult(r))ok++; setImmediate(step); });
      }
      step();
    }
    // warm pass, then 1 timed pass
    pass(true,function(ms){
      process.stdout.write("existing surface-parse: "+ms.toFixed(1)+" ms total ("+ok+" ok) => "+(bytes/1024/ms).toFixed(1)+" KB/ms ("+(bytes/1024/1024/(ms/1000)).toFixed(1)+" MB/s)\n");
      process.exit(0);
    });
  });
};
eval(prefix+"\n"+driver);
