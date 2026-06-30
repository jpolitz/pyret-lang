// Headless verification of the parse + highlight path (no DOM / EditorView).
// Bundled to CJS by esbuild and run under Node.
import { highlightTree } from "@lezer/highlight";
import { pyretLanguage, pyretHighlightStyle } from "./pyret-language.js";
import sample from "./sample.arr";

const tree = pyretLanguage.parser.parse(sample);
let nodes = 0, errors = 0;
const c = tree.cursor();
do { nodes++; if (c.type.isError) errors++; } while (c.next());

let styled = 0;
highlightTree(tree, pyretHighlightStyle, (from, to, cls) => { if (cls) styled++; });

console.log("sample chars   :", sample.length);
console.log("tree nodes     :", nodes);
console.log("error nodes    :", errors);
console.log("highlight spans:", styled);
console.log("first 600 chars of tree:\n" + tree.toString().slice(0, 600));
if (errors !== 0) { console.error("FAIL: error nodes present"); process.exit(1); }
if (styled < 50) { console.error("FAIL: too few highlight spans"); process.exit(1); }
console.log("VERIFY OK");
