// Comment highlighting overlay.
//
// CAVEAT: Pyret's tokenizer SKIPS comments (they are in its `ignore` set), so
// comments never reach the Lezer tree and cannot be highlighted by the grammar.
// As a lightweight stand-in we decorate them with a regex overlay: nested-aware
// block comments `#| ... |#` and line comments `# ...`. This is approximate --
// a `#` inside a string literal can be mis-highlighted -- which is exactly why
// the real editor path will want a native tokenizer that surfaces comments.
import { Decoration, ViewPlugin, EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const commentMark = Decoration.mark({ class: "cm-pyret-comment" });

// Find comment ranges in `text`. Block comments `#| ... |#` nest; line comments
// run `#` to end of line. We skip over string literals so a `#` inside a string
// is not treated as a comment (a best-effort improvement over a naive regex).
function commentRanges(text) {
  const ranges = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    // string literals: ' " or ``` (triple). Skip their contents.
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < n && text[i] !== q) { if (text[i] === "\\") i++; i++; }
      i++;
      continue;
    }
    if (c === "`") { // possibly a ``` ... ``` string
      i++;
      while (i < n && text[i] !== "`") i++;
      i++;
      continue;
    }
    if (c === "#" && text[i + 1] === "|") {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (text[i] === "#" && text[i + 1] === "|") { depth++; i += 2; }
        else if (text[i] === "|" && text[i + 1] === "#") { depth--; i += 2; }
        else i++;
      }
      ranges.push([start, Math.min(i, n)]);
      continue;
    }
    if (c === "#") {
      const start = i;
      while (i < n && text[i] !== "\n" && text[i] !== "\r") i++;
      ranges.push([start, i]);
      continue;
    }
    i++;
  }
  return ranges;
}

function buildDeco(view) {
  const builder = new RangeSetBuilder();
  const text = view.state.doc.toString();
  for (const [from, to] of commentRanges(text)) {
    if (to > from) builder.add(from, to, commentMark);
  }
  return builder.finish();
}

export const pyretComments = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = buildDeco(view); }
    update(u) { if (u.docChanged) this.decorations = buildDeco(u.view); }
  },
  { decorations: (v) => v.decorations }
);

export const pyretCommentTheme = EditorView.theme({
  ".cm-pyret-comment": { color: "#9ca3af", fontStyle: "italic" },
});
