import type { NextConfig } from "next";

// cacheComponents / partialPrefetching are deliberately off: every page is
// session-gated and must show fresh data (briefs, watchlist). Revisit later.
const nextConfig: NextConfig = {
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
