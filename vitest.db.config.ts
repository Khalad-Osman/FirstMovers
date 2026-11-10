import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

// Integration tests against the LOCAL Supabase stack: npm run test:db
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.db.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    env: loadEnv("", root, ""),
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
