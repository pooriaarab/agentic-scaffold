// Failure proof: npm accepts a packed package whose public entry is broken.
// The runtime gate must reject it after a successful install.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

test("rejects an installed incompatible packed entry", () => {
  const root = mkdtempSync(join(tmpdir(), "runtime-negative-"));
  try {
    const fixture = join(root, "fixture");
    const consumer = join(root, "consumer");
    mkdirSync(fixture); mkdirSync(consumer);
    writeFileSync(join(fixture, "package.json"), JSON.stringify({ name: "runtime-incompatible", version: "1.0.0", type: "module", exports: "./broken.mjs" }));
    writeFileSync(join(fixture, "broken.mjs"), 'throw new Error("incompatible runtime fixture");');
    const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts"], { cwd: fixture, encoding: "utf8" }));
    writeFileSync(join(consumer, "package.json"), '{"name":"consumer","private":true}');
    const sdkPack = JSON.parse(execFileSync("npm", ["pack", resolve("node_modules/@modelcontextprotocol/sdk"), "--json", "--ignore-scripts", "--pack-destination", root], { encoding: "utf8" }));
    execFileSync("npm", ["install", "--ignore-scripts", "--save-exact", "--no-audit", "--no-fund", join(fixture, packed[0].filename), join(root, sdkPack[0].filename)], { cwd: consumer, stdio: "pipe" });
    const installed = JSON.parse(readFileSync(join(consumer, "package.json"), "utf8"));
    installed.dependencies["runtime-incompatible"] = "1.0.0";
    writeFileSync(join(consumer, "package.json"), JSON.stringify(installed));
    const result = spawnSync(process.execPath, [resolve("scripts/runtime-gate.mjs"), consumer, '["runtime-incompatible"]'], {
      encoding: "utf8", env: { ...process.env, RUNTIME_GATE_ARTIFACTS: join(root, "report") }, timeout: 30000,
    });
    expect(result.status).toBe(1);
    expect(readFileSync(join(root, "report/runtime.json"), "utf8")).toContain("incompatible runtime fixture");
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 60000);
