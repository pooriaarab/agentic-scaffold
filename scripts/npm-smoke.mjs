#!/usr/bin/env node
// Install each published package from npm in a clean temp dir and check
// the CLI, the MCP server, and the ESM imports the way a user would.
// Usage: node scripts/npm-smoke.mjs [--json out.json] [pkg ...]
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_PACKAGES as ALL } from "./agentic-packages.mjs";

// Packages that must export an SDK client subpath. A missing one fails.
const SDK_SUBPATHS = {
  "agentic-identity": "sdk", "agentic-realtime": "sdk", "agentic-notify": "sdk",
  "agentic-documents": "client", "agentic-spreadsheet": "client", "agentic-slides": "client",
  "agentic-drive": "client", "agentic-tables": "client", "agentic-tasks": "client",
  "agentic-forms": "client", "agentic-canvas": "client", "agentic-assistant": "client",
  "agentic-comments": "client", "agentic-link": "client", "agentic-search": "client",
};

const args = process.argv.slice(2);
let jsonOut = null;
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") {
    if (jsonOut) {
      console.error("--json given twice");
      process.exit(2);
    }
    jsonOut = args[++i];
    if (!jsonOut || jsonOut.startsWith("-")) {
      console.error("--json needs a file path");
      process.exit(2);
    }
  }
  else if (args[i].startsWith("-")) {
    console.error(`Unknown option: ${args[i]}`);
    process.exit(2);
  } else names.push(args[i]);
}
const pkgs = names.length ? names : ALL;
const unknown = pkgs.filter((n) => !ALL.includes(n));
if (unknown.length) {
  console.error(`Unknown package: ${unknown.join(", ")}`);
  process.exit(2);
}
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1", npm_config_update_notifier: "false" };

function run(cmd, argv, cwd, timeout = 60000) {
  const r = spawnSync(cmd, argv, { cwd, env, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return { ok: r.status === 0 && !r.error, out, stdout: (r.stdout ?? "").trim(), timedOut: r.error?.code === "ETIMEDOUT" };
}
// The version must appear on stdout: a banner on stderr from a server that ignores the flag does not count.
const versionResult = (r, version) =>
  r.ok && !new RegExp(`(^|[^\\d.])${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\d.])`).test(r.stdout) ? { ok: false, out: `printed "${r.out.slice(0, 80)}", expected ${version}` } : r;
const tail = (s) => s.split("\n").slice(-3).join(" | ").slice(0, 200);

function smoke(pkg) {
  const dir = mkdtempSync(join(tmpdir(), "npm-smoke-"));
  const res = { pkg, version: "", checks: {}, errors: [] };
  const check = (name, r) => {
    res.checks[name] = r.ok;
    if (!r.ok) res.errors.push(`${name}: ${r.timedOut ? "timeout" : tail(r.out)}`);
  };
  try {
    writeFileSync(join(dir, "package.json"), '{"name":"smoke","private":true,"type":"module"}');
    // A release can be a few minutes old and not yet visible on every mirror: retry.
    let inst;
    for (let n = 0; n < 4; n++) {
      inst = run("npm", ["install", `${pkg}@latest`, "--no-audit", "--no-fund"], dir, 120000);
      if (inst.ok || !/ETARGET|notarget/.test(inst.out) || n === 3) break;
      spawnSync("sleep", ["30"]);
    }
    check("install", inst);
    if (!inst.ok) return res;
    const root = join(dir, "node_modules", pkg);
    const meta = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    res.version = meta.version;
    const bins = typeof meta.bin === "string" ? { [pkg]: meta.bin } : (meta.bin ?? {});
    const bin = (n) => join(dir, "node_modules", ".bin", n);
    const cliName = bins[pkg] ? pkg : Object.keys(bins).find((n) => !n.endsWith("-mcp"));
    if (!cliName) {
      check("cli-help", { ok: false, out: "no cli bin" });
      check("cli-version", { ok: false, out: "no cli bin" });
    } else {
      const h = run(bin(cliName), ["--help"], dir);
      check("cli-help", h.ok && !/usage|--help/i.test(h.out) ? { ok: false, out: `no help text: "${h.out.slice(0, 80)}"` } : h);
      const v = run(bin(cliName), ["--version"], dir);
      check("cli-version", versionResult(v, meta.version));
    }
    // MCP: a dedicated *-mcp bin, else the `mcp` subcommand of the CLI.
    const mcpBin = bins[`${pkg}-mcp`] ? bin(`${pkg}-mcp`) : null;
    const mcpCmd = (extra) => (mcpBin ? [mcpBin, extra] : [bin(cliName ?? pkg), "mcp", extra]);
    for (const [label, flag] of [["mcp-help", "--help"], ["mcp-version", "--version"]]) {
      // With stdin closed a server that ignores the flag exits 0 and prints nothing: require output.
      const [c, ...a] = mcpCmd(flag);
      const r = run(c, a, dir, 20000);
      if (label === "mcp-version") check(label, versionResult(r, meta.version));
      else check(label, r.ok && !/usage|--help/i.test(r.out) ? { ok: false, out: `no help text: "${r.out.slice(0, 80)}"` } : r);
    }
    // Imports in Node 22 ESM: main export and the SDK client subpath.
    const exp = meta.exports && typeof meta.exports === "object" ? meta.exports : {};
    const want = SDK_SUBPATHS[pkg];
    const subs = want ? [`./${want}`] : [];
    const targets = subs.map((s) => `${pkg}/${s.slice(2)}`);
    const src = `const t=${JSON.stringify(targets)};let bad=0;for(const n of t){try{const m=await import(n);const k=Object.keys(m);if(!k.length)throw new Error("no exports");console.log(n,k.length+" exports")}catch(e){bad++;console.error(n,String(e.message).split("\\n")[0])}}process.exit(bad?1:0)`;
    writeFileSync(join(dir, "imp.mjs"), src);
    check("import-main", run("node", ["-e", `import(${JSON.stringify(pkg)}).then(m=>{if(!Object.keys(m).length)throw new Error("no exports")}).catch(e=>{console.error(String(e.message).split("\\n")[0]);process.exit(1)})`, "--input-type=module"], dir));
    if (want && !(subs[0] in exp)) check("import-sdk", { ok: false, out: `exports lacks ${subs[0]}` });
    else if (subs.length) check("import-sdk", run("node", ["imp.mjs"], dir));
    else res.checks["import-sdk"] = null;
  } catch (e) {
    res.errors.push(`harness: ${e.message}`);
    res.checks.harness = false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return res;
}

const results = pkgs.map((p) => {
  const r = smoke(p);
  console.error(`${r.pkg}@${r.version || "?"}: ${r.errors.length ? "FAIL" : "ok"}`);
  return r;
});
const cols = ["install", "cli-help", "cli-version", "mcp-help", "mcp-version", "import-main", "import-sdk"];
const mark = (v, r) => (v === null ? "n/a" : v === undefined ? (r.errors.length ? "skip" : "n/a") : v ? "pass" : "FAIL");
const lines = [
  `| package | version | ${cols.join(" | ")} |`,
  `| --- | --- | ${cols.map(() => "---").join(" | ")} |`,
  ...results.map((r) => `| ${r.pkg} | ${r.version || "-"} | ${cols.map((c) => mark(r.checks[c], r)).join(" | ")} |`),
];
const failed = results.filter((r) => r.errors.length);
let md = lines.join("\n") + "\n";
if (failed.length) {
  md += "\n### Failures\n\n" + failed.map((r) => `- **${r.pkg}@${r.version || "?"}**: ${r.errors.join("; ")}`).join("\n") + "\n";
}
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
