// Head-to-head parse timing: RNGLR (oracle full path) vs Lezer (tile + parse).
// Both share Pyret's tokenizer (Lezer replays it), so we also isolate tokenize time.
// Usage: GRAMMAR_FILE=pyret.named.grammar node timing.js [reps]
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const oracle = require("./oracle");
const lez = require("./lezer-run");

const REPO = path.join(__dirname, "..");
const REPS = parseInt(process.argv[2] || "3", 10);

function now() { return Number(process.hrtime.bigint()) / 1e6; } // ms

async function main() {
  await lez.init();
  const { T, G } = await oracle.load();
  const Tok = T.Tokenizer, Gr = G.PyretGrammar;

  // RNGLR full: tokenize + parse + countAllParses + constructUniqueParse (produces a tree)
  function rnglr(src) {
    Tok.tokenizeFrom(src);
    const parsed = Gr.parse(Tok);
    if (!parsed) return false;
    if (Gr.countAllParses(parsed) === 1) return Gr.constructUniqueParse(parsed);
    return false;
  }
  // Pyret tokenize only (the shared cost): drain the token stream.
  function tok(src) { Tok.tokenizeFrom(src); let n = 0; while (Tok.hasNext()) { const t = Tok.next(); n++; if (t.name === "EOF") break; } return n; }

  // oracle-accepted corpus files (so both produce a real tree)
  const files = execSync(`find "${REPO}" -name '*.arr' -not -path '*/node_modules/*'`, { encoding: "utf8", maxBuffer: 1 << 26 })
    .trim().split("\n").filter(Boolean)
    .map(f => ({ f, src: fs.readFileSync(f, "utf8") }))
    .filter(x => { try { return rnglr(x.src) !== false; } catch (e) { return false; } });

  const totalBytes = files.reduce((a, x) => a + x.src.length, 0);

  // warm up (JIT)
  for (const x of files) { try { rnglr(x.src); } catch (e) {} try { lez.rawParse(x.src); } catch (e) {} tok(x.src); }

  let tR = 0, tL = 0, tT = 0;
  const perFile = [];
  for (const x of files) {
    let r = 0, l = 0, t = 0;
    for (let i = 0; i < REPS; i++) {
      let s = now(); try { rnglr(x.src); } catch (e) {} r += now() - s;
      s = now(); try { lez.rawParse(x.src); } catch (e) {} l += now() - s;
      s = now(); tok(x.src); t += now() - s;
    }
    r /= REPS; l /= REPS; t /= REPS;
    tR += r; tL += l; tT += t;
    perFile.push({ f: path.relative(REPO, x.f), bytes: x.src.length, r, l, t });
  }

  const mbps = (bytes, ms) => (bytes / 1e6) / (ms / 1000);
  console.log(`=== parse timing: RNGLR (full) vs Lezer (tile+parse) ===`);
  console.log(`files: ${files.length}, total ${(totalBytes/1e6).toFixed(2)} MB, reps/file: ${REPS}\n`);
  console.log(`END-TO-END (source -> tree, both include Pyret tokenize):`);
  console.log(`  RNGLR: ${tR.toFixed(1)} ms total, ${mbps(totalBytes, tR).toFixed(2)} MB/s`);
  console.log(`  Lezer: ${tL.toFixed(1)} ms total, ${mbps(totalBytes, tL).toFixed(2)} MB/s`);
  console.log(`  speedup (RNGLR/Lezer): ${(tR/tL).toFixed(2)}x\n`);
  console.log(`SHARED Pyret tokenize: ${tT.toFixed(1)} ms total, ${mbps(totalBytes, tT).toFixed(2)} MB/s`);
  console.log(`PARSER-ONLY (end-to-end minus tokenize):`);
  console.log(`  RNGLR parse: ${(tR-tT).toFixed(1)} ms`);
  console.log(`  Lezer parse: ${(tL-tT).toFixed(1)} ms`);
  console.log(`  parser-only speedup: ${((tR-tT)/Math.max(0.001,(tL-tT))).toFixed(2)}x\n`);

  perFile.sort((a, b) => b.bytes - a.bytes);
  console.log(`largest files (bytes | RNGLR ms | Lezer ms | tok ms | end-to-end speedup):`);
  for (const p of perFile.slice(0, 8))
    console.log(`  ${String(p.bytes).padStart(7)} | ${p.r.toFixed(2).padStart(8)} | ${p.l.toFixed(2).padStart(8)} | ${p.t.toFixed(2).padStart(7)} | ${(p.r/p.l).toFixed(2)}x  ${p.f}`);
}
main();
