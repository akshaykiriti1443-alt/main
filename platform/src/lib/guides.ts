// What the companion (Penny) says: how to do each step of Your path, and what each page is for.
// Plain words for a total beginner. Lesson numbers match the course (The Skool Growth Ladder).
// Client-safe: no server imports.

export const GUIDE_COOKIE = "onx_guide"; // "open" | "min" | "off"; missing = first visit (open, with a hello)
export const GUIDE_SKIP_COOKIE = "onx_guide_skip"; // comma list of step keys the member skipped
export const GUIDE_HELLO_COOKIE = "onx_guide_hi"; // set once the member has read Penny's hello
export type GuideMode = "open" | "min" | "off";
export const isGuideMode = (v: unknown): v is GuideMode =>
  v === "open" || v === "min" || v === "off";

export type StepHowTo = {
  /** Numbered "how to do it" lines, shown when you're on the right page. */
  how: string[];
  /** The element on that page to glow ("click here"), by its data-guide attribute. */
  target?: string;
};

export const STEP_HOWTO: Record<string, StepHowTo> = {
  ai: {
    target: "ai-connect",
    how: [
      "Pay for Claude or ChatGPT? Give it a name, press Create connector URL, then paste that link into your AI app's connectors. Your app's card shows exactly where.",
      "Claude's free plan works too (one connector).",
      "No subscription? Use a free Google Gemini key in the API key section instead.",
    ],
  },
  hello: {
    how: [
      "Post your intro in the Skool Community tab, copy the post's link and paste it here.",
    ],
  },
  kit: {
    target: "kit-build",
    how: [
      "Answer the questions. Your one sentence from lesson 1.1 covers most of them.",
      "Paste your Skool group link (skool.com/your-group).",
      "Press Build my launch kit. It takes about a minute.",
    ],
  },
  skool: {
    target: "skool-link",
    how: [
      "Paste your Skool group link (skool.com/your-group) and save. Every Join button and your Skool link use it.",
    ],
  },
  publish: {
    target: "site-publish",
    how: [
      "Open your opt-in page (the one asking for an email).",
      "Change three lines: the headline, the free guide's name and the button.",
      "Press Publish, then open the live link on your phone and sign up yourself.",
    ],
  },
  price: {
    target: "member-price",
    how: [
      "In Skool: Settings › Pricing. Pick a monthly subscription or tiers.",
      "Here: type the same price into Price / member / month and press Save member price.",
    ],
  },
  research: {
    target: "research-analyse",
    how: [
      'Search a keyword from your niche, like "fat loss for dads".',
      "🔥 means the ad has run 30+ days. Those are the ones that make money.",
      "Press Analyse with AI. It writes your 3-Pack: a Pain, a Dream and a Lesson ad.",
    ],
  },
  pixel: {
    target: "pixel",
    how: [
      "In Meta Events Manager, copy your Dataset ID and generate a Conversions API token.",
      "Paste both into Meta Pixel & Conversions API here and save.",
      "Lesson 2.5 shows every click, with pictures.",
    ],
  },
  clicks: {
    how: [
      "Copy your Skool link from this page.",
      "In Meta Ads Manager, launch your 3-Pack at your budget tier with that link.",
      "This ticks off at the first click from an ad, a bio or a post.",
    ],
  },
  review: {
    target: "ad-review",
    how: [
      "Wait 72 hours after launch. Hands off.",
      "Copy each ad's spend, impressions and link clicks from Ads Manager.",
      "Paste them here. You get keep, fix or kill, and which part to fix.",
    ],
  },
  customer: {
    how: [
      "Message 20 people who already know you (lesson 3.2). One question, no pitch.",
      "Open your hottest leads and send a personal note: AI writes, you send.",
      "Ticks off when a paying member shows up, or your check-in says 1 new customer.",
    ],
  },
  checkin: {
    target: "checkin",
    how: [
      "In Skool, open Settings › Growth.",
      "Copy your level, About-page visitors, new customers and Skool Network sign-ups.",
      "Type them into the Monday check-in here and save.",
    ],
  },
  l2: {
    target: "checkin",
    how: [
      "Keep doing your Monday check-in. Level 2 needs 100 About-page visitors, 1 new customer and paid pricing.",
    ],
  },
  visitors: {
    target: "checkin",
    how: [
      "Keep ads running at your base camp budget, and repost weekly. Your check-in ticks this at 3,000 visitors.",
    ],
  },
  bio: {
    target: "checkin",
    how: [
      "Put your skool.com link in your Instagram, TikTok and YouTube bios.",
      "Then tick the bio box in your Monday check-in.",
    ],
  },
  network: {
    target: "checkin",
    how: [
      "Say hi to every new member and answer real questions in other Skool groups.",
      "Your check-in ticks this at 10 Skool Network sign-ups.",
    ],
  },
  l3: {
    target: "checkin",
    how: [
      "Visitors, bio, regular posts and 10 Network sign-ups. Your check-in shows what's still missing.",
    ],
  },
  l4: {
    target: "checkin",
    how: [
      "10,000 visitors and 30 Network sign-ups. Keep your best ads running and your members happy.",
    ],
  },
  sync: {
    target: "skool-sync",
    how: [
      "In Skool: Members › Export. You get a spreadsheet.",
      "Upload it here (or paste it) and press sync.",
      "Do it every week. Your automations read these piles.",
    ],
  },
  automations: {
    target: "automation-ai",
    how: [
      "Tell your AI what to automate in plain words, or pick a recipe like Welcome.",
      "Read every email out loud. Change anything that doesn't sound like you.",
      "Switch it on and press Save.",
    ],
  },
  unlock: {
    target: "unlock-create",
    how: [
      "Name a small reward members would comment for, and add its link.",
      "Copy the claim link and post it in your Skool group.",
      "Members comment, paste their link and get the reward by email.",
    ],
  },
  agency: {
    target: "agency-new",
    how: [
      "Only if you want to resell this stack as your own.",
      "Add your brand name, logo and domain, then set your markup.",
    ],
  },
  weeks: {
    target: "checkin",
    how: [
      "Every Monday: check-in here (5 minutes). Four Mondays and it's a habit.",
    ],
  },
};

export type PageGuide = { title: string; what: string; tips: string[] };

/** Keyed by the path after /app/w/<id>; the longest matching prefix wins. */
export const PAGE_GUIDES: Record<string, PageGuide> = {
  "": {
    title: "Dashboard",
    what: "Your home base. Your next step is always at the top.",
    tips: [
      "Numbers show up here once your funnel is live.",
      "Lost? Follow me, one step at a time.",
    ],
  },
  path: {
    title: "Your path",
    what: "The whole course as a checklist that ticks itself off when you do things.",
    tips: [
      "The big card is your one next thing.",
      "Lesson numbers match the classroom in Skool.",
    ],
  },
  ai: {
    title: "Your AI",
    what: "Plug in the AI you already use, so it writes and runs things for you on your plan.",
    tips: [
      "Claude or ChatGPT subscription: use the connector.",
      "Want free? A Google Gemini key works.",
    ],
  },
  launch: {
    title: "AI launch kit",
    what: "Answer a few questions and the AI writes your landing page, free guide, emails, ads and Skool About page.",
    tips: [
      "Every block has its own Copy button.",
      "Ads go in the fridge until Stage 2.",
    ],
  },
  sites: {
    title: "Funnels & pages",
    what: "Your landing pages. A stranger gives their email here and gets sent on to Skool.",
    tips: ["Change three lines, then Publish.", "Sign up yourself to test it."],
  },
  leads: {
    title: "Leads",
    what: "Everyone who signed up or messaged you, hottest first.",
    tips: [
      "Open a lead to see their whole story.",
      "AI writes the follow-up, you send it.",
    ],
  },
  skool: {
    title: "Skool members",
    what: "Your Skool members in four piles: trial, paying, cancelling and churned.",
    tips: [
      "Upload your Skool export every week.",
      "Save your member price so Meta knows what a member is worth.",
      "On Skool Pro? Connect its Webhook plugin and new people get a Skool invite by themselves.",
      "On Hobby? Scroll to \"Skool Pro plugins, the Hobby way\" for a stand-in for every Pro plugin.",
    ],
  },
  growth: {
    title: "Growth ladder",
    what: "Your Skool growth level, what's missing for the next one, and your Skool link.",
    tips: [
      "Do the Monday check-in every week.",
      "Point every ad at your Skool link so clicks get counted.",
    ],
  },
  unlocks: {
    title: "Unlocks",
    what: "Small rewards members earn by posting or commenting in your Skool group.",
    tips: [
      "Engagement is what Skool ranks you on.",
      "One new Unlock a week is plenty.",
    ],
  },
  "ads/research": {
    title: "Ad research",
    what: "Spy on ads your competitors have run for weeks (the ones that make money).",
    tips: [
      "🔥 = 30+ days running.",
      "Analyse with AI turns them into your 3-Pack.",
    ],
  },
  ads: {
    title: "Ad review",
    what: "Paste your ad numbers after 72 hours and get keep, fix or kill.",
    tips: [
      "Change one thing at a time: Hook, Turn or Door.",
      "Hands off for the first 72 hours.",
    ],
  },
  automations: {
    title: "Automations",
    what: "When something happens, do something: welcome, nudge, save and win back, on autopilot.",
    tips: [
      "Tell your AI what you want in plain words.",
      "Nothing runs until you press Save.",
    ],
  },
  emails: {
    title: "Emails",
    what: "Your follow-up emails and broadcasts.",
    tips: [
      "The launch kit already wrote your first three.",
      "Short beats clever.",
    ],
  },
  inbox: {
    title: "Inbox",
    what: "DMs, WhatsApp and SMS in one place.",
    tips: ["Hot leads float to the top.", "AI drafts a reply, you send it."],
  },
  social: {
    title: "Social planner",
    what: "Optional. Schedule a few posts a week if you want organic reach too.",
    tips: [
      "You don't need social media to grow here. Ads do the heavy lifting.",
    ],
  },
  settings: {
    title: "Settings",
    what: "Your business details, Skool link, Meta Pixel and domain.",
    tips: ["Most steps send you here once, then never again."],
  },
  billing: {
    title: "Plan & wallet",
    what: "Your plan and the wallet that pays for extras like SMS.",
    tips: ["Using your own AI makes AI features free here."],
  },
};

/** The guide for the current page, by the longest matching path prefix. */
export function pageGuideFor(pathname: string, wid: string): PageGuide | null {
  const base = `/app/w/${wid}`;
  if (!pathname.startsWith(base)) return null;
  const rest = pathname.slice(base.length).replace(/^\/+|\/+$/g, "");
  const key = Object.keys(PAGE_GUIDES)
    .filter(
      (k) =>
        rest === k ||
        (k !== "" && rest.startsWith(`${k}/`)) ||
        (k === "" && rest === ""),
    )
    .sort((a, b) => b.length - a.length)[0];
  if (key !== undefined) return PAGE_GUIDES[key];
  // Deeper pages (a single site, one automation): use their section's guide.
  const section = Object.keys(PAGE_GUIDES)
    .filter((k) => k && rest.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return section ? PAGE_GUIDES[section] : null;
}
