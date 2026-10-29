# Changelog

All notable changes to this package are in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package uses
[Semantic Versioning](https://semver.org/).

## 0.1.4 - 2026-10-29

### Fixed

- `agentic-scaffold-mcp mcp --help`, `-h`, `--version` and `-V` print and exit 0 without starting the MCP server. The bin read only its first argument, so the `mcp` word started the server and it waited on stdin.
- The `agentic-scaffold-mcp` usage line names the real bin. It said `agentic-pack-mcp`.

### Added

- Tests run the built mcp bin with the `mcp` forms of these flags and check the usage names `agentic-scaffold-mcp`.

## 0.1.3 - 2026-10-29

### Removed

- The Worker route `POST /summarize` is gone. Use `POST /api/v1/summarize` instead.
  The new route needs a bearer key. See the migration section in the
  [README](README.md#migration-worker-auth).

### Security

- The `zod` dependency is `^4.6.7`. zod 3.25.76 was below the fixed version for
  GHSA-mrhx-c7xc-m3w5, which allows memory exhaustion when validating oversized
  constrained collections. The package API is unchanged.
- `POST /api/v1/summarize` requires a bearer key with the `text:read` scope. A missing
  key gets 401, a missing scope gets 403, and a Worker with no `AUTH_TOKENS` secret gets
  503. Before, the route had no auth.

### Fixed

- The deployed Worker builds its Auth from the `AUTH_TOKENS` string secret. Before, a
  Cloudflare binding could not hold an Auth object, so a deployed Worker always answered
  503. The `AUTH` env field stays as a test seam.
- `mcp --help`, `-h`, `--version` and `-V` print and exit 0 for the cli and the mcp bin,
  without starting the server.

### Changed

- The publish workflow runs one publish at a time for each ref, so two runs cannot
  publish at once.
- The publish workflow also publishes to ants.land. It skips a version that is already
  there.
- The repository has a CI workflow (Node 22: typecheck, test, build) and a `ci:local`
  script.
