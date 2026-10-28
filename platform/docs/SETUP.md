# Going live: setup guide

Do these in order. Each step says what you get when it's done. You can launch
the Member tier after steps 1–5 and add the rest later.

Time needed: about 2 hours of setup, plus waiting time for Meta approvals.

---

## 1. Database (Supabase or Neon) — 10 minutes

1. Create a Postgres project (Supabase or Neon both work).
2. Copy the **pooled** connection string. On Supabase use the "Transaction pooler"
   string (port 6543). The app already turns off prepared statements for poolers.
3. Save it as `DATABASE_URL`.

You get: a real database. Migrations run on every deploy (`vercel.json` runs
`npm run db:migrate` before the build).

## 2. Deploy on Vercel — 15 minutes

1. Import the GitHub repo in Vercel.
2. Set **Root Directory** to `platform`. Framework: Next.js.
3. Add environment variables (see `.env.example`). The minimum:
   - `APP_URL` = `https://app.yourdomain.com`
   - `PLATFORM_NAME` = your brand
   - `APP_SECRET` = a long random string (run `openssl rand -hex 32`). **Never change it later**: it encrypts saved tokens and signs links.
   - `SETUP_TOKEN` = a random string. Only you know it.
   - `DATABASE_URL`
   - `CRON_SECRET` = another random string
4. Deploy. Open `https://app.yourdomain.com/signup?setup=<SETUP_TOKEN>`. This first account becomes the
   platform owner. Nobody else can claim it without the token.

**Cron:** `vercel.json` calls `/api/cron/tick` every minute. Per-minute crons need a
Vercel Pro plan. On other hosts, run `npm run worker` as a separate process.

**Timeouts:** AI launch kits can take up to a minute. The launch kit and ad review
pages allow 300 seconds. Keep Fluid Compute on (Vercel default).

## 3. Your domains — 15 minutes

- **App:** add `app.yourdomain.com` to the Vercel project.
- **Member sites at `<slug>.yourdomain.com`** (optional): add the wildcard domain
  `*.yourdomain.com` in Vercel (needs Vercel nameservers), then set
  `ROOT_DOMAIN=yourdomain.com`. Without it, sites live at `https://app.yourdomain.com/s/<slug>`.
- **Customers' own domains** (Growth plan): create a Vercel access token and set
  `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` and `VERCEL_TEAM_ID` (if the project is in a team).
  Customers type their domain in the funnel settings; the app adds it to your Vercel
  project and shows them the DNS record. Verification runs in the background.
- **Agency white-label app domains:** agencies on the Agency plan enter
  `app.theiragency.com` in Branding. The app adds it to your Vercel project and
  checks DNS in the background. Once it shows **Verified**, their clients log in
  at `https://app.theiragency.com/login` and see only the agency brand.

## 4. Email sending (Postmark or Resend) — 20 minutes

1. Create an account and verify your sending domain (add the DKIM and Return-Path DNS records they give you).
2. Set `EMAIL_PROVIDER=postmark` (or `resend`), the API key
   (`POSTMARK_SERVER_TOKEN` or `RESEND_API_KEY`) and `EMAIL_FROM_ADDRESS`.
3. Postmark only: broadcasts use the `broadcast` message stream. New Postmark
   servers include it; otherwise create a broadcast stream and set `POSTMARK_BROADCAST_STREAM`.

Every email has an unsubscribe link and one-click unsubscribe headers. Emails go
out as "Business Name <your from address>" with the member's reply-to.

## 5. AI (Anthropic) — 5 minutes

1. Create an API key at console.anthropic.com.
2. Set `ANTHROPIC_API_KEY`. Optional: `AI_MODEL` (default `claude-opus-5-5`).

You get: AI-written launch kits, lead scores, reply drafts and ad reviews. Server-side
refusal fallback is on, so a declined request retries on Anthropic's recommended
fallback model. Real AI cost is recorded next to what you bill, so the admin page shows margin.

## 6. Skool access — 10 minutes + 5 minutes a month

**Monthly code (works on any Skool plan):**

1. Admin › Member codes › create a code. Codes overlap the next month by 7 days.
2. Post the code (and the signup link the page gives you) in your Skool
   "Start Here" lesson. Only paying members can see it.
3. Each month, create the next code before the 1st. `npm run db:seed` makes this
   month's and next month's codes for you.

**Automatic approval (needs Skool's Zapier plugin):**

1. In Skool: Settings › Plugins › Zapier › copy the API key.
2. In Zapier: Trigger = Skool › **New Paid Member**. Action = Webhooks by Zapier › POST.
3. URL: `https://app.yourdomain.com/api/webhooks/skool?secret=<SKOOL_WEBHOOK_SECRET>`.
   Payload type JSON, data: `email` = member email, `name` = member name.
4. Set `SKOOL_WEBHOOK_SECRET` in Vercel.

New paid members can then sign up with no code, and existing members get 35 days
of access added. Monthly codes still handle renewals, because Zapier has no
"member cancelled" trigger.

## 7. Payments (Stripe) — 20 minutes

1. Create two products with monthly prices: **Growth** and **Agency**. Copy the price IDs.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_AGENCY`.
3. Add a webhook endpoint: `https://app.yourdomain.com/api/webhooks/stripe` with events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

You get: Growth upgrades, Agency plans and wallet top-ups. Top-ups are idempotent
(a repeated webhook never double-credits). Until Stripe is set up, you can grant
plans and wallet credit by hand in Admin.

## 8. Meta: Instagram, Messenger and Conversions API — 1 hour + review time

Full checklist: [`META_APP_REVIEW.md`](META_APP_REVIEW.md). Short version:

1. developers.facebook.com › Create app › type **Business**. Connect it to your
   verified Business Portfolio.
2. Add products: **Facebook Login for Business**, **Messenger**, **Instagram**
   (Instagram API with Facebook Login), **Webhooks**.
3. App settings › Basic: add the Privacy Policy URL
   (`https://app.yourdomain.com/legal/privacy`), Terms URL and Data Deletion URL
   (`https://app.yourdomain.com/legal/data-deletion`). Edit those template pages first.
4. Facebook Login › Settings: add the redirect URI
   `https://app.yourdomain.com/api/integrations/meta/callback`.
5. Webhooks: callback URL `https://app.yourdomain.com/api/webhooks/meta`, verify
   token = `META_VERIFY_TOKEN`. Subscribe:
   - **Page**: `messages`, `messaging_postbacks`, `message_echoes`
   - **Instagram**: `messages`, `messaging_postbacks`
6. Set `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`. Optional:
   `META_LOGIN_CONFIG_ID` if you create a Facebook Login for Business configuration.
7. Submit App Review for Advanced Access (see the checklist).

Until review passes, only people with a role on your app (admins, developers,
testers) can connect accounts. That is why it works for your own account today.

**Conversions API** needs no app review. Each member pastes their Pixel ID and a
Conversions API token (Events Manager › Settings › Generate access token) in Settings.

## 9. WhatsApp — after Meta review

1. Become a **Meta Tech Provider**: business verification, App Review for
   `whatsapp_business_management` and `whatsapp_business_messaging`, then access verification.
2. Add the **WhatsApp** product to your app and subscribe the webhook field `messages`
   (same callback URL as above).
3. Facebook Login for Business › Configurations › create a configuration with the
   **WhatsApp Embedded Signup** variation. Copy its ID into `META_WA_CONFIG_ID`.
4. Add your app domain to the JavaScript SDK allowed domains in Facebook Login settings.

Customers then click **Connect WhatsApp** in Settings and finish in Meta's popup.
As a Tech Provider, each customer pays Meta's WhatsApp fees with their own card.
To bill those fees yourself with a markup, apply to become a Solution Partner, or
resell through a partner such as Twilio or 360dialog.

## 10. SMS (Twilio) — optional

1. Set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
2. Growth users can search and buy numbers in Settings. The first month is charged
   to their wallet; renewals bill monthly from the cron.
3. US texting needs **A2P 10DLC** registration (one brand and campaign per sending
   business) before carriers deliver at volume. Register in the Twilio console.

## Before launch checklist

- [ ] Edit `/legal/privacy`, `/legal/terms` and `/legal/data-deletion` for your business (have a lawyer check them).
- [ ] Check prices in `src/server/pricing.ts` against your real provider bills.
- [ ] Set allowances per plan in `src/server/plans.ts`.
- [ ] Create this month's member code and post it in Skool.
- [ ] Run one real lead through your own funnel and check the Conversions API event in Events Manager › Test events.
- [ ] Add basic rate limiting at the edge (Vercel Firewall rules on `/api/public/lead`).
