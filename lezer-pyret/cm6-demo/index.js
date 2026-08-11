import { EditorView, basicSetup } from "codemirror";
import { EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { foldGutter } from "@codemirror/language";
import { indentSelection, indentLess } from "@codemirror/commands";
import { highlightTree } from "@lezer/highlight";
import { pyret, pyretLanguage, pyretHighlightStyle } from "./pyret-language.js";
import { pyretComments, pyretCommentTheme } from "./pyret-comments.js";
import sample from "./sample.arr";

// ---- in-page sanity assertions (the bundle has no rendering we can inspect) --
function selfCheck() {
  try {
    const tree = pyretLanguage.parser.parse(sample);
    let nodes = 0, errors = 0;
    const c = tree.cursor();
    do { nodes++; if (c.type.isError) errors++; } while (c.next());

    let styled = 0;
    highlightTree(tree, pyretHighlightStyle, (from, to, cls) => { if (cls) styled++; });

    console.log("[pyret-cm6] parsed sample:", sample.length, "chars");
    console.log("[pyret-cm6] tree nodes:", nodes, "| error nodes:", errors);
    console.log("[pyret-cm6] highlight spans produced:", styled);
    console.assert(errors === 0, "sample should parse with zero error nodes");
    console.assert(nodes > 50, "sample should produce a non-trivial tree");
    console.assert(styled > 50, "highlighting should produce many styled spans");
    const ok = errors === 0 && styled > 50;
    const msg = ok
      ? `SELF-CHECK OK (nodes=${nodes}, errors=0, highlightSpans=${styled})`
      : `SELF-CHECK FAILED (errors=${errors}, spans=${styled})`;
    if (ok) console.log("[pyret-cm6] " + msg);
    const el = document.getElementById("selfcheck");
    if (el) el.textContent = msg;
  } catch (e) {
    console.error("[pyret-cm6] SELF-CHECK FAILED:", e);
    const el = document.getElementById("selfcheck");
    if (el) el.textContent = "SELF-CHECK FAILED: " + (e && e.message);
  }
}
selfCheck();

// ---- CPO-style indentation commands -----------------------------------------
// Tab reindents the current line / selection to the grammar-correct level (and
// never inserts a literal tab); Shift-Tab dedents one unit.
const tabReindent = (view) => { indentSelection(view); return true; };
// Reindent the whole document, then put the cursor back at the top.
const reindentAll = (view) => {
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
  indentSelection(view);
  view.dispatch({ selection: { anchor: 0 } });
  view.focus();
  return true;
};
// Prec.highest so Tab beats the default (tab-moves-focus) binding.
const indentKeymap = Prec.highest(keymap.of([
  { key: "Tab", run: tabReindent, shift: indentLess },
  { key: "Mod-Alt-l", run: reindentAll },
]));

const view = new EditorView({
  state: EditorState.create({
    doc: sample,
    extensions: [
      basicSetup,        // includes indentOnInput() -> auto-reindent on `end`/`else`/`|` (see languageData)
      indentKeymap,
      foldGutter(),
      pyret(),
      pyretComments,
      pyretCommentTheme,
    ],
  }),
  parent: document.getElementById("editor"),
});

const reindentBtn = document.getElementById("reindent-all");
if (reindentBtn) reindentBtn.addEventListener("click", () => reindentAll(view));
