import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { VERSION } from "./version.js";

let dir = "";

beforeAll(() => {
  dir = mkdtempSync(join(process.cwd(), "node_modules", ".scaffold-bin-"));
  const build = spawnSync("npx", ["tsup", "--out-dir", dir, "--no-dts"], { encoding: "utf8" });
  expect(build.status, build.stderr).toBe(0);
}, 120_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(file: string, args: string[]) {
  return spawnSync(process.execPath, [join(dir, file), ...args], { encoding: "utf8", input: "", timeout: 15_000 });
}

describe("mcp flags exit without starting the server", () => {
  test.each([
    ["cli.js", ["mcp", "--version"]],
    ["cli.js", ["mcp", "-V"]],
    ["mcp-bin.js", ["--version"]],
  ])("%s %j prints the version", (file, args) => {
    const result = run(file, args);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(VERSION);
  });

  test.each([
    ["cli.js", ["--help"]],
    ["cli.js", ["-h"]],
    ["cli.js", ["mcp", "--help"]],
    ["cli.js", ["mcp", "-h"]],
    ["mcp-bin.js", ["--help"]],
    ["mcp-bin.js", ["mcp", "--help"]],
    ["mcp-bin.js", ["mcp", "-h"]],
  ])("%s %j prints help", (file, args) => {
    const result = run(file, args);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`agentic-scaffold ${VERSION}`);
    expect(result.stdout).toContain(`Usage: ${file === "cli.js" ? "agentic-scaffold <command>" : "agentic-scaffold-mcp"}`);
    expect(result.stdout).not.toContain("agentic-pack");
  });

  test("the mcp bin's help names the real bin", () => {
    const result = run("mcp-bin.js", ["mcp", "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: agentic-scaffold-mcp");
    expect(result.stdout).not.toContain("agentic-pack-mcp");
  });

  test("a bare mcp word starts the server, which answers initialize", () => {
    const request = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0.0.0" } } };
    const result = spawnSync(process.execPath, [join(dir, "mcp-bin.js"), "mcp"], { encoding: "utf8", input: `${JSON.stringify(request)}\n`, timeout: 15_000 });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).result.serverInfo.name).toBe("agentic-scaffold");
  });

  test.each([
    ["cli.js", ["mcp", "--text", "hello"]],
    ["cli.js", ["mcp", "--help", "extra"]],
    ["cli.js", ["mcp", "unknown"]],
    ["mcp-bin.js", ["unknown"]],
    ["mcp-bin.js", ["mcp", "--version", "extra"]],
    ["mcp-bin.js", ["mcp", "mcp"]],
  ])("%s %j rejects invalid arguments", (file, args) => {
    const result = run(file, args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("mcp");
    expect(result.stdout).toBe("");
  });

  test.each([
    ["mcp-bin.js", ["mcp", "--version"]],
    ["mcp-bin.js", ["mcp", "-V"]],
  ])("%s %j prints the version", (file, args) => {
    const result = run(file, args);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(VERSION);
  });
});
