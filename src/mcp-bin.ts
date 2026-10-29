#!/usr/bin/env node
import { startMcp } from "./mcp.js";
import { DEFAULT_BRAND } from "./index.js";
import { VERSION } from "./version.js";

// The `mcp` word may come first, as the package CLI takes it: `agentic-scaffold-mcp mcp --help`.
const argv = process.argv.slice(2);
const args = argv[0] === "mcp" ? argv.slice(1) : argv;
const has = (...names: string[]) => args.some((a) => names.includes(a));

if (has("--help", "-h")) {
  console.log(`${DEFAULT_BRAND.name} ${VERSION}\nUsage: agentic-scaffold-mcp [mcp] [--help | --version]\nStarts the MCP server on stdio.`);
  process.exit(0);
}
if (has("--version", "-V")) {
  console.log(VERSION);
  process.exit(0);
}

startMcp().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
