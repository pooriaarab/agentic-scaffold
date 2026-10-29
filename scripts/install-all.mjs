#!/usr/bin/env node
// Install all published agentic packages together in a clean temp project.
// This catches peer dependency drift across package latest tags.
//
// Peer check scope: strict-peer-deps is off on purpose. A
// direct conflict between two packages in PACKAGES still fails with ERESOLVE.
// A conflict deeper in the tree only logs a warning, and the check passes.
// Turn on strict-peer-deps only as a deliberate choice, with a note here.
//
// Cleanup: the temp dir is removed in `finally`. Signals (SIGTERM, SIGINT) do
// not run `finally` here, because spawnSync blocks the event loop and signal
// handlers cannot run. CI runners are ephemeral, so a leftover dir is harmless.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_PACKAGES as PACKAGES } from "./agentic-packages.mjs";

const TIMEOUT_MS = 5 * 60 * 1000;
const TIMEOUT_EXIT = 124;

function installAll(dir) {
  const env = {
    ...process.env,
    CI: "1",
    WRANGLER_SEND_METRICS: "false",
    npm_config_audit: "false",
    npm_config_force: "false",
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
    ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--package-lock=false", ...specs],
    {
      cwd: dir,
      env,
      stdio: ["ignore", "inherit", "inherit"],
      // npm is npm.cmd on Windows, and Node refuses to spawn .cmd without a shell.
      // The args are fixed strings built from the static package list.
      shell: process.platform === "win32",
      timeout: TIMEOUT_MS,
    },
  );

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
