import { env } from "@/lib/env";
import { platformStats } from "@/server/admin";
import { metaConfigured } from "@/server/meta/graph";
import { smsConfigured } from "@/server/sms";
import { stripeConfigured } from "@/server/billing/stripe";
import { formatMoney } from "@/lib/util";
import { PageHead, Stat } from "@/components/ui";
import { CopyButton } from "@/components/client";

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="check-item">
      <span className={`dot${ok ? " done" : ""}`}>{ok ? "✓" : ""}</span>
      <div><strong className="small">{label}</strong><div className="tiny muted">{hint}</div></div>
      <span className={`badge ${ok ? "badge-good" : "badge-warm"}`}>{ok ? "Ready" : "To do"}</span>
    </div>
  );
}

export default async function AdminHome() {
  const s = await platformStats();
  const margin = s.usageRevenue30d - s.usageCost30d;
  const urls = [
    ["Meta webhook (Messenger, Instagram, WhatsApp)", `${env.appUrl}/api/webhooks/meta`],
    ["Meta OAuth redirect URI", `${env.appUrl}/api/integrations/meta/callback`],
    ["Stripe webhook", `${env.appUrl}/api/webhooks/stripe`],
    ["Skool → Zapier 'New Paid Member' webhook", `${env.appUrl}/api/webhooks/skool?secret=${env.skoolWebhookSecret ? "<SKOOL_WEBHOOK_SECRET>" : "(set SKOOL_WEBHOOK_SECRET)"}`],
    ["Twilio SMS webhook", `${env.appUrl}/api/webhooks/twilio`],
    ["Cron (every minute)", `${env.appUrl}/api/cron/tick`],
  ];
  return (
    <>
      <PageHead title="Platform overview" sub="Your SaaS at a glance." />
      <div className="grid-4">
        <Stat label="Workspaces" value={s.workspaces} hint={`${s.active} active · ${s.grace} grace · ${s.paused} paused`} />
        <Stat label="Growth plans" value={s.growth} hint={`${s.activeSubs} active subscriptions`} />
        <Stat label="Agencies" value={s.agencies} />
        <Stat label="Usage revenue (30d)" value={formatMoney(s.usageRevenue30d)} hint={`Est. margin ${formatMoney(margin)}`} />
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h2>Setup checklist</h2></div>
          <div className="checklist">
            <Check ok={Boolean(env.databaseUrl)} label="Production database" hint="DATABASE_URL (Postgres: Supabase, Neon…). Without it, data lives in a local folder." />
            <Check ok={env.aiEnabled} label="AI copy and scoring" hint="ANTHROPIC_API_KEY" />
            <Check ok={env.emailProvider !== "console"} label="Email sending" hint="EMAIL_PROVIDER=postmark or resend + key + EMAIL_FROM_ADDRESS" />
            <Check ok={stripeConfigured()} label="Payments" hint="STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_GROWTH, STRIPE_PRICE_AGENCY" />
            <Check ok={metaConfigured()} label="Meta app (Instagram, Messenger)" hint="META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN + App Review" />
            <Check ok={Boolean(env.metaWaConfigId)} label="WhatsApp Embedded Signup" hint="META_WA_CONFIG_ID after Tech Provider onboarding" />
            <Check ok={smsConfigured()} label="SMS" hint="TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN" />
            <Check ok={Boolean(env.cronSecret)} label="Background jobs" hint="CRON_SECRET + Vercel Cron hitting /api/cron/tick" />
            <Check ok={Boolean(env.skoolWebhookSecret)} label="Skool → Zapier auto-approval" hint="SKOOL_WEBHOOK_SECRET" />
            <Check ok={!env.appSecret.startsWith("dev-only")} label="App secret" hint="APP_SECRET (long random string)" />
          </div>
        </div>
        <div className="card stack">
          <h2>Your webhook URLs</h2>
          {urls.map(([label, url]) => (
            <div key={label} className="stack" style={{ gap: 4 }}>
              <span className="small"><strong>{label}</strong></span>
              <div className="copy-block mono tiny"><CopyButton text={url} />{url}</div>
            </div>
          ))}
          <p className="tiny muted">Jobs: {s.pendingJobs} pending · {s.failedJobs} failed.</p>
        </div>
      </div>
    </>
  );
}
