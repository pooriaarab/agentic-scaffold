#!/usr/bin/env node
// Install all published agentic packages together in a clean temp project.
// This catches peer dependency drift across package latest tags.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGES = [
  "agentic-identity",
  "agentic-realtime",
  "agentic-documents",
  "agentic-spreadsheet",
  "agentic-slides",
  "agentic-drive",
  "agentic-tables",
  "agentic-tasks",
  "agentic-forms",
  "agentic-canvas",
  "agentic-formats",
  "agentic-design",
  "agentic-assistant",
  "agentic-comments",
  "agentic-link",
  "agentic-notify",
  "agentic-search",
  "agentic-scaffold",
];

const TIMEOUT_MS = 5 * 60 * 1000;
const TIMEOUT_EXIT = 124;

function installAll(dir) {
  const env = {
    ...process.env,
    CI: "1",
    WRANGLER_SEND_METRICS: "false",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_legacy_peer_deps: "false",
    npm_config_update_notifier: "false",
  };

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "agentic-install-all", private: true }, null, 2) + "\n",
  );

  const specs = PACKAGES.map((pkg) => `${pkg}@latest`);
  console.log(`Installing ${PACKAGES.length} packages together in ${dir}`);
  console.log(`npm install ${specs.join(" ")}`);

  const result = spawnSync(
    "npm",
    ["install", "--no-audit", "--no-fund", "--package-lock=false", ...specs],
    {
      cwd: dir,
      env,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: TIMEOUT_MS,
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.error(`install-all failed to run npm: ${result.error.message}`);
    return result.error.code === "ETIMEDOUT" ? TIMEOUT_EXIT : 1;
  }

  if (result.status !== 0) {
    console.error(`install-all failed with npm exit code ${result.status}`);
    return result.status ?? 1;
  }

  console.log("install-all resolved all latest packages together.");
  return 0;
}

// Return the exit code instead of calling process.exit() here, so the
// temp dir is always removed.
const dir = mkdtempSync(join(tmpdir(), "agentic-install-all-"));
let code;
try {
  code = installAll(dir);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exitCode = code;
