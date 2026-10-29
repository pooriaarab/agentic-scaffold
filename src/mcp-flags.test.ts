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
    ["cli.js", ["mcp", "--help"]],
    ["cli.js", ["mcp", "-h"]],
    ["mcp-bin.js", ["--help"]],
    ["mcp-bin.js", ["mcp", "--help"]],
    ["mcp-bin.js", ["mcp", "-h"]],
  ])("%s %j prints help", (file, args) => {
    const result = run(file, args);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });

  test("the mcp bin's help names the real bin", () => {
    const result = run("mcp-bin.js", ["mcp", "--help"]);
    expect(result.stdout).toContain("Usage: agentic-scaffold-mcp");
    expect(result.stdout).not.toContain("agentic-pack-mcp");
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
