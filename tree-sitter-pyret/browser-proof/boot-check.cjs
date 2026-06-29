const { chromium } = require("/home/exedev/pyret-lang/browser-test/node_modules/playwright");
(async()=>{
  const b = await chromium.launch({headless:true});
  const p = await b.newPage();
  const logs=[], errs=[];
  p.on("console",m=>logs.push(m.type()+": "+m.text()));
  p.on("pageerror",e=>errs.push("PAGEERROR: "+e.message));
  await p.goto("http://localhost:4999/editor",{waitUntil:"domcontentloaded",timeout:45000});
  let ready=false, fatal=false;
  for(let i=0;i<60;i++){ await new Promise(r=>setTimeout(r,1000));
    if(logs.some(l=>/REPL ready|Pyret loaded and ready/.test(l))){ready=true;break;}
    if(i>6 && errs.some(e=>/parse-tree-sitter|tree-sitter-runtime|nodeRequire|require is not|Cannot find module/.test(e))){fatal=true;break;}
  }
  console.log("READY:", ready, "| earlyFatal:", fatal);
  console.log("--- tree-sitter logs ---"); logs.filter(l=>/tree-sitter/i.test(l)).forEach(l=>console.log(l));
  console.log("--- pageerrors (first 8) ---"); errs.slice(0,8).forEach(l=>console.log(l));
  console.log("--- console errors (first 8) ---"); logs.filter(l=>l.startsWith("error:")).slice(0,8).forEach(l=>console.log("  "+l.slice(0,200)));
  const tsState = await p.evaluate(()=>window.__PYRET_TS__ ? {ready:window.__PYRET_TS__.ready, err:window.__PYRET_TS__.error||null} : "absent").catch(e=>"eval-failed");
  console.log("window.__PYRET_TS__ (top):", JSON.stringify(tsState));
  await b.close();
})().catch(e=>{console.error("HARNESS:",String(e).slice(0,300));process.exit(1);});
