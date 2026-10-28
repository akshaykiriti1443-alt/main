# OneX — the funnel, inbox and automation platform for Skool owners

OneX is a multi-tenant SaaS in the style of GoHighLevel, built for coaches and
Skool community owners. Members get an AI-built funnel on day one. Growth users
get one inbox for Instagram, Facebook, WhatsApp and SMS with AI lead scoring.
Agencies resell the whole platform under their own brand.

`OneX` is a working name. Set `PLATFORM_NAME` to rebrand everything.

## The three tiers

| Tier | Who | What they get |
|---|---|---|
| **Member** (included with Skool) | Every paying Skool member | AI launch kit (landing page, hosted lead magnet, 3 emails, ad copy, hooks, Skool About page, 7-day ad plan), landing pages with Meta Pixel + Conversions API, lead list, 3-email follow-up, AI ad review |
| **Growth** (monthly + usage) | Owners who sell daily | Everything above + unified inbox (Messenger, Instagram, WhatsApp, SMS), AI lead scoring and reply drafts, automations, email broadcasts, social planner, custom domains |
| **Agency** (monthly + usage) | Resellers | Unlimited client sub-accounts, white-label brand and app domain, templates ("snapshots"), resale pricing, agency wallet |

Usage beyond each plan's allowance (AI, emails, SMS, WhatsApp templates, phone
numbers) comes out of a prepaid wallet with your markup. See `src/server/pricing.ts`.

## How Skool access works

Skool has no API, so access is tied to a **monthly member code** that you post
inside the paid Skool classroom:

1. Members sign up at `/signup` with this month's code (or automatically when a
   Skool → Zapier "New Paid Member" zap posts their email to `/api/webhooks/skool`).
2. Each month they enter the new code (a banner reminds them 5 days early).
3. If access lapses, the workspace gets a **7-day grace period**, then **pauses**:
   pages go offline, automations and emails stop. Everything comes back when they
   enter a valid code.

The first account ever created becomes the platform owner and needs no code. In
production it also needs the setup link: `/signup?setup=<SETUP_TOKEN>`.

## Quick start (local, zero accounts needed)

```bash
cd platform
npm install
npm run dev
# open http://localhost:3000/signup  → the first user becomes platform owner
# (set SETUP_TOKEN in production; then use /signup?setup=<token>)
```

Locally the database is embedded Postgres (PGlite) in `.data/`, emails print to
the console and the launch kit uses a smart template until you add
`ANTHROPIC_API_KEY`. Copy `.env.example` to `.env.local` to configure more.

Create this month's member code: **Admin › Member codes**, or stop the dev server
and run `npm run db:seed`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 (jobs run inline) |
| `npm run build && npm start` | Production build and server |
| `npm test` | Unit/integration tests against an in-memory database |
| `npm run e2e` | Browser end-to-end test (run `npm run build` first) |
| `npm run db:generate` | Create a migration after editing `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (Postgres when `DATABASE_URL` is set) |
| `npm run db:seed` | Create this month's and next month's member codes |
| `npm run worker` | Tick background jobs every 30s on hosts without cron |

## Architecture

```
src/
  app/                 Next.js routes
    (auth)/            login, signup (member code), forgot, reset
    app/w/[wid]/       workspace dashboard: launch kit, funnels, leads, inbox,
                       emails, automations, social, ad review, billing, settings
    app/agency/[aid]/  agency tier: client accounts, templates, branding, wallet
    app/admin/         platform admin: codes, workspaces, agencies, jobs, templates
    s/[site]/…         public landing pages by slug
    d/[host]/…         public landing pages by custom domain
    api/               lead capture, unsubscribe, webhooks (Meta, Stripe,
                       Skool/Zapier, Twilio), cron tick, integrations
    legal/             privacy, terms, data deletion (needed for Meta review)
  actions/             server actions (every one checks workspace/agency access)
  components/          UI, landing page renderer, page editor, builders
  lib/                 db (Drizzle schema + client), crypto, env, helpers
  server/              domain services
    ai/                Claude: launch kit, lead scoring, reply drafts, ad review
    email/             providers (Postmark/Resend), sequences, broadcasts
    meta/              Graph API, OAuth, webhooks, Conversions API, publishing
    jobs/              Postgres-backed job queue
    …                  wallet, pricing, plans, access, inbox, automations,
                       social, domains, sms, billing/stripe, templates, agency
middleware.ts          routes hosts: app domain, <slug>.ROOT_DOMAIN, custom domains
drizzle/               SQL migrations
```

Key ideas:

- **Tenancy:** platform → agency → workspace. Every query is scoped by workspace.
  Platform members live under the built-in platform agency.
- **Jobs:** emails, Conversions API events, AI scoring, scheduled posts and
  webhook processing run through a `jobs` table with retries. Vercel Cron calls
  `/api/cron/tick` every minute.
- **One Meta app for everyone:** customers click "Connect", pick their Page and
  Instagram account, and DMs flow to `/api/webhooks/meta`. WhatsApp uses Meta's
  Embedded Signup (you must be a Meta Tech Provider).
- **AI:** Claude (`claude-opus-5-5` by default) with structured outputs and
  server-side refusal fallback on. Every AI feature has a rule-based fallback,
  so the product works without a key.

## Going live

Read [`docs/SETUP.md`](docs/SETUP.md) for the deploy steps and every
integration, [`docs/META_APP_REVIEW.md`](docs/META_APP_REVIEW.md) for the Meta
and WhatsApp approval checklist, and [`docs/ROADMAP.md`](docs/ROADMAP.md) for what
is built and what comes next.
