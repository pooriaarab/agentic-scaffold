# agentic-scaffold

[![npm version](https://img.shields.io/npm/v/agentic-scaffold)](https://www.npmjs.com/package/agentic-scaffold)
[![Monthly downloads](https://img.shields.io/npm/dm/agentic-scaffold)](https://www.npmjs.com/package/agentic-scaffold)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/license/mit)

[Package](https://www.npmjs.com/package/agentic-scaffold) · [Source](https://github.com/pooriaarab/agentic-scaffold) · [Support](https://github.com/pooriaarab/agentic-scaffold/issues)

agentic-scaffold is an open-source TypeScript starter for developers who need a Node.js library, command-line interface, and Model Context Protocol (MCP) server.

## Install

```sh
npm install agentic-scaffold
```

Requires Node.js 18 or later. Includes TypeScript declarations and two direct dependencies: the MCP SDK and Zod.

## Run your first summary

No credentials, environment variables, or `.env` loader are required.

```sh
npx agentic-scaffold summary --text "hello world hello"
```

Success prints JSON with `chars: 17`, `words: 3`, `lines: 1`, and `hello` counted twice.

```js
import { summarizeText, getCostReport } from "agentic-scaffold";
console.log(summarizeText("hello world hello"));
console.log(getCostReport()); // { entries: [], dispatches: 0, units: 0 }
```

## Features and runtime surfaces

- **Text statistics:** Character, word, line, and top-word counts; no semantic summarization.
- **Routing:** Two generic adapters: local receipts and HTTP POST with `{ text }`.
- **Guards:** Optional dispatch caps, UTC quiet hours, and text blocklists.
- **Utilities:** Brand configuration, stderr logging, dry-run results, and in-memory cost units.
- **CLI:** `summary`, `dispatch`, `costs`, `mcp`; help via `--help` and version via `--version`.
- **MCP:** Three tools: `summarize_text`, `dispatch_text`, `get_cost_report`.
- **Worker scaffold:** Source handler for `GET /health` (open) and `POST /api/v1/summarize` (needs a bearer key with the `text:read` scope); users deploy it themselves.

Start MCP with `npx agentic-scaffold mcp`. Preview routing with `npx agentic-scaffold dispatch --text hello --dry-run`.

## Migration: Worker auth

`POST /summarize` is gone. Use `POST /api/v1/summarize`. It needs `Authorization: Bearer <key>` and a principal with the `text:read` scope. A missing or bad key gets 401. A key without the scope gets 403. Set the `AUTH_TOKENS` secret to a JSON object of bearer token (32 bytes or more) to `kind:name`, or to `{ "as": "kind:name", "scopes": ["text:read"] }`. A bad entry refuses the whole table. If `AUTH_TOKENS` is missing, the route answers 503. `GET /health` stays open.

## Smoke test of the published packages

`scripts/npm-smoke.mjs` installs each published suite package from npm in a clean temp dir. It runs the CLI and MCP `--help` and `--version`, and imports the main export and the SDK client in Node 22. It prints a pass/fail table and exits 1 on any failure.

```sh
node scripts/npm-smoke.mjs                      # all packages
node scripts/npm-smoke.mjs agentic-link         # one package
```

The `npm-smoke` workflow runs it every day and on demand. The table goes to the job summary.

## Install check of all packages together

`scripts/install-all.mjs` runs `npm install` for all 18 `agentic-*` packages at latest, in one clean temp dir. It catches peer conflicts between them. A conflict fails with npm's ERESOLVE output and exit code 1.

```sh
npm run install-all
```

The `install-all` workflow runs it every day and on demand. When it fails, the workflow uploads npm's ERESOLVE report as an artifact. This check is not a pull request gate. The workflow can be red while another package is being fixed. Pull request CI runs only the script's unit tests (`npm test`).

## Limits

This starter has zero vendor-specific integrations. Local dispatch creates a receipt without external delivery.
CLI and MCP dispatch use the local adapter by default; SDK callers can supply the HTTP adapter.
HTTP delivery defaults to a ten-second timeout, with no retries. Cost units count text length rather than billing charges.
Reports reset when the process exits. CLI help and MCP identity still use the starter name `agentic-pack`.

## Customize a cloned starter

```sh
git clone https://github.com/pooriaarab/agentic-scaffold.git my-pack
cd my-pack
npm ci
npm run build && npm run typecheck && npm test
node dist/cli.js summary --text "hello world hello"
```

Replace `__PACK_NAME__`, `__NPM_NAME__`, `__PACK_COMMAND__`, `__PACK_DESCRIPTION__`, `__PACK_KEYWORDS__`, and `__GITHUB_USER__` wherever they appear.
Check `AGENTS.md`, `SKILL.md`, `RULES.md`, `llms.txt`, `server.json`, `.mcp.json`, and `wrangler.jsonc`.
Update package identity, bin commands, `mcpName`, and `DEFAULT_BRAND` in `src/index.ts`.
The MCP bin's usage line in `src/mcp-bin.ts` names `agentic-scaffold-mcp` as text, so rename it there too.
Set the MCP manifest version and repository ID before publishing your own package.

The repository includes a shared core contract and a publish workflow. Inspect that workflow before adopting its release process.
Version 0.1.4 is an early starter release; interfaces can change. See [CHANGELOG.md](CHANGELOG.md).

## License

MIT.
