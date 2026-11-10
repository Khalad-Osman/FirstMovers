import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Run via `npm test` (scripts/run-vitest.mjs) on Windows; see that file.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
