# What's built and what's next

## Built and tested

**Platform**
- Multi-tenant model: platform → agencies → workspaces, with role checks on every action
- Email/password auth, sessions, password reset links, invite links
- Skool access: monthly member codes, Zapier auto-approval, 7-day grace, auto-pause
- Postgres-backed job queue with retries, cron tick, maintenance
- Pay-as-you-go wallet with monthly allowances, idempotent top-ups, usage ledger with real cost
- Stripe Checkout for Growth and Agency plans and wallet top-ups, signed webhooks
- Platform admin: member codes, workspaces, agencies, wallets, jobs, webhooks, templates, setup checklist

**Member tier**
- AI launch kit: landing page, hosted lead magnet, thank-you page, 3 emails, 3 ads, 10 hooks, Skool About page, 7-day ad plan
- Funnel builder with 8 section types and a live-preview editor; publish/unpublish; 3 themes
- Public pages on slugs, subdomains or custom domains; SEO metadata
- Lead capture with honeypot, UTM capture, Meta Pixel (PageView + Lead) and Conversions API with de-duplication
- Leads list, filters, tags, pipeline stages, notes, timeline
- Email sequences (default 3-email follow-up), unsubscribe + one-click headers, Postmark/Resend
- Dashboard with 14-day chart and 7-day sprint checklist
- AI ad review ("custom plan") with rule-based fallback

**Growth tier**
- Unified inbox for Messenger, Instagram, WhatsApp and SMS; hot leads first; AI reply drafts
- AI lead scoring (hot/warm/cold with a reason) with a rules fallback
- Automations: 5 triggers, 12 actions, waits, conditions, recipes, run logs
- Email broadcasts with audience filters and scheduling
- Social planner for Instagram and Facebook Pages
- Custom domains via the Vercel API
- Twilio SMS numbers: search, buy, monthly billing, inbound webhook

**Agency tier**
- Agency creation, plan activation, agency wallet that pays for client usage
- Client sub-accounts from templates, with emailed invites
- Templates ("snapshots") of funnels, sequences and automations
- White-label brand (name, logo, color) and app domain; resale price table

**Quality**
- 17 integration tests (`npm test`) and a 16-step browser E2E (`npm run e2e`)

## Next (in priority order)

1. **Rate limiting and abuse controls** on public lead forms and signups.
2. **WhatsApp template messages** (send approved templates outside the 24-hour window; template sync).
3. **Team members**: invite staff to a workspace with roles (the data model supports it; UI needed).
4. **Calendars and booking pages** (Google Calendar sync) for sales calls.
5. **Stripe Connect rebilling** so agencies charge their clients directly with automatic markup.
6. **Domain purchase** through a registrar API, charged to the wallet.
7. **A2P 10DLC registration flow** inside the app for US SMS.
8. **Inbound email in the inbox** (Postmark inbound webhook) and email open/click tracking.
9. **Automation branches** (if/else paths), date-based triggers and "form submitted" triggers.
10. **Forms and surveys builder**, checkout/order pages and payment links.
11. **TikTok and LinkedIn posting** in the social planner (each needs its own app review).
12. **Reviews/reputation, call tracking and a mobile app** for full GoHighLevel parity.

## Known limits

- Monthly codes are the renewal check, because Skool's Zapier app has no cancel trigger.
- Instagram publishing supports single images (no Reels/carousels yet).
- The page editor is section-based, not free-form drag and drop.
- PGlite (local mode) is single-process; use Postgres in production.
