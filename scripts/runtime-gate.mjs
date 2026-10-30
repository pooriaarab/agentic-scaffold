// Runs only inside the clean install-all consumer; no package source imports.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [dir, encoded] = process.argv.slice(2);
const packages = JSON.parse(encoded);
const artifacts = resolve(process.env.RUNTIME_GATE_ARTIFACTS || "runtime-gate-artifacts");
mkdirSync(artifacts, { recursive: true });
const report = { versions: {}, duplicates: {}, stages: [] };
const run = (cmd, args, cwd = dir) => execFileSync(cmd, args, {
  cwd, env: process.env, encoding: "utf8", timeout: 90000, maxBuffer: 2 * 1024 * 1024,
});
const meta = (pkg) => JSON.parse(readFileSync(join(dir, "node_modules", pkg, "package.json"), "utf8"));
function contracts(stage) {
  // Copy the probe into the consumer so ESM resolves its installed dependencies.
  writeFileSync(join(dir, "runtime-probe.mjs"), readFileSync(new URL("./runtime-probe.mjs", import.meta.url)));
  let output = "";
  try {
    output = run(process.execPath, ["runtime-probe.mjs", JSON.stringify(packages)]);
  } catch (error) {
    output = String(error.stdout || "");
    throw error;
  } finally {
    report.stages.push({ stage, output: output.slice(-16000) });
    console.log(output);
  }
}
try {
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  for (const pkg of packages) {
    report.versions[pkg] = meta(pkg).version;
    assert.equal(manifest.dependencies[pkg], meta(pkg).version, `${pkg} must have an exact resolved version`);
  }
  // npm ls exits nonzero for invalid peers. Do not hide those failures.
  run("npm", ["ls", "--all", "--json"]);
  const shared = new Set(["agentic-identity", "agentic-design", "agentic-realtime"]);
  function scan(modules) {
    if (!existsSync(modules)) return;
    for (const entry of readdirSync(modules).filter(n => !n.startsWith("."))) {
      if (entry.startsWith("@")) { scan(join(modules, entry)); continue; }
      const root = join(modules, entry);
      if (shared.has(entry)) {
        const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
        (report.duplicates[entry] ??= []).push({ version, path: relative(dir, root) });
      }
      scan(join(root, "node_modules"));
    }
  }
  scan(join(dir, "node_modules"));
  console.log("Shared dependency instances:", report.duplicates);
  contracts("exact-latest");
  if (packages.includes("agentic-scaffold")) {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const packed = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", dir], root));
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", join(dir, packed[0].filename)]);
    assert.equal(meta("agentic-scaffold").version, JSON.parse(readFileSync(join(root, "package.json"))).version);
    for (const pkg of packages.filter(p => p !== "agentic-scaffold")) {
      assert.equal(meta(pkg).version, report.versions[pkg], `${pkg} changed after packed install`);
    }
    run("npm", ["ls", "--all", "--json"]);
    contracts("packed-scaffold");
  }
} catch (error) {
  report.error = String(error.message).slice(-16000);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  writeFileSync(join(artifacts, "runtime.json"), JSON.stringify(report, null, 2) + "\n");
}
