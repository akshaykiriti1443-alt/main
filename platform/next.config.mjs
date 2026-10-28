// Inside a GitHub Codespace the browser reaches the dev server through a forwarded
// https URL, so server actions must accept that origin (and only that one).
const codespaceOrigin = process.env.CODESPACE_NAME
  ? `${process.env.CODESPACE_NAME}-${process.env.PORT || "3000"}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev"}`
  : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite ships WASM + data files that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "2mb", ...(codespaceOrigin ? { allowedOrigins: [codespaceOrigin] } : {}) },
  },
};

export default nextConfig;
