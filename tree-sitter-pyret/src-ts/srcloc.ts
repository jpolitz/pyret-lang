// Srcloc computation that reproduces Pyret's tokenizer/parser conventions exactly.
//
// Reference (lang/lib/jglr/jglr.js tokenizeFrom): curLine starts at 1, curCol at 0,
// pos (char offset) at 0. Columns and char-offsets are counted in UTF-16 code units
// (JS string indices), lines are 1-based.
//
// A Pyret srcloc is (source, start-line, start-col, start-char, end-line, end-col, end-char):
//   makePyretPos(file, p)        = srcloc(file, p.startRow, p.startCol, p.startChar,
//                                                p.endRow,  p.endCol,  p.endChar)
//   combinePyretPos(file, p1,p2) = srcloc(file, p1.start..., p2.end...)   (NOT min/max)
//
// tree-sitter gives us UTF-8 BYTE offsets for every node. We map those to Pyret's
// UTF-16-code-unit positions via a precomputed table over the source text, so we are
// independent of tree-sitter's (byte-based) row/column and correct for non-ASCII.

/** A position span in Pyret's coordinate system (what RNGLR's node.pos carries). */
export interface Pos {
  startRow: number;   // 1-based line
  startCol: number;   // 0-based column, UTF-16 code units
  startChar: number;  // 0-based absolute offset, UTF-16 code units
  endRow: number;
  endCol: number;
  endChar: number;
}

/** A fully-resolved Pyret srcloc value (the 7-tuple), ready to serialize/compare. */
export interface Srcloc {
  kind: "srcloc";
  source: string;
  startLine: number;
  startCol: number;
  startChar: number;
  endLine: number;
  endCol: number;
  endChar: number;
}

export interface BuiltinSrcloc {
  kind: "builtin";
  name: string;
}

export type Loc = Srcloc | BuiltinSrcloc;

/**
 * Maps UTF-8 byte offsets (from tree-sitter) to Pyret (row, col, char) coordinates.
 * Build once per source file.
 */
export class PositionMap {
  // For each UTF-8 byte offset that begins a code unit, we record charIndex/row/col.
  // We store sparse arrays indexed by byte offset of code-unit starts; intermediate
  // continuation bytes resolve to the start of their code unit.
  private byteToCharIdx: Int32Array;
  private charIdxToRow: Int32Array;
  private charIdxToCol: Int32Array;
  private numBytes: number;
  private numCodeUnits: number;
  readonly source: string;

  constructor(source: string) {
    this.source = source;
    const n = source.length; // UTF-16 code units
    // Compute UTF-8 byte length, handling surrogate pairs (1 codepoint = 4 bytes, 2 code units).
    let bytes = 0;
    for (let i = 0; i < n; i++) {
      const code = source.charCodeAt(i);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < n) {
        const lo = source.charCodeAt(i + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          bytes += 4; // surrogate pair → 4 UTF-8 bytes
          i += 1; // consumed both code units
          continue;
        }
        bytes += 3; // lone surrogate, encoded as 3 (matches JS TextEncoder replacement size)
      } else bytes += 3;
    }
    this.numBytes = bytes;
    this.numCodeUnits = n;
    this.byteToCharIdx = new Int32Array(bytes + 1);
    this.charIdxToRow = new Int32Array(n + 1);
    this.charIdxToCol = new Int32Array(n + 1);

    let byte = 0;
    let row = 1;
    let col = 0;
    for (let i = 0; i < n; i++) {
      this.charIdxToRow[i] = row;
      this.charIdxToCol[i] = col;
      const code = source.charCodeAt(i);
      let blen: number;
      let pair = false;
      if (code < 0x80) blen = 1;
      else if (code < 0x800) blen = 2;
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < n) {
        const lo = source.charCodeAt(i + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          blen = 4;
          pair = true;
        } else blen = 3;
      } else blen = 3;
      // All bytes of this codepoint map back to the first code unit's index.
      for (let b = 0; b < blen; b++) this.byteToCharIdx[byte + b] = i;
      byte += blen;
      if (code === 10 /* \n */) {
        row += 1;
        col = 0;
      } else {
        col += 1;
      }
      if (pair) {
        // second code unit of the pair: same row, col already advanced by 1; record it
        // and advance col once more so the pair counts as 2 code units total.
        this.charIdxToRow[i + 1] = row;
        this.charIdxToCol[i + 1] = col;
        col += 1;
        i += 1;
      }
    }
    // sentinel for EOF / end positions
    this.byteToCharIdx[byte] = n;
    this.charIdxToRow[n] = row;
    this.charIdxToCol[n] = col;
  }

  /** Total length of the source in UTF-16 code units (= Pyret's end-of-file char offset). */
  sourceLength(): number {
    return this.numCodeUnits;
  }

  /** Convert a UTF-16 code-unit index to (row, col). */
  charToRowCol(charIdx: number): { row: number; col: number } {
    if (charIdx < 0) charIdx = 0;
    if (charIdx > this.numCodeUnits) charIdx = this.numCodeUnits;
    return { row: this.charIdxToRow[charIdx], col: this.charIdxToCol[charIdx] };
  }

  /** Convert a tree-sitter UTF-8 byte offset to a UTF-16 code-unit index. */
  byteToChar(byteOffset: number): number {
    if (byteOffset < 0) byteOffset = 0;
    if (byteOffset > this.numBytes) byteOffset = this.numBytes;
    return this.byteToCharIdx[byteOffset];
  }

  /**
   * Build a Pos from tree-sitter start/end indices. node-tree-sitter reports indices in
   * UTF-16 code units (= JS string indices = Pyret's `char` offsets), so we use them
   * directly and only need to look up (row, col). (The byte table is retained for any
   * byte-based callers but is not used here.)
   */
  posFromBytes(startIdx: number, endIdx: number): Pos {
    const s = this.charToRowCol(startIdx);
    const e = this.charToRowCol(endIdx);
    return {
      startRow: s.row,
      startCol: s.col,
      startChar: startIdx,
      endRow: e.row,
      endCol: e.col,
      endChar: endIdx,
    };
  }
}

export function makePyretPos(source: string, p: Pos): Srcloc {
  return {
    kind: "srcloc",
    source,
    startLine: p.startRow,
    startCol: p.startCol,
    startChar: p.startChar,
    endLine: p.endRow,
    endCol: p.endCol,
    endChar: p.endChar,
  };
}

/** combinePyretPos: start of p1, end of p2. */
export function combinePyretPos(source: string, p1: Pos, p2: Pos): Srcloc {
  return {
    kind: "srcloc",
    source,
    startLine: p1.startRow,
    startCol: p1.startCol,
    startChar: p1.startChar,
    endLine: p2.endRow,
    endCol: p2.endCol,
    endChar: p2.endChar,
  };
}

export function builtinLoc(name: string): BuiltinSrcloc {
  return { kind: "builtin", name };
}

/** Canonical textual form of a loc for diffing. Must match the reference dumper. */
export function locToString(l: Loc): string {
  if (l.kind === "builtin") return `builtin(${JSON.stringify(l.name)})`;
  return `srcloc(${JSON.stringify(l.source)},${l.startLine},${l.startCol},${l.startChar},${l.endLine},${l.endCol},${l.endChar})`;
}
