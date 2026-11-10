// What the companion (Penny) says: how to do each step of Your path, and what each page is for.
// Plain words for a total beginner. The days match the course (The Anti-Pete Week).
// Client-safe: no server imports.

export const GUIDE_COOKIE = "onx_guide"; // "open" | "min" | "off"; missing = first visit (open, with a hello)
export const GUIDE_SKIP_COOKIE = "onx_guide_skip"; // comma list of step keys the member skipped
export const GUIDE_HELLO_COOKIE = "onx_guide_hi"; // set once the member has read Penny's hello
export type GuideMode = "open" | "min" | "off";
export const isGuideMode = (v: unknown): v is GuideMode =>
  v === "open" || v === "min" || v === "off";

/**
 * Can this step be "Up next"? Only a to-do the member can do right now. Optional steps, outcomes
 * (they wait on Skool's numbers) and steps locked to another plan never hold Up next; they still
 * show on Your path, with their lock, and tick themselves off. Your path, the dashboard and Penny
 * all use this one rule.
 */
export const canBeUpNext = (s: { done: boolean; kind?: string; locked?: string }) =>
  !s.done && !s.kind && !s.locked;

export type StepHowTo = {
  /** Numbered "how to do it" lines, shown when you're on the right page. */
  how: string[];
  /** The element on that page to glow ("click here"), by its data-guide attribute. */
  target?: string;
};

export const STEP_HOWTO: Record<string, StepHowTo> = {
  ai: {
    target: "ai-key",
    how: [
      "Get a free Google Gemini key (I want it free › Get a free Gemini key), paste it into API key and press Save key. Only a key lifts the 3-run cap.",
      "Pay for Claude or ChatGPT? A connector lets that app work on your account from its own chat. Give it a name, press Create connector URL and paste the link into your AI app's connectors.",
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
      "Answer the questions. Unsure? Guess: you can edit every word once it's built.",
      "Paste your Skool group link (skool.com/your-group/about).",
      "Press Build my launch kit, once. It takes about a minute.",
    ],
  },
  skool: {
    target: "skool-link",
    how: [
      "Paste your Skool group link (skool.com/your-group/about) and save. Every Join button and your Skool link use it.",
    ],
  },
  publish: {
    target: "site-publish",
    how: [
      "Open your opt-in page (the one asking for an email).",
      "Change three lines: the headline, who it's for and the button.",
      "Open your Thank-you page and check it states the deal in plain words: 7 days free, then your price a month.",
      "Press Publish. Your Meta Pixel is the very next step, before you test it.",
    ],
  },
  lead1: {
    how: [
      "Open your live funnel on your phone (its link is in Funnels & pages).",
      "Sign up with your own email, like a stranger would.",
      "Come back here to Leads: there you are. Email 1 lands within minutes (check spam once).",
      "Give Meta a couple of minutes, then look in Events Manager for your PageView and your Lead.",
    ],
  },
  research: {
    target: "research-analyse",
    how: [
      'Search a keyword from your niche, like "fat loss for dads".',
      "🔥 means the ad has run 30+ days. Not proof, but the best free clue going.",
      "Press Analyse with AI, once. Read What's working in your niche and Gaps nobody uses yet.",
    ],
  },
  pixel: {
    target: "pixel",
    how: [
      "Needed today: your website ads use it to tell Meta who gave you their email.",
      "In Meta Events Manager, click Connect data sources, pick Web, name your dataset and create it.",
      "On its Settings tab, copy the Dataset ID, then scroll to Conversions API and press Generate access token.",
      "Paste both into Meta Pixel & Conversions API here and press Save.",
    ],
  },
  statics: {
    target: "ad-studio-make",
    how: [
      "Check your answers: where these ads go (Day 1 is My website), $10 a day, country, who it's for and the result you promise.",
      'Open Fine-tune and put "Free checklist:" and its name in Your offer, then press Make my 5 statics.',
      "Paste each image prompt into ChatGPT or Gemini, then follow Your launch plan in Ads Manager.",
    ],
  },
  clicks: {
    how: [
      "Open Your launch plan and follow it in Meta Ads Manager, one click at a time.",
      "Day 1's ads go to your website as a Leads campaign, with your Pixel under Dataset and Lead as the event.",
      "This ticks off at your first lead from an ad, or your first ad click on your Skool link. Your own test doesn't count.",
    ],
  },
  review: {
    target: "ad-review",
    how: [
      "First round: Day 6, hands off till then. After that, weekly.",
      "Only ads with 1,000+ impressions. None over? Review your biggest spender once.",
      "Copy each ad's spend, impressions and link clicks from Ads Manager, date range Maximum.",
      "Paste them here, one ad at a time, and say where it goes: An opt-in page or My Skool link. You get keep, fix or kill, and the one room to fix.",
      "Switch off anything marked Kill on Day 6, and change nothing else that day. Too early is a normal answer, so leave those running.",
    ],
  },
  customer: {
    how: [
      "List 20 people who have the problem you solve, or know someone who does, then text five.",
      "Follow up once, three days later, with anyone who replied. Just once.",
      "Ticks off when your Monday check-in says 1 new customer.",
    ],
  },
  checkin: {
    target: "checkin",
    how: [
      "First one: Day 7, whatever the weekday. Zeros count.",
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
      "Put your plain skool.com link in your bio (Instagram, TikTok or YouTube).",
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
      "Visitors, bio, steady promo (your own ads count) and 10 Network sign-ups. Your check-in shows what's still missing.",
    ],
  },
  l4: {
    target: "checkin",
    how: [
      "10,000 visitors and 30 Network sign-ups. Keep your best ads running and your members happy.",
    ],
  },
  refresh: {
    target: "ad-studio-make",
    how: [
      "Read Gaps nobody uses yet in Ad research first, so this set is genuinely new.",
      'Pick My Skool link and $5 a day. In Fine-tune, put "7-day free trial of" and your group\'s name in Your offer.',
      "Press Make my 5 statics, then launch them as their own Traffic campaign. Leave your website ads alone.",
      "This ticks at your second pack.",
    ],
  },
  tracking: {
    how: [
      "Sign up on your live page with a different email, and check you're in Leads.",
      "In Meta Events Manager, look for both PageView and Lead.",
      "Open Your Skool link once from Growth ladder, so you can see it counting.",
    ],
  },
  warm: {
    how: [
      "List 20 people who have the problem you solve, or know someone who does.",
      "Text five, one at a time, in your own words. No link until they ask.",
      "Anyone who replies goes in with Add contact. Anyone who asks gets your Skool link with ?src=text on the end.",
    ],
  },
  claim1: {
    how: [
      "Press Copy Skool post on your Unlock, publish it in your group and pin it.",
      "Someone posts or comments, then pastes that link on your claim page. It lands in Recent claims.",
      "Thank them by name, in your group, where everyone can read it.",
    ],
  },
  email4: {
    how: [
      "Open Emails › Sequences, then your kit's sequence.",
      'In the "Add another email" slot, set Send on day to 7.',
      "Answer \"Is it worth it?\" and end with your Skool link. Then press Save sequence.",
    ],
  },
  automations: {
    target: "automation-ai",
    how: [
      "Tell your AI what to automate in plain words, or pick a recipe like Warm-up new leads.",
      "Read every email out loud. Change anything that doesn't sound like you.",
      "Switch it on and press Save.",
    ],
  },
  unlock: {
    target: "unlock-create",
    how: [
      "Name a small reward and add its link. Pick what they have to do: Comment on a post, or Make their own post.",
      "Press Create unlock, then Copy Skool post. Publish it in your group and pin it.",
      "Members do it, paste their link and get the reward by email.",
    ],
  },
  agency: {
    target: "agency-new",
    how: [
      "Optional. Only if someone asks to buy this as an agency or software of your own.",
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
      "The days match your classroom in Skool.",
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
    what: "Answer a few questions and the AI writes your landing page, free guide, emails and Skool About page.",
    tips: [
      "Every block has its own Copy button.",
      "Your ads come from Ad studio: Make my 5 statics.",
    ],
  },
  sites: {
    title: "Funnels & pages",
    what: "Your website. A stranger gives their email here, gets your free checklist and sees your Skool offer.",
    tips: ["Change three lines, then Publish.",
      "Want yourname.com? Get a domain from the Custom domain section of your funnel.", "Sign up yourself to test it."],
  },
  leads: {
    title: "Leads",
    what: "Everyone who signed up or messaged you, hottest first.",
    tips: [
      "Sign up on your own page first: you're lead #1.",
      "Open a lead to see their whole story.",
      "On the Growth plan, AI drafts your replies in Inbox.",
    ],
  },
  pipeline: {
    title: "Pipeline",
    what: "Every person who might buy, as a card on a board. Drag a card to the right as they get closer to yes.",
    tips: [
      "Booked calls land in Call booked by themselves.",
      "Coming from GoHighLevel? Import your opportunities CSV from Leads › Import contacts.",
      "No mouse? Open a card and use Move to.",
    ],
  },
  calendar: {
    title: "Calendar",
    what: "Your booking page, like Calendly: people pick a time, and it lands here and in your CRM.",
    tips: [
      "Add your Zoom or Meet link first, then copy your link.",
      "Confirmations and reminders (24 h and 1 h before) send themselves.",
      "Put the link in your Skool About page and your emails.",
    ],
  },
  growth: {
    title: "Growth ladder",
    what: "Your Skool growth level, what's missing for the next one, and your Skool link.",
    tips: [
      "Do the Monday check-in every week.",
      "Skool-link ads use Your Skool link, so every click gets counted.",
    ],
  },
  unlocks: {
    title: "Unlocks",
    what: "Small rewards members earn by posting or commenting in your Skool group.",
    tips: [
      "Skool ranks groups on who joins, who talks and who stays.",
      "One new Unlock a week is plenty.",
    ],
  },
  "ads/studio": {
    title: "Ad studio",
    what: "Your first ads, same day: your numbers, 5 statics ready to make, and the exact clicks to launch them.",
    tips: [
      "Day 1 goes to your website at $10 a day. Day 2 goes to your Skool link at $5, in its own campaign.",
      "Five different looks, so Meta tests five real ideas.",
      "Hands off till Day 6 after you publish.",
    ],
  },
  "ads/research": {
    title: "Ad research",
    what: "Spy on ads your competitors have run for weeks (the best free clue going).",
    tips: [
      "🔥 = 30+ days running.",
      "Analyse with AI shows what's working and the gaps nobody uses yet.",
      "Its three angles are ideas to borrow. Ad studio writes your ads.",
    ],
  },
  ads: {
    title: "Ad review",
    what: "Paste your ad numbers on Day 6, then weekly, and get keep, fix or kill.",
    tips: [
      "Fix one room at a time: Hook, Door or About page.",
      "First round: verdicts on Day 6, and Kill ads go off then.",
      "Too early isn't a bad verdict. Nobody's opened that ad yet.",
    ],
  },
  automations: {
    title: "Automations",
    what: "When something happens, do something: follow up new leads and flag hot ones, on autopilot.",
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
