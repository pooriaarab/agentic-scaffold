#!/usr/bin/env node
// Install each published package from npm in a clean temp dir and check
// the CLI, the MCP server, and the ESM imports the way a user would.
// Usage: node scripts/npm-smoke.mjs [--json out.json] [pkg ...]
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ALL = [
  "identity", "realtime", "documents", "spreadsheet", "slides", "drive",
  "tables", "tasks", "forms", "canvas", "formats", "design", "assistant",
  "comments", "link", "notify", "search", "scaffold",
].map((n) => `agentic-${n}`);

const args = process.argv.slice(2);
let jsonOut = null;
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--json") jsonOut = args[++i];
  else names.push(args[i]);
}
const pkgs = names.length ? names : ALL;
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1", npm_config_update_notifier: "false" };

function run(cmd, argv, cwd, timeout = 60000) {
  const r = spawnSync(cmd, argv, { cwd, env, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return { ok: r.status === 0 && !r.error, out, timedOut: r.error?.code === "ETIMEDOUT" };
}
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
      inst = run("npm", ["install", `${pkg}@latest`, "--no-audit", "--no-fund"], dir, 240000);
      if (inst.ok || !/ETARGET|notarget/.test(inst.out)) break;
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
      check("cli-help", run(bin(cliName), ["--help"], dir));
      const v = run(bin(cliName), ["--version"], dir);
      check("cli-version", { ...v, ok: v.ok && v.out.includes(meta.version) });
      if (v.ok && !v.out.includes(meta.version)) res.errors.push(`cli-version: printed "${tail(v.out)}", expected ${meta.version}`);
    }
    // MCP: a dedicated *-mcp bin, else the `mcp` subcommand of the CLI.
    const mcpBin = bins[`${pkg}-mcp`] ? bin(`${pkg}-mcp`) : null;
    const mcpCmd = (extra) => (mcpBin ? [mcpBin, extra] : [bin(cliName ?? pkg), "mcp", extra]);
    for (const [label, flag] of [["mcp-help", "--help"], ["mcp-version", "--version"]]) {
      const [c, ...a] = mcpCmd(flag);
      check(label, run(c, a, dir, 20000));
    }
    // Imports in Node 22 ESM: main export and the SDK client subpath.
    const exp = meta.exports ?? {};
    const subs = ["./sdk", "./client"].filter((s) => s in exp);
    const targets = [pkg, ...subs.map((s) => `${pkg}/${s.slice(2)}`)];
    const src = `const t=${JSON.stringify(targets)};let bad=0;for(const n of t){try{const m=await import(n);const k=Object.keys(m);if(!k.length)throw new Error("no exports");console.log(n,k.length+" exports")}catch(e){bad++;console.error(n,String(e.message).split("\\n")[0])}}process.exit(bad?1:0)`;
    writeFileSync(join(dir, "imp.mjs"), src);
    check("import-main", run("node", ["-e", `import(${JSON.stringify(pkg)}).then(m=>{if(!Object.keys(m).length)throw new Error("no exports")}).catch(e=>{console.error(String(e.message).split("\\n")[0]);process.exit(1)})`, "--input-type=module"], dir));
    if (subs.length) check("import-sdk", run("node", ["imp.mjs"], dir));
    else res.checks["import-sdk"] = null;
  } catch (e) {
    res.errors.push(`harness: ${e.message}`);
    res.checks.harness = false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return res;
}

const results = pkgs.map(smoke);
const cols = ["install", "cli-help", "cli-version", "mcp-help", "mcp-version", "import-main", "import-sdk"];
const mark = (v) => (v === null || v === undefined ? "n/a" : v ? "pass" : "FAIL");
const lines = [
  `| package | version | ${cols.join(" | ")} |`,
  `| --- | --- | ${cols.map(() => "---").join(" | ")} |`,
  ...results.map((r) => `| ${r.pkg} | ${r.version || "-"} | ${cols.map((c) => mark(r.checks[c])).join(" | ")} |`),
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
