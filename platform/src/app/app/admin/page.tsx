import { BoxesIcon, Building2Icon, CheckIcon, CoinsIcon, GlobeIcon, ListChecksIcon, TrendingUpIcon, WebhookIcon } from "lucide-react";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/client";
import { getDomainAffiliate } from "@/server/domainAffiliate";
import { removeDomainAffiliateAction, saveDomainAffiliateAction } from "@/actions/domainAffiliate";
import { domainClicks } from "@/server/admin";

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-center gap-3.5 px-6 py-3">
      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border border-border-strong", ok && "border-success bg-success text-white dark:text-background")}>
        {ok ? <CheckIcon className="size-3" strokeWidth={3} aria-hidden /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs break-words text-muted-foreground">{hint}</div>
      </div>
      <Badge variant={ok ? "success" : "warning"}>{ok ? "Ready" : "To do"}</Badge>
    </li>
  );
}

export default async function AdminHome() {
  await requirePlatformAdmin();
  const [s, affiliate, clicks] = await Promise.all([platformStats(), getDomainAffiliate(), domainClicks(30)]);
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
      <PageHead eyebrow="Platform admin" title="Platform overview" sub="Your SaaS at a glance: who's on it, what it earns, and what's left to set up." />
      <div className="grid grid-cols-2 gap-4 @4xl/main:grid-cols-4">
        <Stat icon={BoxesIcon} label="Workspaces" value={s.workspaces} hint={`${s.active} active · ${s.grace} grace · ${s.paused} paused`} />
        <Stat icon={TrendingUpIcon} tone="success" label="Growth plans" value={s.growth} hint={`${s.activeSubs} active subscriptions`} />
        <Stat icon={Building2Icon} tone="muted" label="Agencies" value={s.agencies} />
        <Stat icon={CoinsIcon} tone="gold" label="Usage revenue (30d)" value={formatMoney(s.usageRevenue30d)} hint={`Est. margin ${formatMoney(margin)}`} />
      </div>
      <div className="grid items-start gap-6 @5xl/main:grid-cols-2">
        <Panel icon={ListChecksIcon} className="min-w-0" title="Setup checklist" sub="Each one turns on a part of the product for every member.">
          <ul className="-mx-6 -mb-6 flex flex-col divide-y divide-border/80 border-t border-border/80">
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
            <Check ok={Boolean(affiliate)} label="Domain affiliate link" hint="Below: members buy domains through your link and you earn the commission" />
          </ul>
        </Panel>
        <Panel icon={WebhookIcon} tone="muted" className="min-w-0" title="Your webhook URLs" sub="Paste these into Meta, Stripe, Zapier and Twilio.">
          {urls.map(([label, url]) => (
            <div key={label} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{label}</span>
              <div className="flex items-start gap-2 rounded-xl bg-muted/50 py-2 pr-2 pl-3.5 ring-1 ring-ink/[0.04] ring-inset dark:ring-white/[0.05]">
                <code className="min-w-0 flex-1 self-center font-mono text-xs break-all">{url}</code>
                <CopyButton text={url} />
              </div>
            </div>
          ))}
          <p className="text-xs text-subtle-foreground tabular-nums">
            Jobs: {s.pendingJobs} pending · {s.failedJobs} failed.
          </p>
        </Panel>
      </div>
      <Panel
        id="domain-affiliate"
        icon={GlobeIcon}
        tone="gold"
        className="scroll-mt-24"
        title="Get a domain (your affiliate link)"
        sub="Members see a 'Get a domain' search on every funnel's page. It opens your domain partner through your affiliate link, so you earn the commission. Add {domain} where the partner's link takes a search term, and the member's search is filled in for them."
      >
        <form action={saveDomainAffiliateAction} className="flex flex-col gap-3">
          <div className="grid gap-4 @2xl/main:grid-cols-[1fr_14rem]">
            <Field>
              <FieldLabel htmlFor="aff-url">Affiliate link</FieldLabel>
              <Input id="aff-url" name="url" type="url" required defaultValue={affiliate?.url ?? ""} placeholder="https://www.namecheap.com/domains/registration/results/?domain={domain}&affId=…" />
              <FieldDescription>From your Namecheap, Hostinger or GoDaddy affiliate dashboard.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="aff-partner">Partner name</FieldLabel>
              <Input id="aff-partner" name="partner" defaultValue={affiliate?.partner ?? ""} placeholder="Namecheap" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText="Saving…">{affiliate ? "Update link" : "Save link"}</SubmitButton>
            <span className="text-xs text-muted-foreground">{clicks} member clicks in the last 30 days.</span>
          </div>
        </form>
        {affiliate ? (
          <form action={removeDomainAffiliateAction}>
            <SubmitButton variant="ghost" size="sm" className="text-destructive" confirm="Yes, remove">
              Remove link
            </SubmitButton>
          </form>
        ) : null}
      </Panel>
    </>
  );
}
