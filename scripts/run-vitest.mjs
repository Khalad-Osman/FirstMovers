// Windows: running Vitest from a lowercase drive path (c:\ vs C:\) loads two
// copies of its runner and every suite fails. Start it from a normalized cwd.
import { spawnSync } from "node:child_process";

const cwd = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const bin = cwd + "/node_modules/vitest/vitest.mjs";
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(result.status ?? 1);
