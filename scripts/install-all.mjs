#!/usr/bin/env node
// Install all published agentic packages together in a clean temp project.
// This catches peer dependency drift across package latest tags.
//
// npm installs without peer overrides. The runtime stage also runs npm ls
// over the full tree, so invalid nested peers fail even if installation warns.
//
// Cleanup: the temp dir is removed in `finally`. Signals (SIGTERM, SIGINT) do
// not run `finally` here, because spawnSync blocks the event loop and signal
// handlers cannot run. CI runners are ephemeral, so a leftover dir is harmless.
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_PACKAGES as PACKAGES } from "./agentic-packages.mjs";

const TIMEOUT_MS = 5 * 60 * 1000;
const TIMEOUT_EXIT = 124;

function installSpecs(packages = PACKAGES) {
  return packages.map((pkg) => `${pkg}@latest`);
}

export function installEnv(base = process.env) {
  return {
    ...base,
    CI: "1",
    WRANGLER_SEND_METRICS: "false",
    npm_config_audit: "false",
    npm_config_force: "false",
    npm_config_fund: "false",
    npm_config_save_exact: "true",
    npm_config_legacy_peer_deps: "false",
    npm_config_update_notifier: "false",
  };
}

// Run the install in a new temp dir and return the exit code. The unit tests
// inject `packages`, `spawn`, `dirRoot`, `log`, and `err`; the CLI uses the defaults.
export function runInstall({
  packages = PACKAGES,
  spawn = spawnSync,
  dirRoot = tmpdir(),
  log = console.log,
  err = console.error,
} = {}) {
  const dir = mkdtempSync(join(dirRoot, "agentic-install-all-"));
  try {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "agentic-install-all", private: true }, null, 2) + "\n",
    );

    const specs = installSpecs(packages);
    log(`Installing ${packages.length} packages together in ${dir}`);
    log(`npm install ${specs.join(" ")}`);

    const result = spawn(
      "npm",
      ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--package-lock=false", ...specs],
      {
        cwd: dir,
        env: installEnv(),
        stdio: ["ignore", "inherit", "inherit"],
        // npm is npm.cmd on Windows, and Node refuses to spawn .cmd without a shell.
        // The CLI passes the static package list. A caller that passes `packages`
        // must pass plain package names, because the shell reads them on Windows.
        shell: process.platform === "win32",
        timeout: TIMEOUT_MS,
      },
    );

    if (result.error) {
      err(`install-all failed to run npm: ${result.error.message}`);
      return result.error.code === "ETIMEDOUT" ? TIMEOUT_EXIT : 1;
    }

    // A null status means npm was killed by a signal. That is a failure.
    if (result.status !== 0) {
      err(`install-all failed with npm exit code ${result.status}`);
      return result.status ?? 1;
    }

    log("Installed top-level versions:");
    const versions = spawn("npm", ["list", "--depth=0"], {
      cwd: dir,
      env: installEnv(),
      stdio: ["ignore", "inherit", "inherit"],
      shell: process.platform === "win32",
      timeout: TIMEOUT_MS,
    });
    if (versions.error || versions.status !== 0) {
      err(`install-all could not list installed versions: ${versions.error?.message ?? `npm exit code ${versions.status}`}`);
      return versions.error?.code === "ETIMEDOUT" ? TIMEOUT_EXIT : versions.status || 1;
    }

    const runtime = spawn(process.execPath, [fileURLToPath(new URL("./runtime-gate.mjs", import.meta.url)), dir, JSON.stringify(packages)], {
      cwd: process.cwd(), env: installEnv(), stdio: ["ignore", "inherit", "inherit"], timeout: TIMEOUT_MS,
    });
    if (runtime.error || runtime.status !== 0) {
      err(`install-all runtime gate failed: ${runtime.error?.message ?? runtime.status}`);
      return runtime.error?.code === "ETIMEDOUT" ? TIMEOUT_EXIT : runtime.status || 1;
    }
    log("install-all resolved and exercised all latest packages together.");
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Run only when executed directly, so the unit tests can import the helpers.
// realpath on both sides: import.meta.url has symlinks resolved, argv[1] does not.
function isMainModule() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    // argv[1] is missing or not a file (for example, node -e): not the main module.
    return false;
  }
}

if (isMainModule()) {
  process.exitCode = runInstall();
}
