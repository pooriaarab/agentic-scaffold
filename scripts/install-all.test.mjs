// Unit tests for scripts/install-all.mjs. The live install runs in the
// install-all workflow. These tests use a fake spawn, so no network is used.
//
// Failure cases these tests must catch:
// - the package list drops or repeats a package
// - a spec is missing "@latest", so npm skips the latest tags
// - an npm exit code, a signal kill, a timeout, or a spawn error is reported as success
// - the temp dir is left behind on success or on failure
import { spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ALL_PACKAGES } from "./agentic-packages.mjs";
import { installEnv, runInstall } from "./install-all.mjs";

const SCRIPT = fileURLToPath(new URL("./install-all.mjs", import.meta.url));

// Build a fake spawnSync that records the call and returns `result`.
function fakeSpawn(result) {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts, cwdExisted: existsSync(opts.cwd) });
    return result;
  };
  return { spawn, calls };
}

function withRoot(fn) {
  const dirRoot = mkdtempSync(join(tmpdir(), "install-all-test-"));
  try {
    return fn(dirRoot);
  } finally {
    rmSync(dirRoot, { recursive: true, force: true });
  }
}

const quiet = { log: () => {}, err: () => {} };

describe("package list", () => {
  // The count is pinned on purpose. A new package must update this test, so
  // the daily check does not change without a review.
  test("has 18 unique agentic-* packages", () => {
    expect(ALL_PACKAGES).toHaveLength(18);
    expect(new Set(ALL_PACKAGES).size).toBe(18);
    for (const pkg of ALL_PACKAGES) expect(pkg).toMatch(/^agentic-[a-z]+$/);
  });
});

describe("installEnv", () => {
  test("turns off audit, funding, and metrics, and keeps the base env", () => {
    const base = { PATH: "/bin", WRANGLER_SEND_METRICS: "true" };
    const env = installEnv(base);
    expect(env.PATH).toBe("/bin");
    expect(env.WRANGLER_SEND_METRICS).toBe("false");
    expect(env.CI).toBe("1");
    expect(env.npm_config_audit).toBe("false");
    expect(env.npm_config_fund).toBe("false");
    expect(env.npm_config_legacy_peer_deps).toBe("false");
    expect(base.WRANGLER_SEND_METRICS).toBe("true");
  });
});

describe("runInstall", () => {
  test("passes only the given packages to npm, each at latest", () =>
    withRoot((dirRoot) => {
      const { spawn, calls } = fakeSpawn({ status: 0 });
      expect(runInstall({ packages: ["agentic-a", "agentic-b"], spawn, dirRoot, ...quiet })).toBe(0);
      expect(calls[0].args.slice(5)).toEqual(["agentic-a@latest", "agentic-b@latest"]);
    }));

  test("returns 0 after install and version listing", () =>
    withRoot((dirRoot) => {
      const { spawn, calls } = fakeSpawn({ status: 0 });
      expect(runInstall({ spawn, dirRoot, ...quiet })).toBe(0);
      expect(calls).toHaveLength(3);
      const [call] = calls;
      expect(calls[1].args).toEqual(["list", "--depth=0"]);
      expect(calls[1].opts.cwd).toBe(call.opts.cwd);
      expect(calls[1].opts.env.npm_config_legacy_peer_deps).toBe("false");
      expect(call.cmd).toBe("npm");
      expect(call.args.slice(0, 5)).toEqual([
        "install", "--no-audit", "--no-fund", "--ignore-scripts", "--package-lock=false",
      ]);
      expect(call.args.slice(5)).toEqual(ALL_PACKAGES.map((pkg) => `${pkg}@latest`));
      expect(call.opts.timeout).toBe(5 * 60 * 1000);
      expect(call.opts.stdio).toEqual(["ignore", "inherit", "inherit"]);
      expect(call.opts.shell).toBe(process.platform === "win32");
      expect(call.opts.env.PATH).toBe(process.env.PATH);
      expect(call.opts.env.CI).toBe("1");
      expect(call.opts.env.npm_config_force).toBe("false");
      expect(call.opts.env.npm_config_legacy_peer_deps).toBe("false");
      expect(call.opts.env.npm_config_update_notifier).toBe("false");
    }));

  test("fails if installed versions cannot be listed", () =>
    withRoot((dirRoot) => {
      let count = 0;
      const spawn = () => ({ status: ++count === 1 ? 0 : 1 });
      expect(runInstall({ spawn, dirRoot, ...quiet })).toBe(1);
    }));

  test("maps a version listing timeout to exit code 124", () =>
    withRoot((dirRoot) => {
      let count = 0;
      const spawn = () => ++count === 1
        ? { status: 0 }
        : { error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) };
      expect(runInstall({ spawn, dirRoot, ...quiet })).toBe(124);
    }));

  test("runs in a new temp dir under the given root", () =>
    withRoot((dirRoot) => {
      const { spawn, calls } = fakeSpawn({ status: 0 });
      runInstall({ spawn, dirRoot, ...quiet });
      const [call] = calls;
      expect(call.cwdExisted).toBe(true);
      expect(call.opts.cwd.startsWith(dirRoot)).toBe(true);
    }));

  test("removes the temp dir after success", () =>
    withRoot((dirRoot) => {
      const { spawn, calls } = fakeSpawn({ status: 0 });
      runInstall({ spawn, dirRoot, ...quiet });
      expect(existsSync(calls[0].opts.cwd)).toBe(false);
    }));

  test("returns npm's non-zero exit code", () =>
    withRoot((dirRoot) => {
      const { spawn, calls } = fakeSpawn({ status: 1 });
      expect(runInstall({ spawn, dirRoot, ...quiet })).toBe(1);
      expect(existsSync(calls[0].opts.cwd)).toBe(false);
      const { spawn: spawn7, calls: calls7 } = fakeSpawn({ status: 7 });
      expect(runInstall({ spawn: spawn7, dirRoot, ...quiet })).toBe(7);
      expect(existsSync(calls7[0].opts.cwd)).toBe(false);
    }));

  test("treats a signal kill (null status) as a failure", () =>
    withRoot((dirRoot) => {
      const { spawn, calls } = fakeSpawn({ status: null, signal: "SIGKILL" });
      expect(runInstall({ spawn, dirRoot, ...quiet })).toBe(1);
      expect(existsSync(calls[0].opts.cwd)).toBe(false);
    }));

  test("maps a timeout to exit code 124 and removes the temp dir", () =>
    withRoot((dirRoot) => {
      const { spawn, calls } = fakeSpawn({ error: Object.assign(new Error("spawnSync npm ETIMEDOUT"), { code: "ETIMEDOUT" }) });
      expect(runInstall({ spawn, dirRoot, ...quiet })).toBe(124);
      expect(existsSync(calls[0].opts.cwd)).toBe(false);
    }));

  test("maps other spawn errors to exit code 1, logs them, and removes the temp dir", () =>
    withRoot((dirRoot) => {
      const messages = [];
      const { spawn, calls } = fakeSpawn({ error: Object.assign(new Error("spawnSync npm ENOENT"), { code: "ENOENT" }) });
      expect(runInstall({ spawn, dirRoot, log: () => {}, err: (m) => messages.push(m) })).toBe(1);
      expect(messages.join("\n")).toContain("ENOENT");
      expect(existsSync(calls[0].opts.cwd)).toBe(false);
    }));

  test("removes the temp dir even when spawn throws", () =>
    withRoot((dirRoot) => {
      let seenCwd;
      const spawn = (_cmd, _args, opts) => {
        seenCwd = opts.cwd;
        throw new Error("boom");
      };
      expect(() => runInstall({ spawn, dirRoot, ...quiet })).toThrow("boom");
      expect(existsSync(seenCwd)).toBe(false);
    }));

  test("writes the private package.json before npm runs", () =>
    withRoot((dirRoot) => {
      let manifest;
      const spawn = (_cmd, _args, opts) => {
        if (!manifest) manifest = JSON.parse(readFileSync(join(opts.cwd, "package.json"), "utf8"));
        return { status: 0 };
      };
      runInstall({ spawn, dirRoot, ...quiet });
      expect(manifest).toEqual({ name: "agentic-install-all", private: true });
    }));
});

// End to end: the real CLI, with a fake npm first on PATH that exits with
// `npmExit`. The symlink case guards the main-module check: it must still run.
describe.skipIf(process.platform === "win32")("CLI entry", () => {
  test.each([
    ["directly", false, 3],
    ["through a symlink", true, 3],

  ])("runs npm and exits with its code when run %s", (_label, viaLink, npmExit) =>
    withRoot((root) => {
      const bin = join(root, "bin");
      const tmp = join(root, "tmp");
      mkdirSync(bin);
      mkdirSync(tmp);
      writeFileSync(join(bin, "npm"), `#!/bin/sh\nexit ${npmExit}\n`);
      chmodSync(join(bin, "npm"), 0o755);

      let script = SCRIPT;
      if (viaLink) {
        script = join(root, "link.mjs");
        symlinkSync(SCRIPT, script);
      }

      const r = spawnSync(process.execPath, [script], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp },
      });
      expect(r.status).toBe(npmExit);
      expect(readdirSync(tmp)).toEqual([]);
    }));
});
