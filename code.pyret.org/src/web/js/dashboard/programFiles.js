var CACHE_FILE_NAME = /^[a-z-]+:\/\//;

var PROGRAM_FILE_FIELDS = "id, name, modifiedTime, mimeType, fileExtension, trashed, parents, appProperties";

function isProgramFile(file, opts) {
  if (!file || file.trashed) { return false; }
  var ext = opts && opts.ext;
  if (file.mimeType !== "text/plain" && file.fileExtension !== ext) { return false; }
  if (file.name && CACHE_FILE_NAME.test(file.name)) { return false; }
  if (file.appProperties && file.appProperties.originalProgramFlag === "true") { return false; }
  var excluded = (opts && opts.excludedParentIds) || [];
  var parents = file.parents || [];
  for (var i = 0; i < parents.length; i++) {
    if (excluded.indexOf(parents[i]) !== -1) { return false; }
  }
  return true;
}

function buildProgramListQuery(ext, excludedParentIds, nameFilter) {
  var excludedTerms = ["(appProperties has {key='originalProgramFlag' and value='true'})"];
  (excludedParentIds || []).forEach(function(id) {
    excludedTerms.push("'" + id + "' in parents");
  });
  return 'not trashed and not (' + excludedTerms.join(' or ') + ')'
    + ' and (mimeType = "text/plain" or fileExtension = "' + ext + '")'
    + (nameFilter || "");
}

function mergeProgramFiles(existing, incoming) {
  var byId = {};
  (existing || []).forEach(function(f) { byId[f.id] = f; });
  (incoming || []).forEach(function(f) { byId[f.id] = f; });
  return Object.keys(byId).map(function(id) { return byId[id]; }).sort(function(a, b) {
    var ta = a.modifiedTime || "";
    var tb = b.modifiedTime || "";
    return ta < tb ? 1 : (ta > tb ? -1 : 0);
  });
}

function parseFileIds(text) {
  var seen = {};
  var out = [];
  var add = function(id) {
    if (id && !seen[id]) {
      seen[id] = true;
      out.push(id);
    }
  };
  var tokens = (text || "").split(/[\s,;]+/);
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    if (!tok) { continue; }
    if (/^https?:\/\//i.test(tok)) {
      var m = tok.match(/[#?&](?:program|id)=([A-Za-z0-9_-]+)/) || tok.match(/\/d\/([A-Za-z0-9_-]+)/);
      if (m) { add(m[1]); }
      continue;
    }
    var parts = tok.split(/[^A-Za-z0-9_-]+/);
    for (var j = 0; j < parts.length; j++) {
      add(parts[j]);
    }
  }
  return out;
}

function chunkArray(items, size) {
  var chunks = [];
  for (var i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

module.exports = {
  CACHE_FILE_NAME: CACHE_FILE_NAME,
  PROGRAM_FILE_FIELDS: PROGRAM_FILE_FIELDS,
  isProgramFile: isProgramFile,
  buildProgramListQuery: buildProgramListQuery,
  mergeProgramFiles: mergeProgramFiles,
  parseFileIds: parseFileIds,
  chunkArray: chunkArray,
};
