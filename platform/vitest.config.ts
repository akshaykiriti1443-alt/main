import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    env: { PGLITE_DIR: "memory", JOBS_INLINE: "0", APP_URL: "http://localhost:3000", EMAIL_PROVIDER: "console", META_APP_SECRET: "test-meta-secret", STRIPE_WEBHOOK_SECRET: "whsec_test", TWILIO_AUTH_TOKEN: "twilio-test-token", TWILIO_ACCOUNT_SID: "AC_test" },
  },
});
