// Starter content every new workspace gets. Placeholders like {{first_name}}
// are filled at send time.

export const DEFAULT_SEQUENCE = {
  name: "Lead magnet follow-up",
  steps: [
    {
      position: 0,
      delayMinutes: 0,
      subject: "Here's your {{lead_magnet_name}} 📥",
      body: `Hey {{first_name}},

Here it is: [{{lead_magnet_name}}]({{lead_magnet_url}})

Do step 1 today. It takes 5 minutes.

Tomorrow I'll send you the mistake that keeps most people stuck.

{{owner_name}}

P.S. The full plan lives inside {{business_name}}. Try it free: {{skool_url}}`,
    },
    {
      position: 1,
      delayMinutes: 60 * 24,
      subject: "The #1 mistake I see",
      body: `Hey {{first_name}},

Most people try to do everything at once. They burn out by day 3.

Here's the fix: pick one small action and do it every day for a week.

Try it today and reply to tell me how it went.

Want help? Join us inside {{business_name}}: {{skool_url}}

{{owner_name}}`,
    },
    {
      position: 2,
      delayMinutes: 60 * 24 * 3,
      subject: "Your 7 free days are waiting",
      body: `Hey {{first_name}},

Inside {{business_name}} you get the full system, live help and a group that keeps you going.

Start your free trial here: {{skool_url}}

The founding price goes up soon. Lock it in today.

{{owner_name}}`,
    },
  ],
};

export const RESERVED_SLUGS = new Set([
  "app",
  "api",
  "admin",
  "agency",
  "login",
  "signup",
  "logout",
  "www",
  "mail",
  "static",
  "assets",
  "s",
  "d",
  "_next",
]);
