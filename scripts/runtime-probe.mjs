import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packages = JSON.parse(process.argv[2]);
const sdk = {
  identity: "sdk", realtime: "sdk", notify: "sdk",
  documents: "client", spreadsheet: "client", slides: "client", drive: "client",
  tables: "client", tasks: "client", forms: "client", canvas: "client",
  assistant: "client", comments: "client", link: "client", search: "client",
};
for (const pkg of packages) {
  assert.ok(Object.keys(await import(pkg)).length, `${pkg} empty main entry`);
  const sub = sdk[pkg.replace("agentic-", "")];
  if (sub) assert.ok(Object.keys(await import(`${pkg}/${sub}`)).length, `${pkg} empty SDK`);
  const meta = JSON.parse(readFileSync(join("node_modules", pkg, "package.json"), "utf8"));
  const bins = typeof meta.bin === "string" ? { [pkg]: meta.bin } : meta.bin;
  assert.ok(bins?.[pkg], `${pkg} CLI missing`);
  const cli = join(process.cwd(), "node_modules", pkg, bins[pkg]);
  const run = (args, env = process.env) => execFileSync(process.execPath, [cli, ...args], { env, encoding: "utf8", timeout: 15000, maxBuffer: 128 * 1024 });
  assert.match(run(["--help"]), /usage|--help/i);
  assert.ok(run(["--version"]).trim().includes(meta.version), `${pkg} CLI version mismatch`);
  const serverEnv = { ...process.env };
  if (pkg === "agentic-search") Object.assign(serverEnv, { AGENTIC_SEARCH_AS: "runtime-gate", AGENTIC_SEARCH_KIND: "agent" });
  if (pkg === "agentic-comments") serverEnv.AGENTIC_COMMENTS_AS = "agent:runtime-gate";
  if (pkg === "agentic-canvas") serverEnv.CANVAS_ACTOR = "agent:runtime-gate";
  if (pkg === "agentic-drive") {
    // Use the supported local bootstrap in this disposable consumer only.
    serverEnv.AGENTIC_DRIVE_DIR = mkdtempSync(join(process.cwd(), "drive-runtime-"));
    run(["principal", "add", "runtime-gate"], serverEnv);
    serverEnv.AGENTIC_DRIVE_TOKEN = JSON.parse(run(["key", "issue", "runtime-gate"], serverEnv)).token;
  }
  const mcp = bins[`${pkg}-mcp`];
  const extra = [];
  if (pkg === "agentic-assistant") {
    writeFileSync("assistant-script.json", "[]");
    extra.push("--tools", JSON.stringify([process.execPath, join(process.cwd(), "node_modules/agentic-scaffold/dist/mcp-bin.js")]),
      "--scope", "runtime:read", "--tool-scope", "runtime:read", "--provider", "scripted", "--script", "assistant-script.json");
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [...(mcp ? [join(process.cwd(), "node_modules", pkg, mcp)] : [cli, "mcp"]), ...extra],
    stderr: "pipe",
    env: serverEnv,
  });
  let diagnostics = "";
  transport.stderr?.on("data", chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  console.log(`${pkg}: start MCP`);
  const client = new Client({ name: "runtime-gate", version: "1.0.0" });
  try {
    await client.connect(transport, { timeout: 15000 });
    assert.equal(client.getServerVersion()?.version, meta.version, `${pkg} MCP version mismatch`);
    const tools = await client.listTools({}, { timeout: 15000 });
    assert.ok(tools.tools.length, `${pkg} MCP has no tools`);
    if (pkg === "agentic-scaffold") {
      const api = await import(pkg);
      const summary = api.summarizeText("runtime proof");
      assert.equal(summary.words, 2);
      const result = await client.callTool({ name: "summarize_text", arguments: { text: "runtime proof" } }, undefined, { timeout: 15000 });
      assert.ok(!result.isError);
      assert.deepEqual(JSON.parse(result.content[0].text), summary);
      const cost = await client.callTool({ name: "get_cost_report", arguments: {} }, undefined, { timeout: 15000 });
      assert.ok(!cost.isError);
      console.log("Session cost report:", cost.content[0].text);
    }
  } catch (error) {
    throw new Error(`${pkg}: ${error.message}; stderr: ${diagnostics}`);
  } finally {
    await client.close();
    await transport.close();
  }
  console.log(`${pkg}@${meta.version}: imports, CLI, MCP passed`);
}
if (packages.includes("agentic-identity")) {
  const { createMemoryAuth } = await import("agentic-identity");
  const memory = createMemoryAuth();
  const context = { principalId: "runtime", kind: "agent", chain: [{ id: "runtime", kind: "agent" }], scopes: [] };
  const credential = await memory.issue(context);
  const request = new Request("https://runtime.invalid", { headers: { authorization: `Bearer ${credential}` } });
  assert.deepEqual(await memory.auth.authenticate(request), context);
  await memory.revoke(credential);
  assert.equal(await memory.auth.authenticate(request), null);
}
if (packages.includes("agentic-design")) {
  const { contrastRatio } = await import("agentic-design");
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
}
if (packages.includes("agentic-realtime")) {
  const { AwarenessRelay } = await import("agentic-realtime");
  const relay = new AwarenessRelay();
  relay.claim({ socket: "runtime-socket", principal: "runtime" }, [42]);
  assert.deepEqual(relay.idsOf("runtime-socket"), [42]);
  relay.release("runtime-socket");
  assert.deepEqual(relay.idsOf("runtime-socket"), []);
}
