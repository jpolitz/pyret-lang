// External scanner for tree-sitter-pyret: a port of lang/src/js/base/pyret-tokenizer.js
// (and the jglr Tokenizer matching loop). All Pyret terminals are emitted here.
//
// Tokenizer matching semantics replicated:
//  - candidates keyed by first char, tried longest-first, then needsWs-first;
//  - needsWs  => requires whitespace immediately before the token (priorWhitespace);
//  - mustFollow(set) => char AFTER the token must be in set (operators: ws/#/EOF);
//  - noFollow(set)   => char AFTER the token must NOT be in set;
//  - keywords carry noFollow = keywordsNoFollow (alnum/-/_).
//  - '(' becomes PARENSPACE (prior ws), PARENAFTERBRACE (after '{'), or
//    PARENNOSPACE (after an expression-ending token), via parenIsForExp state.

#include "tree_sitter/parser.h"
#include <string.h>
#include <stdbool.h>

// TokenType order MUST match the `externals` array in grammar.js exactly.
enum TokenType {
  PARENSPACE, PARENNOSPACE, PARENAFTERBRACE,
  NAME, NUMBER, RATIONAL, ROUGHRATIONAL, STRING,
  RPAREN, LBRACK, RBRACK, LBRACE, RBRACE,
  SEMI, BACKSLASH, DOTDOTDOT, DOT, BANG, PERCENT,
  COMMA, THINARROW, THICKARROW, COLONEQUALS, COLONCOLON, COLON,
  BAR, EQUALS,
  LANGLE, RANGLE, STAR,
  OP_CARET, OP_PLUS, OP_DASH, OP_TIMES, OP_SLASH, OP_SPACESHIP,
  OP_LEQ, OP_GEQ, OP_EQUALEQUAL, OP_EQUALTILDE, OP_NEQ,
  OP_LT, OP_GT,
  AND_KW, AS_KW, ASCENDING_KW, ASK_KW, BY_KW, CASES_KW, CHECK_KW,
  DATA_KW, DESCENDING_KW, DO_KW, RAISESNOT_KW, ELSE_KW, ELSEIF_KW,
  END_KW, EXAMPLES_KW, TABLE_EXTEND_KW, TABLE_EXTRACT_KW, FALSE_KW,
  FOR_KW, FROM_KW, FUN_KW, HIDING_KW, IF_KW, IMPORT_KW, INCLUDE_KW,
  IS_KW, ISEQUALEQUAL_KW, ISEQUALTILDE_KW, ISNOT_KW, ISNOTEQUALEQUAL_KW,
  ISNOTEQUALTILDE_KW, ISNOTSPACESHIP_KW, ISROUGHLY_KW, ISNOTROUGHLY_KW,
  ISSPACESHIP_KW, BECAUSE_KW, LAM_KW, LAZY_KW, LET_KW, LETREC_KW,
  LOADTABLE_KW, METHOD_KW, MODULE_KW, NEWTYPE_KW, OF_KW, OR_KW,
  PROVIDE_KW, PROVIDETYPES_KW, RAISES_KW, RAISESOTHER_KW,
  RAISESSATISFIES_KW, RAISESVIOLATES_KW, REACTOR_KW, REC_KW, REF_KW,
  SANITIZE_KW, SATISFIES_KW, TABLE_SELECT_KW, SHADOW_KW, TABLE_FILTER_KW,
  SPY_KW, TABLE_ORDER_KW, TABLE_UPDATE_KW, TRUE_KW, TYPE_KW, TYPELET_KW,
  USING_KW, USE_KW, VAR_KW, SATISFIESNOT_KW, WHEN_KW,
  BLOCK_KW, CHECKCOLON, DOC_KW, ELSECOLON, EXAMPLESCOLON,
  OTHERWISECOLON, PROVIDECOLON, ROW_KW, SHARING_KW, SOURCECOLON,
  TABLE_KW, THENCOLON, WHERE_KW, WITH_KW,
  UNTERMINATED_STRING, UNTERMINATED_BLOCK_COMMENT, BAD_OPER, BAD_NUMBER,
  UNKNOWN,
  // '[' immediately following an expression-ending token with no preceding
  // whitespace => bracket access (a[i]); any other '[' is LBRACK (list/construct).
  // Mirrors the PARENNOSPACE decision. Must be LAST (matches grammar.js externals tail).
  LBRACK_ACCESS,
};

typedef struct {
  // parenIsForExp category for the most recently emitted token:
  //   0 = false (PARENNOSPACE), 1 = PARENSPACE, 2 = PARENAFTERBRACE
  unsigned char paren_state;
  bool prior_ws; // whitespace/comment immediately preceded the next token
} ScannerState;

// ---------- character classes ----------

static bool is_ws(int32_t c) {
  switch (c) {
    case ' ': case '\f': case '\n': case '\r': case '\t': case '\v':
    case 0x00a0: case 0x1680:
    case 0x2000: case 0x2001: case 0x2002: case 0x2003: case 0x2004:
    case 0x2005: case 0x2006: case 0x2007: case 0x2008: case 0x2009:
    case 0x200a: case 0x2028: case 0x2029: case 0x202f: case 0x205f:
    case 0x3000: case 0xfeff:
      return true;
    default:
      return false;
  }
}

static bool is_digit(int32_t c) { return c >= '0' && c <= '9'; }
static bool is_alpha(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}
static bool is_ident_start(int32_t c) { return c == '_' || is_alpha(c); }
static bool is_ident_char(int32_t c) { return c == '_' || is_alpha(c) || is_digit(c); }
// keywordsNoFollow: alnum, '-', '_'
static bool is_kw_nofollow(int32_t c) { return is_ident_char(c) || c == '-'; }
// wsMustFollow: whitespace, '#', or EOF(0)
static bool is_ws_must_follow(int32_t c) { return c == 0 || c == '#' || is_ws(c); }

#define ADV(skip) lexer->advance(lexer, skip)
#define LA (lexer->lookahead)
#define EOFp (lexer->eof(lexer))

// ---------- whitespace + comment skipping ----------
// Returns true if any whitespace/comment was skipped. Handles nested block
// comments (#| ... |#) and line comments (# ...). If an unterminated block
// comment is hit, *unterminated is set true and we stop at EOF.
static bool skip_ws(TSLexer *lexer, bool *unterminated) {
  bool skipped = false;
  *unterminated = false;
  for (;;) {
    int32_t c = LA;
    if (is_ws(c)) {
      ADV(true);
      skipped = true;
    } else if (c == '#') {
      // could be block comment (#|) or line comment (#)
      ADV(true);            // consume '#'
      skipped = true;
      if (LA == '|') {
        ADV(true);          // consume '|'
        int depth = 1;
        while (depth > 0 && !EOFp) {
          if (LA == '#') {
            ADV(true);
            if (LA == '|') { ADV(true); depth++; }
          } else if (LA == '|') {
            ADV(true);
            if (LA == '#') { ADV(true); depth--; }
          } else {
            ADV(true);
          }
        }
        if (depth > 0) { *unterminated = true; return true; }
      } else {
        // line comment: to end of line (not consuming the newline)
        while (!EOFp && LA != '\n' && LA != '\r') ADV(true);
      }
    } else {
      break;
    }
  }
  return skipped;
}

// ---------- serialization ----------

void *tree_sitter_pyret_external_scanner_create(void) {
  ScannerState *s = malloc(sizeof(ScannerState));
  s->paren_state = 1; // tokenizer inits parenIsForExp = "PARENSPACE"
  s->prior_ws = true; // tokenizer inits priorWhitespace = true
  return s;
}

void tree_sitter_pyret_external_scanner_destroy(void *payload) { free(payload); }

unsigned tree_sitter_pyret_external_scanner_serialize(void *payload, char *buffer) {
  ScannerState *s = (ScannerState *)payload;
  buffer[0] = (char)s->paren_state;
  buffer[1] = (char)(s->prior_ws ? 1 : 0);
  return 2;
}

void tree_sitter_pyret_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  ScannerState *s = (ScannerState *)payload;
  if (length >= 2) {
    s->paren_state = (unsigned char)buffer[0];
    s->prior_ws = buffer[1] != 0;
  } else {
    s->paren_state = 1;
    s->prior_ws = true;
  }
}

// ---------- paren state bookkeeping ----------
// parenIsForExp value to set AFTER emitting a token of type `sym`.
static unsigned char paren_after(enum TokenType sym) {
  switch (sym) {
    case LBRACE: return 2; // PARENAFTERBRACE
    // tokens with parenIsForExp: true  -> PARENSPACE (1)
    case PARENSPACE: case PARENNOSPACE: case PARENAFTERBRACE:
    case LBRACK: case COMMA: case COLONEQUALS: case COLONCOLON: case COLON:
    case BAR: case EQUALS: case STAR: case THICKARROW:
    case OP_CARET: case OP_PLUS: case OP_DASH: case OP_TIMES: case OP_SLASH:
    case OP_SPACESHIP: case OP_LEQ: case OP_GEQ: case OP_EQUALEQUAL:
    case OP_EQUALTILDE: case OP_NEQ: case OP_LT: case OP_GT:
    case AND_KW: case ASK_KW: case EXAMPLES_KW: case IS_KW: case ISEQUALEQUAL_KW:
    case ISEQUALTILDE_KW: case ISNOT_KW: case ISNOTEQUALEQUAL_KW:
    case ISNOTEQUALTILDE_KW: case ISNOTSPACESHIP_KW: case ISROUGHLY_KW:
    case ISNOTROUGHLY_KW: case ISSPACESHIP_KW: case BECAUSE_KW: case OR_KW:
    case RAISES_KW: case RAISESOTHER_KW: case RAISESSATISFIES_KW:
    case RAISESVIOLATES_KW: case SATISFIES_KW: case SATISFIESNOT_KW:
    case WHEN_KW: case RAISESNOT_KW:
    case BLOCK_KW: case CHECKCOLON: case DOC_KW: case ELSECOLON:
    case EXAMPLESCOLON: case OTHERWISECOLON: case PROVIDECOLON:
    case SHARING_KW: case THENCOLON: case WHERE_KW: case WITH_KW:
      return 1;
    default:
      return 0; // PARENNOSPACE-inducing (NAME/NUMBER/STRING/RPAREN/...)
  }
}

static bool emit(TSLexer *lexer, ScannerState *s, enum TokenType sym) {
  lexer->mark_end(lexer);
  lexer->result_symbol = sym;
  s->paren_state = paren_after(sym);
  s->prior_ws = false;
  return true;
}

// ---------- number lexing ----------
// Assumes leading '~' and/or sign may have been consumed already (flags).
// On success emits NUMBER/RATIONAL/ROUGHRATIONAL. On failure returns false
// (caller falls back). Uses incremental mark_end to exclude trailing '.'/'e'.
static bool lex_number(TSLexer *lexer, ScannerState *s, bool rough, bool sign_done) {
  if (!sign_done && (LA == '-' || LA == '+')) ADV(false);
  if (LA == '.') return false; // BAD-NUMBER (leading dot)
  if (!is_digit(LA)) return false;
  while (is_digit(LA)) ADV(false);
  if (LA == '/') {
    ADV(false);
    if (!is_digit(LA)) return false;
    while (is_digit(LA)) ADV(false);
    return emit(lexer, s, rough ? ROUGHRATIONAL : RATIONAL);
  }
  lexer->mark_end(lexer); // integer portion complete; trailing '.'/'e' optional
  if (LA == '.') {
    ADV(false);
    if (is_digit(LA)) {
      while (is_digit(LA)) ADV(false);
      lexer->mark_end(lexer);
    } else {
      // back up: '.' not part of number
      lexer->result_symbol = NUMBER;
      s->paren_state = 0; s->prior_ws = false;
      return true;
    }
  }
  if (LA == 'e' || LA == 'E') {
    // need to look past optional sign + digits; consume tentatively
    ADV(false);
    if (LA == '+' || LA == '-') ADV(false);
    if (is_digit(LA)) {
      while (is_digit(LA)) ADV(false);
      lexer->mark_end(lexer);
    }
    // if no digits, the already-marked end (before 'e') stands
  }
  lexer->result_symbol = NUMBER;
  s->paren_state = 0; s->prior_ws = false;
  return true;
}

// ---------- string lexing ----------
static bool lex_string(TSLexer *lexer, ScannerState *s, int32_t quote) {
  // assumes opening quote not yet consumed
  if (quote == '`') {
    // triple backtick
    ADV(false); ADV(false); ADV(false); // ```  (caller guaranteed 3)
    for (;;) {
      if (EOFp) return emit(lexer, s, UNTERMINATED_STRING);
      if (LA == '\\') { ADV(false); if (!EOFp) ADV(false); continue; }
      if (LA == '`') {
        ADV(false);
        if (LA == '`') {
          ADV(false);
          if (LA == '`') { ADV(false); return emit(lexer, s, STRING); }
        }
        continue;
      }
      ADV(false);
    }
  }
  ADV(false); // opening " or '
  for (;;) {
    if (EOFp || LA == '\n' || LA == '\r') return emit(lexer, s, UNTERMINATED_STRING);
    if (LA == '\\') { ADV(false); if (!EOFp) ADV(false); continue; }
    if (LA == quote) { ADV(false); return emit(lexer, s, STRING); }
    ADV(false);
  }
}

// match a fixed keyword/symbol literal `lit` against the upcoming input,
// advancing through it. Returns true if matched fully (lexer advanced len chars).
// NOTE: only call when you've confirmed the first char; advances as it checks.

// ---------- identifier / keyword lexing ----------
// Reads a maximal identifier run (already known to start with ident-start).
// Fills buf (NUL-terminated, capped). Returns length.
static int read_ident(TSLexer *lexer, char *buf, int cap) {
  int n = 0;
  // first char
  if (n < cap - 1) buf[n] = (char)LA; n++; ADV(false);
  for (;;) {
    if (is_ident_char(LA)) {
      if (n < cap - 1) buf[n] = (char)LA; n++; ADV(false);
    } else if (LA == '-') {
      // hyphen allowed only if (after run of '-') an ident char follows.
      // We cannot peek 2 ahead without consuming; consume '-'(s) tentatively,
      // marking end before them so they are excluded if not followed by ident.
      lexer->mark_end(lexer);
      // consume one or more '-'
      int dashes = 0;
      while (LA == '-') { if (n < cap - 1) buf[n] = '-'; n++; ADV(false); dashes++; }
      if (is_ident_char(LA)) {
        // keep dashes; continue
        continue;
      } else {
        // exclude the dashes: end was marked before them
        n -= dashes;
        if (n < cap) buf[n] = 0;
        return -n - 1000; // sentinel: marked end already set; n is real length
      }
    } else {
      break;
    }
  }
  lexer->mark_end(lexer);
  if (n < cap) buf[n] = 0; else buf[cap-1] = 0;
  return n;
}

static enum TokenType keyword_lookup(const char *b) {
  // pure identifier-run keywords (and hyphenated ones)
  struct { const char *s; enum TokenType t; } kw[] = {
    {"and", AND_KW}, {"as", AS_KW}, {"ascending", ASCENDING_KW}, {"ask", ASK_KW},
    {"by", BY_KW}, {"cases", CASES_KW}, {"check", CHECK_KW}, {"data", DATA_KW},
    {"descending", DESCENDING_KW}, {"do", DO_KW}, {"does-not-raise", RAISESNOT_KW},
    {"else", ELSE_KW}, {"end", END_KW}, {"examples", EXAMPLES_KW},
    {"extend", TABLE_EXTEND_KW}, {"extract", TABLE_EXTRACT_KW}, {"false", FALSE_KW},
    {"for", FOR_KW}, {"from", FROM_KW}, {"fun", FUN_KW}, {"hiding", HIDING_KW},
    {"if", IF_KW}, {"import", IMPORT_KW}, {"include", INCLUDE_KW}, {"is", IS_KW},
    {"is-not", ISNOT_KW}, {"is-roughly", ISROUGHLY_KW}, {"is-not-roughly", ISNOTROUGHLY_KW},
    {"because", BECAUSE_KW}, {"lam", LAM_KW}, {"lazy", LAZY_KW}, {"let", LET_KW},
    {"letrec", LETREC_KW}, {"load-table", LOADTABLE_KW}, {"method", METHOD_KW},
    {"module", MODULE_KW}, {"newtype", NEWTYPE_KW}, {"of", OF_KW}, {"or", OR_KW},
    {"provide", PROVIDE_KW}, {"provide-types", PROVIDETYPES_KW}, {"raises", RAISES_KW},
    {"raises-other-than", RAISESOTHER_KW}, {"raises-satisfies", RAISESSATISFIES_KW},
    {"raises-violates", RAISESVIOLATES_KW}, {"reactor", REACTOR_KW}, {"rec", REC_KW},
    {"ref", REF_KW}, {"sanitize", SANITIZE_KW}, {"satisfies", SATISFIES_KW},
    {"select", TABLE_SELECT_KW}, {"shadow", SHADOW_KW}, {"sieve", TABLE_FILTER_KW},
    {"spy", SPY_KW}, {"order", TABLE_ORDER_KW}, {"transform", TABLE_UPDATE_KW},
    {"true", TRUE_KW}, {"type", TYPE_KW}, {"type-let", TYPELET_KW}, {"using", USING_KW},
    {"use", USE_KW}, {"var", VAR_KW}, {"violates", SATISFIESNOT_KW}, {"when", WHEN_KW},
  };
  for (unsigned i = 0; i < sizeof(kw)/sizeof(kw[0]); i++) {
    if (strcmp(b, kw[i].s) == 0) return kw[i].t;
  }
  return UNKNOWN; // sentinel meaning "not a keyword"
}

static enum TokenType coloncolon_word(const char *b) {
  // words that become a colon-keyword when immediately followed by ':'
  if (!strcmp(b, "block")) return BLOCK_KW;
  if (!strcmp(b, "check")) return CHECKCOLON;
  if (!strcmp(b, "doc")) return DOC_KW;
  if (!strcmp(b, "else")) return ELSECOLON;
  if (!strcmp(b, "examples")) return EXAMPLESCOLON;
  if (!strcmp(b, "otherwise")) return OTHERWISECOLON;
  if (!strcmp(b, "provide")) return PROVIDECOLON;
  if (!strcmp(b, "row")) return ROW_KW;
  if (!strcmp(b, "sharing")) return SHARING_KW;
  if (!strcmp(b, "source")) return SOURCECOLON;
  if (!strcmp(b, "table")) return TABLE_KW;
  if (!strcmp(b, "then")) return THENCOLON;
  if (!strcmp(b, "where")) return WHERE_KW;
  if (!strcmp(b, "with")) return WITH_KW;
  return UNKNOWN;
}

bool tree_sitter_pyret_external_scanner_scan(void *payload, TSLexer *lexer,
                                             const bool *valid_symbols) {
  ScannerState *s = (ScannerState *)payload;

  bool unterminated = false;
  if (skip_ws(lexer, &unterminated)) s->prior_ws = true;
  if (unterminated) { return emit(lexer, s, UNTERMINATED_BLOCK_COMMENT); }

  if (EOFp) return false;

  int32_t c = LA;
  bool pw = s->prior_ws;

  // ----- identifiers & keywords -----
  if (is_ident_start(c)) {
    char buf[64];
    int r = read_ident(lexer, buf, sizeof(buf));
    bool marked_short = false;
    if (r <= -1000) { marked_short = true; r = -(r + 1000); buf[r] = 0; }
    // operator-keyword extensions on "is"/"is-not": is==, is=~, is<=>, ...
    if (!marked_short && (strcmp(buf, "is") == 0 || strcmp(buf, "is-not") == 0)) {
      bool isnot = (buf[2] == '-');
      if (LA == '=') {
        ADV(false);
        if (LA == '=') { ADV(false); return emit(lexer, s, isnot ? ISNOTEQUALEQUAL_KW : ISEQUALEQUAL_KW); }
        if (LA == '~') { ADV(false); return emit(lexer, s, isnot ? ISNOTEQUALTILDE_KW : ISEQUALTILDE_KW); }
        // lone '=' after is/is-not: fall through to plain keyword (end already marked)
      } else if (LA == '<') {
        ADV(false);
        if (LA == '=') { ADV(false); if (LA == '>') { ADV(false); return emit(lexer, s, isnot ? ISNOTSPACESHIP_KW : ISSPACESHIP_KW); } }
        // otherwise fall through to plain keyword
      }
      // plain IS / ISNOT (mark_end was set at end of ident by read_ident)
      lexer->mark_end(lexer); // re-mark not needed for the simple case below
      return emit(lexer, s, isnot ? ISNOT_KW : IS_KW);
    }
    // "else if" (single token with a space)
    if (!marked_short && strcmp(buf, "else") == 0 && LA == ' ') {
      ADV(false);
      if (LA == 'i') {
        ADV(false);
        if (LA == 'f') {
          ADV(false);
          if (!is_kw_nofollow(LA)) return emit(lexer, s, ELSEIF_KW);
        }
      }
      // not "else if": end already marked at "else"; emit ELSECOLON?/ELSE
      // (we consumed past "else"; mark_end is still at "else")
    }
    // colon-keyword: word immediately followed by ':'
    if (LA == ':') {
      enum TokenType ck = coloncolon_word(buf);
      if (ck != UNKNOWN) { ADV(false); return emit(lexer, s, ck); }
    }
    enum TokenType kw = keyword_lookup(buf);
    if (kw != UNKNOWN) return emit(lexer, s, kw);
    return emit(lexer, s, NAME);
  }

  // ----- numbers (~, digits) -----
  if (c == '~') {
    ADV(false);
    if (lex_number(lexer, s, true, false)) return true;
    // ~ not a number: fall through to unknown
    return emit(lexer, s, BAD_NUMBER);
  }
  if (is_digit(c)) {
    if (lex_number(lexer, s, false, true)) return true; // sign_done=true (no sign)
    return emit(lexer, s, BAD_NUMBER);
  }

  // ----- strings -----
  if (c == '"' || c == '\'') return lex_string(lexer, s, c);
  if (c == '`') {
    ADV(false);
    if (LA == '`') { ADV(false); if (LA == '`') {
      // we've consumed ```; lex rest like triple string but without re-consuming
      for (;;) {
        if (EOFp) return emit(lexer, s, UNTERMINATED_STRING);
        if (LA == '\\') { ADV(false); if (!EOFp) ADV(false); continue; }
        if (LA == '`') { ADV(false); if (LA == '`') { ADV(false); if (LA == '`') { ADV(false); return emit(lexer, s, STRING); } } continue; }
        ADV(false);
      }
    } }
    return emit(lexer, s, UNKNOWN);
  }

  // ----- '(' with paren-space logic -----
  if (c == '(') {
    ADV(false);
    enum TokenType t;
    if (pw) t = PARENSPACE;
    else if (s->paren_state == 2) t = PARENAFTERBRACE;
    else if (s->paren_state == 1) t = PARENSPACE;
    else t = PARENNOSPACE;
    return emit(lexer, s, t);
  }

  // ----- single-char and multi-char symbols -----
  switch (c) {
    case ')': ADV(false); return emit(lexer, s, RPAREN);
    case '[': ADV(false); return emit(lexer, s, (!pw && s->paren_state == 0) ? LBRACK_ACCESS : LBRACK);
    case ']': ADV(false); return emit(lexer, s, RBRACK);
    case '{': ADV(false); return emit(lexer, s, LBRACE);
    case '}': ADV(false); return emit(lexer, s, RBRACE);
    case ';': ADV(false); return emit(lexer, s, SEMI);
    case '\\': ADV(false); return emit(lexer, s, BACKSLASH);
    case ',': ADV(false); return emit(lexer, s, COMMA);
    case '!': ADV(false); return emit(lexer, s, BANG);
    case '%': ADV(false); return emit(lexer, s, PERCENT);
    case '|': ADV(false); return emit(lexer, s, BAR);
    case '.':
      ADV(false);
      if (LA == '.') { ADV(false); if (LA == '.') { ADV(false); return emit(lexer, s, DOTDOTDOT); } }
      // DOT: noFollow digits
      if (!is_digit(LA)) { lexer->mark_end(lexer); return emit(lexer, s, DOT); }
      return emit(lexer, s, UNKNOWN);
    case ':':
      ADV(false);
      if (LA == ':') { ADV(false); return emit(lexer, s, COLONCOLON); }
      if (LA == '=') { ADV(false); return emit(lexer, s, COLONEQUALS); }
      return emit(lexer, s, COLON);
    case '=':
      ADV(false);
      if (LA == '=') { if (pw) { ADV(false); if (is_ws_must_follow(LA)) return emit(lexer, s, OP_EQUALEQUAL); } }
      else if (LA == '~') { if (pw) { ADV(false); if (is_ws_must_follow(LA)) return emit(lexer, s, OP_EQUALTILDE); } }
      else if (LA == '>') { ADV(false); return emit(lexer, s, THICKARROW); } // THICKARROW: mustFollow ws? spec has mustFollow only, but no needsWs
      // plain '=' : noFollow '~'
      if (LA != '~') { lexer->mark_end(lexer); return emit(lexer, s, EQUALS); }
      return emit(lexer, s, BAD_OPER);
    case '-':
      ADV(false);
      if (LA == '>') { ADV(false); return emit(lexer, s, THINARROW); }
      if (pw && is_ws_must_follow(LA)) { lexer->mark_end(lexer); return emit(lexer, s, OP_DASH); }
      // NUMBER with sign already consumed
      if (lex_number(lexer, s, false, true)) return true;
      lexer->mark_end(lexer); return emit(lexer, s, BAD_OPER);
    case '+':
      ADV(false);
      if (pw && is_ws_must_follow(LA)) { lexer->mark_end(lexer); return emit(lexer, s, OP_PLUS); }
      if (lex_number(lexer, s, false, true)) return true;
      lexer->mark_end(lexer); return emit(lexer, s, BAD_OPER);
    case '*':
      ADV(false);
      // STAR: needsWs, noFollow ws  (next NOT ws)
      if (pw && !is_ws(LA) && LA != 0) { lexer->mark_end(lexer); return emit(lexer, s, STAR); }
      // TIMES: needsWs, mustFollow ws
      if (pw && is_ws_must_follow(LA)) { lexer->mark_end(lexer); return emit(lexer, s, OP_TIMES); }
      lexer->mark_end(lexer); return emit(lexer, s, BAD_OPER);
    case '/':
      ADV(false);
      if (pw && is_ws_must_follow(LA)) { lexer->mark_end(lexer); return emit(lexer, s, OP_SLASH); }
      return emit(lexer, s, BAD_OPER);
    case '^':
      ADV(false);
      if (pw && is_ws_must_follow(LA)) { lexer->mark_end(lexer); return emit(lexer, s, OP_CARET); }
      return emit(lexer, s, BAD_OPER);
    case '<':
      ADV(false);
      if (LA == '=') { ADV(false); if (LA == '>') { ADV(false); if (pw && is_ws_must_follow(LA)) return emit(lexer, s, OP_SPACESHIP); }
                       else { if (pw && is_ws_must_follow(LA)) { lexer->mark_end(lexer); return emit(lexer, s, OP_LEQ); } } }
      else if (LA == '>') { ADV(false); if (pw && is_ws_must_follow(LA)) return emit(lexer, s, OP_NEQ); }
      // LT: needsWs + mustFollow (tried before LANGLE)
      if (pw && is_ws_must_follow(LA)) { lexer->mark_end(lexer); return emit(lexer, s, OP_LT); }
      // LANGLE: noFollow {>,=}
      if (LA != '>' && LA != '=') { lexer->mark_end(lexer); return emit(lexer, s, LANGLE); }
      lexer->mark_end(lexer); return emit(lexer, s, BAD_OPER);
    case '>':
      ADV(false);
      if (LA == '=') { ADV(false); if (pw && is_ws_must_follow(LA)) return emit(lexer, s, OP_GEQ); }
      // GT: needsWs + mustFollow (before RANGLE)
      if (pw && is_ws_must_follow(LA)) { lexer->mark_end(lexer); return emit(lexer, s, OP_GT); }
      // RANGLE: noFollow {=}
      if (LA != '=') { lexer->mark_end(lexer); return emit(lexer, s, RANGLE); }
      lexer->mark_end(lexer); return emit(lexer, s, BAD_OPER);
  }

  // FAILOVER: UNKNOWN single char
  ADV(false);
  return emit(lexer, s, UNKNOWN);
}
