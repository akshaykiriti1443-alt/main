# Meta App Review and WhatsApp checklist

One Meta app serves every customer. Customers never create their own app. They
click **Connect**, pick their Page and Instagram account, and approve. For that
to work for people outside your team, Meta must grant your app **Advanced Access**.

## Before you submit

- [ ] Business Portfolio verified (Business Settings › Security Center).
- [ ] App type: Business. App icon, contact email and category filled in.
- [ ] Privacy Policy, Terms and Data Deletion URLs live (`/legal/...` pages, edited for your business).
- [ ] App is live on your production domain with HTTPS.
- [ ] A reviewer test account: a workspace on the **Growth** plan (set it in Admin › Workspaces)
      with email/password you share in the submission notes.
- [ ] Your own Facebook Page and Instagram professional account connected, so you can record screencasts.

## Permissions to request

| Permission | Where the app uses it | What to show in the screencast |
|---|---|---|
| `pages_show_list` | Connect flow lists the user's Pages | Click Connect, pick a Page |
| `pages_manage_metadata` | Subscribes the app to the Page's message webhooks | Connect flow finishes, Page shows in Settings › Inbox channels |
| `pages_messaging` | Receive and reply to Messenger messages in the inbox | Send a message to the Page from another account, it appears in the inbox, reply from the app, show it arriving in Messenger |
| `pages_read_engagement` | Read Page details for the connected account | Settings shows the Page name |
| `pages_manage_posts` | Social planner posts to the Page | Schedule a post, show it on the Page |
| `instagram_basic` | Show the connected Instagram account | Settings shows the @username |
| `instagram_manage_messages` | Receive and reply to Instagram DMs | DM the account, it appears in the inbox, reply from the app |
| `instagram_content_publish` | Social planner posts to Instagram | Schedule an image post, show it on the profile |
| `business_management` | Access Pages and WhatsApp accounts owned by a business | Connect a Page owned by a Business Portfolio |

Optional: request the **Human Agent** feature to reply up to 7 days after a
customer's last message (the app falls back to it automatically outside 24 hours).

## Writing the use-case notes

For each permission, say who uses it, what they do and why they need it. Example:

> Our customers are coaches who run online communities. They connect their
> Facebook Page so messages from potential clients arrive in one inbox inside our
> app, where they read and reply. `pages_messaging` lets the coach receive and
> answer these messages. We only send replies the coach writes or approves. We do
> not send promotional messages outside the 24-hour window.

## Recording tips

- Record in English UI, at full screen, with the mouse visible.
- Show the full flow from login to the result for each permission.
- Show the Facebook permission screen during Connect.
- Keep each video under 3 minutes. Upload one per permission or one clear walkthrough.

## After approval

- Switch the app to **Live** mode.
- Test with a Page you don't administer as an app role (use a friend's Page).
- Page tokens from this flow don't expire. If a customer changes their Facebook
  password or removes the app, the channel errors and they reconnect.

## WhatsApp: becoming a Tech Provider

1. Complete business verification.
2. Add the **WhatsApp** product to the same app.
3. Submit App Review for `whatsapp_business_management` and `whatsapp_business_messaging`
   (screencast: Connect WhatsApp popup, a message arriving in the inbox, a reply).
4. Complete Meta's access verification as a Tech Provider.
5. Create the **Embedded Signup** configuration in Facebook Login for Business and
   set `META_WA_CONFIG_ID`.
6. Subscribe the WhatsApp webhook field `messages`.

### WhatsApp rules the app already follows

- Free-form replies only within 24 hours of the customer's last message. Outside
  that window the app blocks the send and asks for a template message.
- Inbound messages, button replies and delivery statuses are stored per number.

### Who pays WhatsApp fees

- **Tech Provider:** each customer adds their own payment method in Meta. Simple, no float.
- **Solution Partner:** you hold a credit line and bill customers with your markup.
- **Through a BSP (Twilio, 360dialog):** they handle billing; you resell.
