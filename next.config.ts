import type { NextConfig } from "next";

// cacheComponents / partialPrefetching are deliberately off: every page is
// session-gated and must show fresh data (briefs, watchlist). Revisit later.
const nextConfig: NextConfig = {
  // The analysis prompt reads these files at runtime (lib/analysis/prompt.ts).
  outputFileTracingIncludes: {
    "/**": ["./docs/intelligence-model.md", "./docs/analysis-rules.md"],
  },
  experimental: {
    serverActions: {
      // Past-deal PDFs (lib/deals/extract.ts, max 3 MB); Vercel caps bodies at ~4.5 MB.
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
