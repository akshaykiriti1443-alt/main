# Deploying ScaleitAds + OneX (Vercel + Neon)

One Next.js app serves everything. Which site a visitor sees depends on the hostname
(`src/middleware.ts`, rules in `src/lib/hostRouting.ts`):

| Address | What it serves |
|---|---|
| `scaleitads.com` | The ScaleitAds agency site: `/` (home), `/watch`, `/privacy`, `/terms`, and the booking funnel `/apply`, `/booked`, `/not-yet`. Plus `/skool`, the Skool Growth Program page. |
| `www.scaleitads.com` | 308 redirect to `scaleitads.com` (same path and query). |
| `app.scaleitads.com` | The app ("OneX by ScaleitAds"). `/` opens `/app`, which sends logged-out visitors to `/login`. Agency pages redirect to `scaleitads.com`. |
| `<slug>.scaleitads.com` (optional) | Members' sites, if you set `ROOT_DOMAIN=scaleitads.com` and add the wildcard below. |
| Members' own domains | Their sites, exactly as before. |

App paths (`/app`, `/login`, `/signup`, `/join`, `/api/...`) also keep working on `scaleitads.com`, so
webhooks you already registered on either host don't break.

---

## 1. Neon (the database)

1. Sign up at https://neon.tech and create a project. Pick the region closest to your customers
   (or the one you'll pick for Vercel functions in step 2; they must match). Postgres 16 or 17.
2. In the project's **Connection details**, turn on **Pooled connection** and copy the string.
   It looks like `postgres://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`.
   That's your `DATABASE_URL`. (The app already uses `prepare: false`, which the pooler needs.)
3. Shortcut: Vercel › your project › **Storage › Connect Database › Neon** creates the database and
   sets `DATABASE_URL` for you.

Migrations run on every deploy (`vercel.json`: `npm run db:migrate && next build`). If a migration
ever fails through the pooler, put Neon's **direct** (non-pooler) string in `DATABASE_URL` for that
deploy, then switch back.

## 2. Vercel (the hosting)

1. https://vercel.com › **Add New › Project** › import the GitHub repo.
2. **Root Directory: `platform`** (the repo root is `onex/`). Framework: Next.js. Leave the build
   command alone (it comes from `vercel.json`). Node.js 20 or newer.
3. **Settings › Functions › Function Region**: the same region as your Neon database.
4. Add the environment variables below (**Settings › Environment Variables**, Production), then
   deploy. Check `https://<project>.vercel.app/api/health` before touching DNS.
5. Create your owner account once: open `https://app.scaleitads.com/signup?setup=<SETUP_TOKEN>`.

### Environment variables

Required ones are marked ●. Everything else is optional and switches a feature on.

| Variable | Value / where to get it |
|---|---|
| ● `APP_URL` | `https://app.scaleitads.com` (no trailing slash). |
| ● `MARKETING_HOSTS` | `scaleitads.com,www.scaleitads.com` |
| ● `APP_SECRET` | 64 random characters: `openssl rand -hex 32`. Signs sessions and encrypts tokens. **Never change it after launch.** |
| ● `SETUP_TOKEN` | Any random string. Used once: `/signup?setup=<this>` creates the owner account. |
| ● `DATABASE_URL` | Neon pooled connection string (step 1). |
| ● `CRON_SECRET` | Random string (`openssl rand -hex 24`). See "Background jobs" below. |
| ● `EMAIL_PROVIDER` | `postmark` or `resend` (`console` only logs). |
| ● `EMAIL_FROM_ADDRESS` | e.g. `hello@scaleitads.com`. Must be a verified sender in Postmark/Resend (add their DNS records). |
| `EMAIL_REPLY_TO` | Optional. A real inbox (e.g. `hello@scaleitads.com`) for replies and the legal-page contact, so the From address needs no mailbox. Defaults to `EMAIL_FROM_ADDRESS`. |
| `POSTMARK_SERVER_TOKEN` / `POSTMARK_BROADCAST_STREAM` | Postmark › Server › API Tokens; the broadcast stream ID (default `broadcast`). |
| `RESEND_API_KEY` | resend.com › API Keys. |
| `PLATFORM_NAME` | `OneX` (default). |
| `PLATFORM_BY` / `PLATFORM_BY_URL` | Default `ScaleitAds` / `https://scaleitads.com`: the "OneX by ScaleitAds" attribution. Set `PLATFORM_BY=` (empty) to hide it. Never shown on agencies' white-label screens. |
| `ROOT_DOMAIN` | `scaleitads.com` only if you want members' sites at `<slug>.scaleitads.com` (needs the wildcard DNS below). Leave empty to use `/s/<slug>` paths. |
| `APP_HOSTS` | Extra hostnames that should serve the dashboard (comma-separated). Usually empty. |
| `SCALEITADS_WORKSPACE`, `SCALEITADS_CALENDAR` | Moves `/apply` off GoHighLevel (section 5, "Booking"). The two slugs in your calendar's booking link `…/b/<workspace>/<calendar>`. Unset (or not matching an open calendar): `/apply` keeps the GoHighLevel webhook and calendar. |
| `SKOOL_GROUP_URL` | `https://www.skool.com/0-to-1x-academy-9129/about` (also the "Start your free trial" button on `/skool`). |
| `SKOOL_WEBHOOK_SECRET` | Random string. Zapier "Skool › New Paid Member" posts to `https://app.scaleitads.com/api/webhooks/skool?secret=<this>`. |
| `SKOOL_INVITE_WEBHOOK_URL` | Optional Zapier catch hook that invites `/join` buyers into Skool. |
| `WELCOME_ACCESS_DAYS` | Days a new signup can use the app before membership is confirmed (default 3, 0 = off). |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | console.anthropic.com › API Keys (members can also bring their own AI). |
| `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `META_LOGIN_CONFIG_ID`, `META_WA_CONFIG_ID` | developers.facebook.com › your app › Settings › Basic (ID, secret); the verify token is any string you also paste in the app's Webhooks settings; the config IDs come from Facebook Login for Business and WhatsApp Embedded Signup. |
| `META_AD_LIBRARY_TOKEN` | A user token from an identity-confirmed account with Ad Library API access (facebook.com/ads/library/api). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | dashboard.stripe.com › Developers › API keys; Webhooks › add `https://app.scaleitads.com/api/webhooks/stripe` › signing secret. |
| `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_AGENCY`, `STRIPE_PRICE_MEMBER`, `MEMBER_PRICE_LABEL` | Stripe › Products › each recurring price's `price_...` ID; the label shown on `/join`. |
| `DOMAIN_AFFILIATE_URL`, `DOMAIN_AFFILIATE_PARTNER` | Your registrar affiliate link with `{domain}` placeholder (can also be set in Admin). |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | So the app can attach members' custom domains: vercel.com › Account Settings › Tokens; Project › Settings › General (Project ID); Team › Settings (Team ID). |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | console.twilio.com (SMS). |
| `DB_POOL_MAX` | Postgres connections per function instance (default 5). |
| `JOBS_INLINE` | Leave unset in production (jobs run from the cron). |

## 3. DNS for scaleitads.com

Today the domain uses **Namecheap BasicDNS** (`dns1/dns2.registrar-servers.com`):
`scaleitads.com` → `A 162.159.140.166` and `www` → `CNAME sites.ludicrous.cloud` (both GoHighLevel),
`link` → `CNAME brand.ludicrous.cloud` (GoHighLevel's branded links: the booking calendar),
email on Namecheap Private Email (`MX mx1/mx2.privateemail.com`, SPF, DMARC).

A day before switching, lower the TTL of the records you'll change to 5 minutes.

In Vercel › Project › **Settings › Domains**, add `scaleitads.com`, `www.scaleitads.com` and
`app.scaleitads.com`. Vercel then shows the exact records to create; use its values if they differ
from these (the usual ones):

| Host (Namecheap › Advanced DNS) | Type | Value |
|---|---|---|
| `@` | A | `76.76.21.21` (replaces `162.159.140.166`) |
| `www` | CNAME | `cname.vercel-dns.com.` (replaces `sites.ludicrous.cloud`) |
| `app` | CNAME | `cname.vercel-dns.com.` (new) |
| `link` | CNAME | keep `brand.ludicrous.cloud` while `/apply` still uses the GoHighLevel calendar |
| MX / SPF / DMARC | | keep as they are (email doesn't move) |

The www → apex redirect is done by the app (any setting works in Vercel; don't make Vercel redirect
the apex to www).

**Optional: members' sites at `<slug>.scaleitads.com`.** Vercel can only issue a certificate for
`*.scaleitads.com` when it runs the domain's DNS. Switch the nameservers at Namecheap to
`ns1.vercel-dns.com` and `ns2.vercel-dns.com`, recreate every record above in Vercel › Domains ›
`scaleitads.com` › DNS records (**the MX, SPF, DMARC and `link` records too, or email and the
calendar stop**), add `*.scaleitads.com` to the project, and set `ROOT_DOMAIN=scaleitads.com`.
`app.` and `www.` always serve the app and the agency site, never a member's site, and the
explicit `link` record keeps winning over the wildcard. Without the wildcard, members'
sites still work at `app.scaleitads.com/s/<slug>` and on their own domains.

## 4. Background jobs (the cron caveat)

`vercel.json` asks Vercel Cron to call `/api/cron/tick` **once a day** (06:00 UTC), because the
Hobby plan allows nothing more often. Emails, sequences and automations need it **every minute**:

- **Vercel Pro:** change the schedule in `vercel.json` to `* * * * *`.
- **Vercel Hobby (today):** keep the daily entry, and add an external scheduler that
  calls `GET https://app.scaleitads.com/api/cron/tick` every minute with the header
  `Authorization: Bearer <CRON_SECRET>`: e.g. cron-job.org (free, supports custom headers),
  Upstash QStash, or a GitHub Actions `schedule` workflow. Without a header the route answers 401.

## 5. Leaving GoHighLevel: the cut-over checklist

Do these **before** you point the DNS at Vercel. Rebuilt and self-hosted already: the home page,
`/watch`, `/privacy`, `/terms`, `/apply`, `/booked`, `/not-yet`, every image, the four result
recordings on the home page, the cookie banner, the Meta Pixel (`1998614557493094`) and Microsoft
Clarity (`yv15rrv82j`).

**Must move (still on GoHighLevel):**

- [ ] **The 5-minute video** (on `/watch` and `/not-yet`):
      `https://assets.cdn.filesafe.space/MZy9LUdfAB1KoJXc5Nfe/media/6ac946ff4770fb500bbf7cac.mp4`
      (MP4, 1280×720, 29.4 MB; poster already re-hosted). Upload it to Bunny Stream (best: it gives
      an iframe player and a direct MP4/HLS URL), Vimeo, or YouTube (unlisted), then edit
      `WATCH_VIDEO` in `src/app/(scaleitads)/_site/config.ts`: `embedUrl` for `/watch`'s player, and
      a direct MP4/HLS URL in `src` for `/not-yet`. If you choose YouTube, `/not-yet` needs its
      player rebuilt (YouTube has no direct file URL).
- [ ] **Booking: lead webhook + calendar** (`/apply`). Until you switch, the form posts each lead to
      the GoHighLevel inbound webhook (`services.leadconnectorhq.com/hooks/MZy9LUdfAB1KoJXc5Nfe/webhook-trigger/…`)
      and opens the GoHighLevel calendar `link.scaleitads.com/widget/booking/7R3CkgkWmW8DNYUQco7S`.
      Both keep working after the DNS switch **only while the GoHighLevel account is active and
      the `link` CNAME stays**. The app can take over both (same page, same look, same Pixel events):
      1. **Workspace.** In the app, use (or create) your own ScaleitAds workspace. On the Owner plan it
         has pipelines and calendars.
      2. **Calendar.** Calendar › create one like the GoHighLevel one: name (e.g. "Free ad account
         check"), 45 minutes, your availability, buffer, minimum notice, the Zoom/Google Meet link,
         phone optional or required (the form's phone is filled in for them). Skip extra questions:
         the form already asked them. Its booking link is `…/b/<workspace>/<calendar>`: those two
         slugs are the two variables below.
      3. **Automations.** Rebuild what the GoHighLevel workflow did (tags, WhatsApp/SMS, pipeline) in
         Automations. Each applicant arrives as a contact tagged `apply` and `spend-50-150` /
         `spend-150-500` / `spend-500-plus`, with website, spend, email consent and UTMs in their
         notes, and a deal in the first stage of the default pipeline ("New lead"); new contacts fire
         "Lead created". Booking moves the deal to "Call booked", tags `booked-call`, fires
         "Appointment booked", and sends the invite and reminders itself. Unticking the email box on
         the form marks the contact unsubscribed (no marketing emails; booking emails still go).
         Under-$50-a-day visitors are still never saved. **Check Emails › Sequences first:** a
         sequence that starts on a new lead from *any* page (the launch kit makes one, "Here's your
         free guide") emails every applicant too. Point it at its own page, or switch it off.
      4. **Switch.** Vercel › Settings › Environment Variables › Production: `SCALEITADS_WORKSPACE`
         and `SCALEITADS_CALENDAR`, then **Redeploy** (variables apply to new deployments). `/apply`
         now posts to `/api/scaleitads/apply` and embeds `/b/<workspace>/<calendar>` in its card; if
         the calendar is ever switched off or the slugs stop matching, it falls back to GoHighLevel by
         itself (and the logs say why).
      5. **Test.** In a private window open `https://scaleitads.com/apply?me=1` (owner mode: not
         tracked), pick $50–$150, fill the form with a test email you can read, book a time in the
         card. You land on `/booked`. In the app: the contact with those tags and notes, the deal in
         "Call booked", your "New booking" email; the test inbox has the invite. View the page source
         of `/apply`: no `leadconnectorhq` or `msgsndr`. Cancel the test booking from its email.
      6. **Unhook GoHighLevel.** Turn off (or delete) the GoHighLevel workflow with the Inbound
         Webhook trigger and the old calendar, so nothing new lands there. Keep the `link` CNAME until
         the calls already booked in GoHighLevel are done (their reschedule links use it).
      Rollback: delete the two variables and redeploy; `/apply` is back on GoHighLevel. `BOOKING_URL`
      in `config.ts` stays `/apply` either way.
- [ ] **The workflow behind that webhook** (confirmation and reminder emails, SMS/WhatsApp, tags,
      pipeline stage): write down every step, then rebuild it in the app's Automations.
- [ ] **Calendar**: export upcoming appointments, note availability, buffers, reminders and the
      redirect after booking (`/booked` keeps working).
- [ ] **Contacts**: Contacts › select all › Export (all fields, tags, UTM fields), plus
      Opportunities/pipelines and the DND/unsubscribed list. The app imports GoHighLevel's contact
      export directly. Download any conversation history you need: it isn't exportable in bulk.
- [ ] **Forms and surveys**: no GoHighLevel forms are embedded in the rebuilt pages; check
      Sites › Forms for any used elsewhere (ads, link in bio).
- [ ] **Emails**: templates, campaigns and workflows; the LC Email sending domain (if you set one up,
      remove its DNS records only after the last send).
- [ ] **SMS / phone numbers (LC Phone)**: start a **port-out** of each number to Twilio before you
      cancel (needs a Letter of Authorization and a recent invoice; takes days). Cancelling first
      loses the number. US numbers need A2P 10DLC registration again on Twilio.
- [ ] **WhatsApp**: if your WhatsApp Business number is connected through GoHighLevel, disconnect
      and reconnect it in the app (Meta WhatsApp Embedded Signup).
- [ ] **Privacy Policy**: it was kept word for word and names "HighLevel (LeadConnector)" as a
      provider and HighLevel session cookies while `/apply` is on GoHighLevel. Once the two
      `SCALEITADS_*` variables are live, those two spots read "Our CRM and booking tools" / "Our
      booking tools" by themselves. Review the rest of the wording once you've fully moved off.
- [ ] **Links you've shared** (ads, bios, emails): same paths on the new site. The old
      `scaleitads.com/home` URL redirects to `/`. Fixed: the old home page linked to `/watch`, which
      was never published on GoHighLevel (it returned 404); it now exists.

**After switching DNS:** open each page on a phone, book a test call on `/apply`, check Meta Events
Manager (Test Events) and Clarity receive visits (visit `scaleitads.com/?me=1` once on your own
browsers so you aren't tracked), then cancel GoHighLevel once nothing points at it.

**Rollback:** put back `@ A 162.159.140.166` and `www CNAME sites.ludicrous.cloud`.

## 6. Running it locally

```bash
cd platform && npm install && npm run dev        # http://localhost:3000
```

On `localhost` the app host rules apply (`/` opens `/app`) and every marketing page works at its
own path: `/home` (agency home), `/watch`, `/privacy`, `/terms`, `/apply`, `/skool`.

To see the marketing host exactly as production serves it, start with
`MARKETING_HOSTS=scaleitads.localhost,www.scaleitads.localhost` and open
http://scaleitads.localhost:3000/ (Chrome, Edge and Firefox resolve `*.localhost` to your computer).
