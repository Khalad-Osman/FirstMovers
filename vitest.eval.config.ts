import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

// Live evaluation config (spends LLM credits): npm run eval:analysis
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.eval.ts"],
    exclude: ["node_modules/**", ".next/**"],
    env: loadEnv("", root, ""), // .env, .env.local
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
