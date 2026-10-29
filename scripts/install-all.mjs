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

const dir = mkdtempSync(join(tmpdir(), "agentic-install-all-"));
const env = {
  ...process.env,
  CI: "1",
  WRANGLER_SEND_METRICS: "false",
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_legacy_peer_deps: "false",
  npm_config_update_notifier: "false",
};

try {
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
      timeout: 5 * 60 * 1000,
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.error(`install-all failed to run npm: ${result.error.message}`);
    process.exit(result.error.code === "ETIMEDOUT" ? 124 : 1);
  }

  if (result.status !== 0) {
    console.error(`install-all failed with npm exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }

  console.log("install-all resolved all latest packages together.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
