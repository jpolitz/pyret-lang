/*
 * pins.js -- what this suite is pinned to.
 *
 * Two Bootstrap repositories decide what a student sees:
 *
 *   bootstrapworld/curriculum     -- the lessons. Its `starterFiles/*.json` and
 *                                    the dataset table are where the "Starter
 *                                    File" links live, so it is the authority
 *                                    on which .arr files are STUDENT ENTRY
 *                                    POINTS (as opposed to libraries that only
 *                                    get imported).
 *   bootstrapworld/starter-files  -- the .arr files those links point at.
 *
 * The curriculum links look like
 *
 *   https://pyret.bootstrapworld.org/editor#shareurl=
 *     https://raw.githubusercontent.com/bootstrapworld/starter-files/fall2026/core/Rocket%20Height.arr
 *
 * i.e. they reference starter-files by the `fall2026` TAG, and so do the
 * starter files' own `use context url-file(...)` / `include url-file(...)`
 * headers. That second fact is the reason this suite fetches entry points at
 * the tag rather than at a commit sha: a file's imports resolve at `fall2026`
 * no matter how we fetched the file itself, so sha-pinning the entry point
 * would only pin the thin outer layer while the ~10k lines of library it pulls
 * in still floated. Pinning the tag and *checking* it is the honest version.
 *
 * STARTER_FILES_COMMIT records what `fall2026` pointed at when the
 * expectations in expectations.js were recorded. tests/starter-files.test.js
 * has a "pin" test that reports when the tag has moved off it; see README.md
 * for how to re-pin and re-baseline.
 *
 * Overrides (both are for local investigation, not CI):
 *   CURRICULUM_STARTER_REF=<ref>  fetch entry points at another ref/sha
 *   CURRICULUM_REF=<sha>          read the curriculum from another commit
 */

// bootstrapworld/starter-files, tag fall2026 as of 2026-07-30.
const STARTER_FILES_COMMIT = "80df26a2f60a67abd506481b2f8ad38b0b74a847";
const STARTER_FILES_REF = process.env.CURRICULUM_STARTER_REF || "fall2026";

// bootstrapworld/curriculum @ main as of 2026-07-30. Only used to derive the
// entry point list, so a sha is exactly right here: it makes "which files are
// student entry points" reproducible.
const CURRICULUM_COMMIT = process.env.CURRICULUM_REF || "27bb2e5b94c700fd8ad7e8b3b1dac111d3ee37f7";

// The curriculum files that carry "Starter File" links. Checked in rather than
// discovered, so building the manifest needs no GitHub API call (and no API
// rate limit) -- tests/starter-files.test.js separately cross-checks the
// resulting list against the starter-files tree.
const CURRICULUM_SOURCES = [
  "shared/langs/en-us/starterFiles/ai-desmos.json",
  "shared/langs/en-us/starterFiles/ai.json",
  "shared/langs/en-us/starterFiles/alg2-desmos.json",
  "shared/langs/en-us/starterFiles/alg2.json",
  "shared/langs/en-us/starterFiles/algebra-desmos.json",
  "shared/langs/en-us/starterFiles/algebra.json",
  "shared/langs/en-us/starterFiles/core.json",
  "shared/langs/en-us/starterFiles/data-science-desmos.json",
  "shared/langs/en-us/starterFiles/data-science.json",
  "shared/langs/en-us/starterFiles/editors.json",
  "shared/langs/en-us/starterFiles/expressions+equations.json",
  "shared/langs/en-us/starterFiles/flags.json",
  "shared/langs/en-us/starterFiles/gamebasics.json",
  "shared/langs/en-us/starterFiles/live-survey.json",
  "shared/langs/en-us/starterFiles/piecewise.json",
  "shared/langs/en-us/starterFiles/projects.json",
  "shared/langs/en-us/starterFiles/reactive.json",
  // The Data Science "choose your dataset" table -- the dataset-library entry
  // points are linked from here (as #shareurl= links) and nowhere else.
  "lessons/Data-Science/choosing-your-dataset/langs/en-us/fragments/dataset-table.adoc",
];

const RAW = "https://raw.githubusercontent.com";

function starterFileUrl(repoPath, ref) {
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  return `${RAW}/bootstrapworld/starter-files/${ref || STARTER_FILES_REF}/${encoded}`;
}

function curriculumUrl(repoPath) {
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  return `${RAW}/bootstrapworld/curriculum/${CURRICULUM_COMMIT}/${encoded}`;
}

// The URL a student actually clicks, for a given entry point. Only the editor
// origin differs from production (Bootstrap points at pyret.bootstrapworld.org).
function shareUrlFor(editorBase, repoPath, ref) {
  return `${editorBase.replace(/\/+$/, "")}/editor#shareurl=` + starterFileUrl(repoPath, ref);
}

module.exports = {
  STARTER_FILES_COMMIT,
  STARTER_FILES_REF,
  CURRICULUM_COMMIT,
  CURRICULUM_SOURCES,
  starterFileUrl,
  curriculumUrl,
  shareUrlFor,
};
