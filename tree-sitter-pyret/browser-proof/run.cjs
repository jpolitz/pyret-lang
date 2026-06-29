const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("/home/exedev/pyret-lang/browser-test/node_modules/playwright");
const DIR = __dirname;
const MIME = {".html":"text/html",".js":"text/javascript",".wasm":"application/wasm"};
const server = http.createServer((req,res)=>{
  let f = path.join(DIR, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream"}); res.end(d); });
});
(async()=>{
  await new Promise(r=>server.listen(0,r));
  const port = server.address().port;
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  const errs=[]; page.on("console",m=>{ if(m.type()==="error") errs.push(m.text()); });
  await page.goto(`http://localhost:${port}/index.html`);
  const result = await page.waitForFunction("window.RESULT && (window.RESULT.then ? window.RESULT.then(r=>{window.__R=r;return true}) : true)", {timeout:30000}).then(()=>page.evaluate("window.__R || window.RESULT"));
  await browser.close(); server.close();
  console.log(JSON.stringify(result,null,1));
  if(errs.length) console.log("PAGE ERRORS:", errs.join("\n"));
})().catch(e=>{console.error("HARNESS ERR:",e); process.exit(1);});
