#!/usr/bin/env node
import { startMcp } from "./mcp.js";
import { DEFAULT_BRAND } from "./index.js";
import { VERSION } from "./version.js";

const flag = process.argv[2];
if (flag === "--help" || flag === "-h") {
  console.log(`${DEFAULT_BRAND.name} ${VERSION}\nUsage: ${DEFAULT_BRAND.command}-mcp\nStarts the MCP server on stdio.`);
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
