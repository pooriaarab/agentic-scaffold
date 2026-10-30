#!/usr/bin/env node
import { startMcp } from "./mcp.js";
import { VERSION } from "./version.js";

// The `mcp` word may come first, as the package CLI takes it: `agentic-scaffold-mcp mcp --help`.
// Only a single help or version flag may follow it.
const argv = process.argv.slice(2);
const args = argv[0] === "mcp" ? argv.slice(1) : argv;
const flag = args[0];

if (args.length > 1 || (flag !== undefined && !["--help", "-h", "--version", "-V"].includes(flag))) {
  console.error("Usage: agentic-scaffold-mcp [mcp] [--help | -h | --version | -V]");
  process.exit(2);
}

if (flag === "--help" || flag === "-h") {
  console.log(`agentic-scaffold ${VERSION}\nUsage: agentic-scaffold-mcp [mcp] [--help | -h | --version | -V]\nStarts the MCP server on stdio.`);
  process.exit(0);
}
if (flag === "--version" || flag === "-V") {
  console.log(VERSION);
  process.exit(0);
}

startMcp().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
