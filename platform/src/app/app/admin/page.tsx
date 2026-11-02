import { BoxesIcon, Building2Icon, CheckIcon, CoinsIcon, TrendingUpIcon } from "lucide-react";
import { requirePlatformAdmin } from "@/server/auth";
import { env } from "@/lib/env";
import { platformStats } from "@/server/admin";
import { metaConfigured } from "@/server/meta/graph";
import { smsConfigured } from "@/server/sms";
import { stripeConfigured } from "@/server/billing/stripe";
import { formatMoney } from "@/lib/util";
import { cn } from "@/lib/utils";
import { PageHead, Panel, Stat } from "@/components/ui";
import { CopyButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", ok && "border-success bg-success text-background")}>
        {ok ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs break-words text-muted-foreground">{hint}</div>
      </div>
      <Badge variant="secondary" className={ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}>
        {ok ? "Ready" : "To do"}
      </Badge>
    </li>
  );
}

export default async function AdminHome() {
  await requirePlatformAdmin();
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
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat icon={BoxesIcon} label="Workspaces" value={s.workspaces} hint={`${s.active} active · ${s.grace} grace · ${s.paused} paused`} />
        <Stat icon={TrendingUpIcon} label="Growth plans" value={s.growth} hint={`${s.activeSubs} active subscriptions`} />
        <Stat icon={Building2Icon} label="Agencies" value={s.agencies} />
        <Stat icon={CoinsIcon} label="Usage revenue (30d)" value={formatMoney(s.usageRevenue30d)} hint={`Est. margin ${formatMoney(margin)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="min-w-0" title="Setup checklist">
          <ul className="flex flex-col">
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
          </ul>
        </Panel>
        <Panel className="min-w-0" title="Your webhook URLs">
          {urls.map(([label, url]) => (
            <div key={label} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{label}</span>
              <div className="flex items-start gap-2 rounded-lg border bg-muted/60 py-2 pr-2 pl-3">
                <code className="min-w-0 flex-1 self-center font-mono text-xs break-all">{url}</code>
                <CopyButton text={url} />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Jobs: {s.pendingJobs} pending · {s.failedJobs} failed.
          </p>
        </Panel>
      </div>
    </>
  );
}
