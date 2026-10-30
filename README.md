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

Requires Node.js 22 or later. Includes TypeScript declarations and three direct dependencies: the MCP SDK, Zod and agentic-identity.

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

## MCP arguments

The main bin accepts `agentic-scaffold mcp` to start the server. The
only arguments after `mcp` are a single `--help`, `-h`, `--version`, or
`-V` flag. Help and version flags print and exit.

The dedicated bin accepts `agentic-scaffold-mcp` with an optional `mcp`
word, followed by at most one of the same flags. With no flag, it starts
the server. Both bins reject unknown or extra arguments with exit code 2.

## MCP server behaviour

The server uses stdio and waits for requests until stdin closes. A bare MCP
command can therefore appear to hang in an interactive terminal. Use a help
flag to inspect the command without starting the server.

## Migration: Worker auth

`POST /summarize` is gone. Use `POST /api/v1/summarize` with
`Authorization: Bearer <key>`. The Worker uses `createStoreAuth` from
agentic-identity by default. Bind `IDENTITY_DB` to the identity Worker's D1
database. Set `REGION` to its region (`eu` for EU deployments). Create that
database with an EU location hint (`weur` or `eeur`) and apply the
`D1_SCHEMA` from `agentic-identity/cloudflare` before use. The template
`wrangler.jsonc` shows the binding. Replace its placeholder database ID.

Issue credentials through agentic-identity. Each credential names a stored
principal. The shared adapter checks expiry, revocation, and the full
principal chain on each request. The resolved principal needs `text:read`.
A missing or bad key gets 401. A principal without the scope gets 403.
Missing configuration or an unavailable identity store gets 503.
`GET /health` stays open. An optional `AUTH` port supports other backends.

For local development with D1, set `REGION=unknown`. Local D1 does not
confirm an EU region. Keep `REGION=eu` for the deployed EU database.

To use the token fallback for local development, first remove the
`IDENTITY_DB` binding from your local Wrangler configuration. Then set
`AUTH_UNSAFE_DEV_TOKENS=1` and the `AUTH_TOKENS` secret. This fallback skips stored identity and revocation.
The token table maps tokens (32 bytes or more) to `kind:name`, or to
`{ "as": "kind:name", "scopes": ["text:read"] }`. A bad entry refuses the
whole table. A token table alone does not enable auth. When `IDENTITY_DB`
is set, the Worker always uses the identity store instead of this fallback.
Do not enable the fallback in production.

## Smoke test of the published packages

`scripts/npm-smoke.mjs` installs each published suite package from npm in a clean temp dir. It runs the CLI and MCP `--help` and `--version`, and imports the main export and the SDK client in Node 22. It prints a pass/fail table and exits 1 on any failure.

```sh
node scripts/npm-smoke.mjs                      # all packages
node scripts/npm-smoke.mjs agentic-link         # one package
```

The `npm-smoke` workflow runs it every day and on demand. The table goes to the job summary.

## Install check of all packages together

`scripts/install-all.mjs` installs all packages in `scripts/agentic-packages.mjs`
at latest in one clean project. It saves exact versions and checks the full
npm dependency tree. Install errors and invalid peers fail the gate. It does
not use force or legacy peer resolution.

```bash
npm run build
npm run install-all
```

The gate imports public main and SDK entries. It checks CLI help and version,
then uses a real MCP client to initialize each server and list its tools.
Scaffold also checks that MCP and SDK text summaries match and reads session
costs. Shared identity, design, and realtime contracts run without a service.
The gate then installs a packed copy of this branch and repeats the checks.
Companion versions must stay fixed through this step.

The workflow runs on pull requests, main pushes, each day, and on demand.
It keeps `runtime-gate-artifacts/runtime.json` for seven days, including resolved
versions, shared dependency versions, bounded probe output, and failure details.
Set `RUNTIME_GATE_ARTIFACTS` to change the report directory. `npm test` also
installs an incompatible packed fixture and proves the runtime check rejects it.
A new published package can make this live gate fail.

On 2026-10-30, `npm run install-all` passed with Node 22.23.4 and npm 10.9.9, without `--force` or `--legacy-peer-deps`. It installed 277 packages. The top-level releases were:

| Package | Version | Package | Version |
| --- | --- | --- | --- |
| agentic-identity | 0.11.0 | agentic-realtime | 0.6.0 |
| agentic-documents | 0.13.0 | agentic-spreadsheet | 0.14.2 |
| agentic-slides | 0.14.2 | agentic-drive | 0.10.2 |
| agentic-tables | 0.15.0 | agentic-tasks | 0.12.0 |
| agentic-forms | 0.11.3 | agentic-canvas | 0.15.0 |
| agentic-formats | 0.4.4 | agentic-design | 0.10.1 |
| agentic-assistant | 0.7.5 | agentic-comments | 0.8.5 |
| agentic-link | 0.5.0 | agentic-notify | 0.6.2 |
| agentic-search | 0.8.1 | agentic-scaffold | 0.1.6 |

Earlier, `agentic-assistant@0.7.4` excluded design 0.10.1, and `agentic-assistant@0.7.2` excluded design 0.9.0 ([output in PR #30](https://github.com/pooriaarab/agentic-scaffold/pull/30)). The full dependency tree check now rejects invalid nested peers. See the [install-all workflow](https://github.com/pooriaarab/agentic-scaffold/actions/workflows/install-all.yml) for the latest result.

## Limits

This starter has zero vendor-specific integrations. Local dispatch creates a receipt without external delivery.
CLI and MCP dispatch use the local adapter by default; SDK callers can supply the HTTP adapter.
HTTP delivery defaults to a ten-second timeout, with no retries. Cost units count text length rather than billing charges.
Reports reset when the process exits.

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
Rename the hardcoded package and bin names in `src/cli.ts` help and error
messages and in `src/mcp-bin.ts` help.
The MCP manifest is a template and keeps version `0.1.0`. Set its version
and repository ID before publishing your own package.

The repository includes a shared core contract and a publish workflow. Inspect that workflow before adopting its release process.
Version 0.2.0 is an early starter release; interfaces can change. See [CHANGELOG.md](CHANGELOG.md).

## License

MIT.
