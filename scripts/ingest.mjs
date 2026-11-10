// npm run ingest -- <source|all>
import { spawnSync } from "node:child_process";
const source = process.argv[2] || "all";
const cwd = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const r = spawnSync(process.execPath, [cwd + "/node_modules/vitest/vitest.mjs", "run", "--config", "vitest.ingest.config.ts", "--reporter", "verbose"], {
  cwd,
  stdio: "inherit",
  env: { ...process.env, INGEST_SOURCE: source },
});
process.exit(r.status ?? 1);
