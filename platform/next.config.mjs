// Inside a GitHub Codespace the browser reaches the dev server through a forwarded
// https URL, so server actions must accept that origin (and only that one).
const codespaceOrigin = process.env.CODESPACE_NAME
  ? `${process.env.CODESPACE_NAME}-${process.env.PORT || "3000"}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev"}`
  : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a second dev server run beside the first (NEXT_DIST_DIR=.next-demo).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // PGlite ships WASM + data files that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // The Skool cover and carousel routes read their bundled fonts from disk; make sure they ship with the functions.
  outputFileTracingIncludes: { "/api/skool-cover": ["./src/server/cover/fonts/*.ttf"], "/api/carousel": ["./src/server/cover/fonts/*.ttf"] },
  // Local preview of the marketing host: MARKETING_HOSTS=scaleitads.localhost -> http://scaleitads.localhost:3000
  allowedDevOrigins: ["*.localhost"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb", ...(codespaceOrigin ? { allowedOrigins: [codespaceOrigin] } : {}) },
  },
};

export default nextConfig;
