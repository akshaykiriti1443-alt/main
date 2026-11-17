import Link from "next/link";
import { env } from "@/lib/env";
import { IF_YOU_CANCEL } from "@/lib/leaving";
import { WEEK } from "@/lib/week";
import type { Qa } from "@/components/skool/close";
import type { CancelPoint, CostLine } from "@/components/skool/cost";
import type { Day } from "@/components/skool/week";

// The words both /skool pages share: the short sales page (/skool) and the full tour
// (/skool/inside). Truth rules: real prices only, no testimonials, no member counts, no invented
// numbers, no countdowns (DESIGN_SYSTEM.md section 10).

/** Where the free trial starts: the Skool group. SKOOL_GROUP_URL overrides it. */
export const SKOOL_URL = env.skoolGroupUrl || "https://www.skool.com/0-to-1x-academy-9129/about";
/** Sign-up, log-in and the dashboard live on the app host (app.scaleitads.com). */
export const APP = env.appUrl;
export const NAME = env.platformName;

export const TITLE = "The Skool Growth Program by ScaleitAds";
export const DESCRIPTION = `Grow your Skool community without a following. The free 7-day Anti-Pete Week course on Skool, the ${NAME} app that does the work, and ReelVault for studying reels, by ScaleitAds. $9/month after the free week for the first 100 founding members.`;

/* The week, in the course's order and words. Each title is the app's own day title (src/lib/week.ts,
   the one source the home page, Your path and Penny read), so the sales pages can never drift from
   the app. `tools` are the app's menu names. */
const dayTitle = (day: number) => WEEK[day - 1].title;
export const DAYS: Day[] = [
  {
    day: 1,
    title: dayTitle(1),
    body: "The long one, and the one that makes the rest easy. Grab a free Gemini key, let the AI launch kit write your website and free checklist, and put it live. Open your own Skool group, connect your Meta Pixel, see which ads already keep running in your niche, then make five of your own. Stop halfway if you like: the app keeps your place.",
    win: "A live website with your Pixel on it, and five ads in front of Meta.",
    tools: ["Your AI", "AI launch kit", "Funnels & pages", "Settings", "Ad research", "Ad studio"],
  },
  {
    day: 2,
    title: dayTitle(2),
    body: "Leave yesterday's ads alone. Today's five skip the website and go straight to your Skool group, in their own small campaign, so later you can see which road works better for you.",
    win: "Ten ads out, testing two roads into your group.",
    tools: ["Ad studio"],
  },
  {
    day: 3,
    title: dayTitle(3),
    body: "Your ads are learning, so hands off. Walk through what a stranger will see instead: sign up on your own website, read your own emails, press your own Join button. Better you find the typo than they do.",
    win: "You've signed up on your own website like a stranger would, all the way to the Join button.",
    tools: ["Funnels & pages", "Leads", "Emails"],
  },
  {
    day: 4,
    title: dayTitle(4),
    body: "An empty group is a restaurant at 8pm with no diners. Pin a welcome post with one easy question, make your first Unlock, and add one quick-win lesson to your Classroom.",
    win: "A group that looks lived-in before the first stranger walks in.",
    tools: ["Unlocks"],
  },
  {
    day: 5,
    title: dayTitle(5),
    body: "Your fastest first member probably knows your name already. List 20 people, text five by hand, and ask what they think of your free checklist. Not a pitch. Friends are cheaper than Meta.",
    win: "Five real conversations, started by you.",
    tools: ["Leads", "Growth ladder"],
  },
  {
    day: 6,
    title: dayTitle(6),
    body: "Copy each ad's numbers out of Meta into Ad review. It says in plain words which ads to leave running, which to switch off, and when it's simply too early to tell. This early, it often is. That's a real answer, not a failure.",
    win: "You know what your ads are doing, instead of guessing.",
    tools: ["Ad review"],
  },
  {
    day: 7,
    title: dayTitle(7),
    body: "Copy four numbers from Skool into your Growth ladder check-in and see where you stand on Skool's levels. Then count what you built this week, and decide in private whether to stay.",
    win: "A clear picture, and a decision that's yours.",
    tools: ["Growth ladder"],
  },
];

/** The membership line of the price list. Both pages quote it word for word. */
export const membershipItem = (reelVault: boolean) => (reelVault ? `The course, the ${NAME} app and ReelVault` : `The course and the ${NAME} app`);
export const AUTO_BILL = "Skool bills you automatically unless you cancel.";

export function costLines(reelVault: boolean): CostLine[] {
  return [
    {
      item: membershipItem(reelVault),
      price: "$0 for 7 days",
      note: `Then $9 a month for the first 100 founding members, kept for as long as you stay, or $27 a month once those seats are gone. ${AUTO_BILL}`,
      payee: "Paid to Skool, where your membership lives",
    },
    {
      item: "Your ads",
      price: "About $15 a day",
      note: "While you test: $10 a day for Day 1's five ads and $5 a day for Day 2's five. They're your ads on your card, and you can switch them off any time with the toggle beside the campaign.",
      payee: "Paid to Meta, never to us",
    },
    {
      item: "Your AI",
      price: "$0",
      note: "A free Gemini key from Google covers the whole week. Already pay for Claude or ChatGPT? You can also chat with your app from there, but the app's buttons still run on your key.",
      payee: "Paid to your AI provider, if anything",
    },
    {
      item: "Your own Skool group",
      price: "Skool's price",
      note: "Day 1 opens it through our Skool referral link, and the lesson says so at the click. Your group comes with its own 14-day free trial before Skool bills you for it.",
      payee: "Paid to Skool",
    },
    {
      item: "A ring light",
      price: "$0",
      note: "Not needed. Pete has two.",
      payee: "Paid to nobody",
    },
  ];
}

export const CANCEL: CancelPoint[] = [
  { label: "Your free week", body: IF_YOU_CANCEL.bill },
  { label: "How to cancel", body: IF_YOU_CANCEL.how },
  { label: "Your app", body: IF_YOU_CANCEL.app },
  { label: "Your work", body: IF_YOU_CANCEL.kept },
  { label: "Other bills", body: IF_YOU_CANCEL.others },
];

export function faqItems(reelVault: boolean): Qa[] {
  return [
    {
      q: "What do I get?",
      a: `Three things that work as one. The Anti-Pete Week is a 7-day course in our Skool group, one short lesson a day in text and pictures. The ${NAME} app does the work each lesson asks for, from your website and Meta Pixel to your ads, leads and follow-up emails. ${
        reelVault ? "ReelVault, in the same menu, takes apart the reels that already work in your niche." : "ReelVault, for taking apart the reels that already work in your niche, joins the app's menu when it's ready."
      }`,
    },
    {
      q: "Do I need a following or an audience first?",
      a: "No. The week doesn't lean on an audience you don't have yet. Your website and a few small ads put your group in front of people who've never heard of you, and on Day 5 you start real conversations with people who already know your name. No daily Reels required.",
    },
    {
      q: "What does it cost?",
      a: "$9 a month after a 7-day free trial, for the first 100 founding members, who keep $9 for as long as they stay. After those 100 seats, membership is $27 a month. The app is included either way. On top of that you pay for your own ads (about $15 a day while you test), your own AI (free with a Gemini key) and your own Skool group. Growth is an optional upgrade inside the app, and the Agency plan is priced individually.",
    },
    {
      q: "What happens when the free week ends?",
      a: `Seven days after you join, Skool charges you automatically: $9 a month if you're one of the first 100 founding members, or $27 a month once those seats are gone. Day 7 of the course is there to help you decide, and cancelling is a fine answer. ${IF_YOU_CANCEL.how} ${IF_YOU_CANCEL.kept}`,
    },
    {
      q: "How do I get access to the app?",
      a: "Start your free trial in our Skool group, then sign up for the app with the same email you use on Skool. Your account turns on by itself. No codes to copy.",
    },
    {
      q: "Do I need to know how to run ads?",
      a: "No. Ad research shows you the ads that keep running in your niche, and Ad studio writes your first five image ads with the exact clicks to launch them in Meta Ads Manager. You connect your Meta Pixel on Day 1 with every click spelled out. You will need a Facebook Page and a Meta ad account with a card on it.",
    },
    {
      q: "Do I have to pay for AI?",
      a: "No. A free Gemini key from Google works for the whole week. If you pay for Claude or ChatGPT you can also connect it to chat with your app, but the app's buttons still use your key. Whatever your AI costs, you pay your provider directly, never us.",
    },
    {
      q: "How long does each day take?",
      a: "Day 1 is the long one: plan on an evening, and stop halfway if you need to. The other six days are much shorter, and most of the time goes on your post and your review in Skool.",
    },
    {
      q: "What if I fall behind?",
      a: "Pick up where you stopped. Your work stays in the app, the lessons stay in Skool, and the Day 7 check-in works whatever day you get to it. Skool's free week still runs from the day you joined, so go by your own count.",
    },
    {
      q: "Will the app log in to my Skool account?",
      a: "Never. We don't ask for your Skool password and the app never acts on your Skool account. The only things it gets from Skool are links you paste in yourself. Joining, posting and reviewing all happen on Skool, where they should.",
    },
    {
      q: "Can I use my own domain?",
      a: "Yes, on the Growth plan. Either way your website is hosted for you, with nothing to install.",
    },
    {
      q: "Can I resell the app to my own clients?",
      a: "Yes. The Agency plan gives you your logo, colours and app address, unlimited client accounts and templates you can load into any of them. It's priced individually, so ask us in the Skool group.",
    },
    {
      q: "Who is behind it?",
      a: (
        <>
          ScaleitAds, the Meta ads agency run by Akshay Kolluru. The course, the app and ReelVault are all ScaleitAds products, and the audits in the group are Akshay&apos;s own. <Link href="/">Visit ScaleitAds</Link>.
        </>
      ),
    },
  ];
}

/** The questions people ask before they press the button. The rest live on the full tour. */
export const SHORT_FAQ = ["What do I get?", "Do I need a following or an audience first?", "What does it cost?", "What happens when the free week ends?", "How long does each day take?", "Will the app log in to my Skool account?"];
