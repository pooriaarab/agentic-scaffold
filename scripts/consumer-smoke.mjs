// Verify a packed release installs and loads beside the tested companion versions.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const dir = mkdtempSync(join(tmpdir(), "scaffold-consumer-"));
const env = { ...process.env, npm_config_legacy_peer_deps: "false", npm_config_force: "false" };
try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", dir], { encoding: "utf8", env }));
  writeFileSync(join(dir, "package.json"), '{"name":"consumer-smoke","private":true,"type":"module"}\n');
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund",
    join(dir, packed[0].filename),
    `agentic-identity@${lock.packages["node_modules/agentic-identity"].version}`,
    `agentic-design@${manifest.devDependencies["agentic-design"]}`,
    `agentic-realtime@${manifest.devDependencies["agentic-realtime"]}`,
  ], { cwd: dir, env, stdio: "inherit" });
  execFileSync("node", ["--input-type=module", "-e", `
    import { summarizeText } from 'agentic-scaffold';
    import { createMemoryAuth } from 'agentic-identity';
    import { contrastRatio } from 'agentic-design';
    import { AwarenessRelay } from 'agentic-realtime';
    if (typeof summarizeText !== 'function' || typeof createMemoryAuth !== 'function' ||
        typeof contrastRatio !== 'function' || typeof AwarenessRelay !== 'function') process.exit(1);
    console.log('Consumer package imports passed');
  `], { cwd: dir, env, stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
