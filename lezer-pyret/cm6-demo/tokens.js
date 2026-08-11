// The external tokenizer the pre-built parser imports (`from "./tokens"` in the
// grammar). It replays the Pyret token stream tiled into PS.CUR — same logic as
// the runtime-buildParser version, but as a standalone module so the parser table
// can be generated ahead of time (no @lezer/generator in the browser bundle).
import { ExternalTokenizer } from "@lezer/lr";
import { PS } from "./parse-state.js";

export const pyretTokens = new ExternalTokenizer((input) => {
  const tok = PS.CUR.get(input.pos);
  if (!tok || tok.term == null) return; // no token here -> recovery/error node
  input.acceptTokenTo(tok.term, tok.e);
});
