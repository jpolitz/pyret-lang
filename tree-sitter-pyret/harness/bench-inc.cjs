const Parser=require(".."); const TS=require("tree-sitter"); const fs=require("fs");
const p=new TS(); p.setLanguage(Parser);
let src=fs.readFileSync(process.argv[2],"utf8");
const buf=s=>({bufferSize:Math.max(32768,s.length*2+1024)});
const rc=(s,i)=>{let row=0,last=-1;for(let k=0;k<i;k++)if(s[k]==="\n"){row++;last=k;}return {row,column:i-last-1};};
for(let i=0;i<3;i++) p.parse(src,null,buf(src));
const ms=(fn,reps)=>{const t0=process.hrtime.bigint();for(let i=0;i<reps;i++)fn();return Number(process.hrtime.bigint()-t0)/1e6/reps;};
const full=ms(()=>p.parse(src,null,buf(src)),30);
let at=Math.floor(src.length*0.75); at=src.indexOf("\n",at)+1; // start of a line, deep in file
const pos=rc(src,at);
const ns=src.slice(0,at)+" "+src.slice(at);
let tree=p.parse(src,null,buf(src));
const inc=ms(()=>{
  tree.edit({startIndex:at,oldEndIndex:at,newEndIndex:at+1,
    startPosition:pos,oldEndPosition:pos,newEndPosition:{row:pos.row,column:pos.column+1}});
  p.parse(ns,tree,buf(ns));
  tree=p.parse(src,null,buf(src)); // reset
},30);
console.log(`file: ${(src.length/1024).toFixed(0)} KB, edit at line ${pos.row+1}`);
console.log(`full parse:          ${full.toFixed(2)} ms`);
console.log(`incremental reparse: ${inc.toFixed(3)} ms`);
console.log(`incremental speedup: ${(full/inc).toFixed(1)}x`);
