// What happens if a member cancels. One set of words for Plan & wallet and the /skool FAQ, matched to
// the course's "Your free week" post. The app can't see a Skool trial, a charge or a cancel, so
// nothing here may print a date, a countdown or what someone would "lose". Client-safe.

export const CANCEL_ROUTE = "profile picture › Settings › Communities › SETTINGS next to the group › Manage membership";

export const IF_YOU_CANCEL = {
  bill: "Skool runs your membership and its bill, so the app can't see your free week or your charge date. Count seven days from the day you joined.",
  how: `To cancel, on Skool: ${CANCEL_ROUTE}. On a phone: three dots › Group Settings › Manage Membership. Press cancel, not leave, and check it shows as cancelled.`,
  app: "Your app stays on for at least a week after it finds out you've gone. Then it locks, your opt-in page goes offline, new sign-ups stop and follow-up emails hold. Your Skool link keeps opening your About page.",
  kept: "Your pages, leads and emails are saved, and they come back if you do.",
  others: "Two other bills carry on until you stop them: your Meta ads, with the toggle beside your campaign, and your own Skool group, which bills after its own 14-day trial.",
} as const;
