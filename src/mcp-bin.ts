#!/usr/bin/env node
import { startMcp } from "./mcp.js";
import { DEFAULT_BRAND } from "./index.js";
import { VERSION } from "./version.js";

// The `mcp` word may come first, as the package CLI takes it: `agentic-scaffold-mcp mcp --help`.
const [first, second] = process.argv.slice(2);
const flag = first === "mcp" ? second : first;
if (flag === "--help" || flag === "-h") {
  console.log(`${DEFAULT_BRAND.name} ${VERSION}\nUsage: agentic-scaffold-mcp\nStarts the MCP server on stdio.`);
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
