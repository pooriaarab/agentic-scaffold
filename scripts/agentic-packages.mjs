// The published agentic-* packages that the daily checks install.
// Used by scripts/install-all.mjs (all together) and scripts/npm-smoke.mjs
// (one by one). Add a new package here only; both scripts read this list.
export const ALL_PACKAGES = [
  "identity", "realtime", "documents", "spreadsheet", "slides", "drive",
  "tables", "tasks", "forms", "canvas", "formats", "design", "assistant",
  "comments", "link", "notify", "search", "scaffold",
].map((n) => `agentic-${n}`);
