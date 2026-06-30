// Build step: pre-compile pyret.named.grammar into a parser TABLE + terms, so the
// browser ships only the @lezer/lr runtime — NOT @lezer/generator (the grammar
// compiler) — and does no grammar compilation at page load.
const { buildParserFile } = require("@lezer/generator");
const fs = require("fs"), path = require("path");

const grammar = fs.readFileSync(path.join(__dirname, "../pyret.named.grammar"), "utf8");
const { parser, terms } = buildParserFile(grammar, { moduleStyle: "es" });
fs.writeFileSync(path.join(__dirname, "pyret-parser.gen.js"), parser);
fs.writeFileSync(path.join(__dirname, "pyret-terms.gen.js"), terms);
console.log(`generated pyret-parser.gen.js (${parser.length}B) + pyret-terms.gen.js (${terms.length}B) — no runtime generator`);
