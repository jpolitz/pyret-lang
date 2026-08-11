// Shared parse state between the external tokenizer (tokens.js) and the language
// wiring (pyret-language.js). Single editor, single-threaded: pyret-language.js
// rebuilds PS.CUR (absolute char pos -> {e, term, value}) before each parse;
// the external tokenizer reads it.
export const PS = { CUR: new Map() };
