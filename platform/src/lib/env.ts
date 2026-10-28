// Central place for configuration. Everything optional has a safe local default
// so the platform runs on a laptop with zero accounts; production reads real keys.

const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined || v === "" ? fallback : ["1", "true", "yes", "on"].includes(v.toLowerCase());

const isProd = process.env.NODE_ENV === "production";

// Inside a GitHub Codespace the dev server is reached through a forwarded https URL.
const codespaceUrl = process.env.CODESPACE_NAME
  ? `https://${process.env.CODESPACE_NAME}-${process.env.PORT || "3000"}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev"}`
  : undefined;

export const env = {
  isProd,
  appUrl: (process.env.APP_URL || codespaceUrl || "http://localhost:3000").replace(/\/$/, ""),
  // Sites are served at <slug>.<ROOT_DOMAIN>. Leave empty to use /s/<slug> paths only.
  rootDomain: process.env.ROOT_DOMAIN ?? "",
  platformName: process.env.PLATFORM_NAME ?? "OneX",
  appSecret: process.env.APP_SECRET ?? "dev-only-secret-change-me-in-production-0000",
  databaseUrl: process.env.DATABASE_URL ?? "",
  pgliteDir: process.env.PGLITE_DIR ?? ".data/pglite",
  // Required (in production) to create the very first, platform-owner account:
  // open /signup?setup=<SETUP_TOKEN>. Nobody else can claim the owner seat.
  setupToken: process.env.SETUP_TOKEN ?? "",
  jobsInline: bool(process.env.JOBS_INLINE, !isProd),
  cronSecret: process.env.CRON_SECRET ?? "",
  skoolWebhookSecret: process.env.SKOOL_WEBHOOK_SECRET ?? "",

  aiModel: process.env.AI_MODEL ?? "claude-opus-5-5",
  aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),

  emailProvider: (process.env.EMAIL_PROVIDER ?? "console") as "console" | "postmark" | "resend",
  postmarkToken: process.env.POSTMARK_SERVER_TOKEN ?? "",
  resendKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM_ADDRESS ?? "hello@example.com",

  metaAppId: process.env.META_APP_ID ?? "",
  metaAppSecret: process.env.META_APP_SECRET ?? "",
  metaVerifyToken: process.env.META_VERIFY_TOKEN ?? "",
  metaGraphVersion: process.env.META_GRAPH_VERSION ?? "v23.0",
  metaLoginConfigId: process.env.META_LOGIN_CONFIG_ID ?? "",
  metaWaConfigId: process.env.META_WA_CONFIG_ID ?? "",

  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceGrowth: process.env.STRIPE_PRICE_GROWTH ?? "",
  stripePriceAgency: process.env.STRIPE_PRICE_AGENCY ?? "",

  vercelToken: process.env.VERCEL_TOKEN ?? "",
  vercelProjectId: process.env.VERCEL_PROJECT_ID ?? "",
  vercelTeamId: process.env.VERCEL_TEAM_ID ?? "",

  twilioSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioToken: process.env.TWILIO_AUTH_TOKEN ?? "",
};

export function assertProductionSecrets() {
  if (!env.isProd) return;
  const s = env.appSecret;
  if (s.startsWith("dev-only") || s.startsWith("change-me") || s.length < 32) {
    throw new Error("Set APP_SECRET to a random string of at least 32 characters (openssl rand -hex 32).");
  }
}
