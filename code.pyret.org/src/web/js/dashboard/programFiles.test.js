const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isProgramFile,
  buildProgramListQuery,
  mergeProgramFiles,
  parseFileIds,
  chunkArray,
} = require("./programFiles.js");

const OPTS = {
  ext: "arr",
  excludedParentIds: ["shared-folder", "compiled-folder"],
};

test("isProgramFile: accepts .arr and extensionless text/plain files", () => {
  assert.equal(isProgramFile({ id: "1", name: "prog.arr", mimeType: "text/plain", fileExtension: "arr" }, OPTS), true);
  assert.equal(isProgramFile({ id: "2", name: "untitled", mimeType: "text/plain" }, OPTS), true);
  assert.equal(isProgramFile({ id: "3", name: "prog.arr", mimeType: "application/octet-stream", fileExtension: "arr" }, OPTS), true);
});

test("isProgramFile: rejects trashed, non-text/non-arr, cache names, shared copies, and excluded folders", () => {
  assert.equal(isProgramFile(null, OPTS), false);
  assert.equal(isProgramFile({ id: "1", name: "prog.arr", mimeType: "text/plain", trashed: true }, OPTS), false);
  assert.equal(isProgramFile({ id: "2", name: "pic.png", mimeType: "image/png", fileExtension: "png" }, OPTS), false);
  assert.equal(isProgramFile({ id: "3", name: "sheet", mimeType: "application/vnd.google-apps.spreadsheet" }, OPTS), false);
  assert.equal(isProgramFile({ id: "4", name: "shared-gdrive://foo.arr:abc", mimeType: "text/plain" }, OPTS), false);
  assert.equal(isProgramFile({ id: "5", name: "compiled-gdrive-js://foo.arr:abc", mimeType: "text/plain" }, OPTS), false);
  assert.equal(isProgramFile({
    id: "6",
    name: "published.arr",
    mimeType: "text/plain",
    appProperties: { originalProgramFlag: "true" },
  }, OPTS), false);
  assert.equal(isProgramFile({
    id: "7",
    name: "in-shared.arr",
    mimeType: "text/plain",
    parents: ["shared-folder"],
  }, OPTS), false);
  assert.equal(isProgramFile({
    id: "8",
    name: "in-compiled.arr",
    mimeType: "text/plain",
    parents: ["compiled-folder"],
  }, OPTS), false);
});

test("buildProgramListQuery: excludes originalProgramFlag and all excluded folder IDs with valid spacing", () => {
  const q = buildProgramListQuery("arr", ["shared-1", "compiled-1"], "");
  assert.ok(q.includes("not trashed"));
  assert.ok(q.includes("originalProgramFlag"));
  assert.ok(q.includes(" or 'shared-1' in parents"));
  assert.ok(q.includes(" or 'compiled-1' in parents"));
  assert.ok(q.includes('(mimeType = "text/plain" or fileExtension = "arr")'));
  assert.ok(!q.includes(")or "));
});

test("mergeProgramFiles: merges, deduplicates preferring incoming, and sorts newest first", () => {
  const existing = [
    { id: "a", name: "old-a.arr", modifiedTime: "2026-01-01T00:00:00Z" },
    { id: "b", name: "b.arr", modifiedTime: "2026-03-01T00:00:00Z" },
  ];
  const incoming = [
    { id: "a", name: "new-a.arr", modifiedTime: "2026-04-01T00:00:00Z" },
    { id: "c", name: "c.arr", modifiedTime: "2026-02-01T00:00:00Z" },
  ];
  const merged = mergeProgramFiles(existing, incoming);
  assert.deepEqual(merged.map((f) => [f.id, f.name]), [
    ["a", "new-a.arr"],
    ["b", "b.arr"],
    ["c", "c.arr"],
  ]);
  // inputs not mutated
  assert.equal(existing.length, 2);
  assert.equal(incoming.length, 2);
});

test("parseFileIds: splits, deduplicates preserving order, and extracts IDs from URLs", () => {
  assert.deepEqual(parseFileIds(""), []);
  assert.deepEqual(parseFileIds("   , ; \n "), []);
  assert.deepEqual(parseFileIds("id1, id2, id1\nid3;id2"), ["id1", "id2", "id3"]);
  assert.deepEqual(
    parseFileIds(
      "https://code.pyret.org/editor#program=1AbC_def-99\n" +
      "https://drive.google.com/file/d/2XyZ_000/view?usp=sharing\n" +
      "https://example.com/not-a-drive-url\n" +
      "1AbC_def-99, plainId_42"
    ),
    ["1AbC_def-99", "2XyZ_000", "plainId_42"]
  );
});

test("chunkArray: chunks cleanly", () => {
  assert.deepEqual(chunkArray([], 50), []);
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
