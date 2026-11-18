// What the companion (Penny) says: how to do each step of Your path, and what each page is for.
// Plain words for a total beginner. The days match the course (The Anti-Pete Week).
// Client-safe: no server imports.

export const GUIDE_COOKIE = "onx_guide"; // "open" | "min" | "off"; missing = first visit (open, with a hello)
/** Deprecated, unused: "Skip this step" became "Do this later", saved on the server. Kept so older layouts compile. */
export const GUIDE_SKIP_COOKIE = "onx_guide_skip";
export const GUIDE_HELLO_COOKIE = "onx_guide_hi"; // set once the member has read Penny's hello
export type GuideMode = "open" | "min" | "off";
export const isGuideMode = (v: unknown): v is GuideMode =>
  v === "open" || v === "min" || v === "off";

export type StepHowTo = {
  /** Numbered "how to do it" lines, shown when you're on the right page. 1 to 4 lines. */
  how: string[];
  /** The element on that page to glow ("click here"), by its data-guide attribute. */
  target?: string;
};

export const STEP_HOWTO: Record<string, StepHowTo> = {
  ai: {
    target: "ai-connect",
    how: [
      "Press Create connector URL, then copy the link it shows. It's private, like a password.",
      "In Claude, open Customize › Connectors, press + Add › Add custom connector, paste the link and press Add.",
      "In a new Claude chat, switch it on in the tools menu and say the line in step 3. Claude builds your website and emails and saves them here.",
      "No Claude? Get a free Gemini key further down this page and press Save key.",
    ],
  },
  hello: {
    how: [
      "Post your intro in the Skool Community tab, copy the post's link and paste it here.",
    ],
  },
  skool: {
    target: "skool-link",
    how: [
      "Press Start my group on your home page, or use the link in your Day 1 lesson. Skool opens in a new tab. Already have a group? Use that one.",
      "Name your group, set a monthly price and switch on the 7-day free trial in its settings.",
      "Copy your group's address from the top of the browser, like https://www.skool.com/your-group.",
      "Paste it into Your group's link and press Save link.",
    ],
  },
  kit: {
    target: "kit-build",
    how: [
      "Answer the questions. Unsure? Guess: you can edit every word once it's built.",
      "Type what you'll charge a month and pick your free trial. Both are needed for your thank-you page.",
      "Have your Skool group link? Paste it. No group yet? Leave it blank.",
      "Press Build my launch kit, once. It takes about a minute.",
    ],
  },
  publish: {
    target: "site-publish",
    how: [
      "Open your opt-in page (the one asking for an email).",
      "Change three lines: the headline, who it's for and the button.",
      "Open your Thank-you page and check it states the deal in plain words: 7 days free, then your price a month.",
      "Press Publish. Half-time: the Pixel and your ads are the second sitting.",
    ],
  },
  reel1: {
    how: [
      "In ReelVault, add 1 to 3 accounts in your niche, or let it find the top ones for you.",
      "Open the outliers: the reels that got 3 times that creator's normal views, or more.",
      "Pick one and press Remake this. You get a script in your own words. Copy the hook, not the video.",
      "Come back and press I've got my script.",
    ],
  },
  carousel: {
    how: [
      "Paste your script and press Turn my script into slides. No script? Type your topic and press Write it for me.",
      "Read every slide. Change any word that doesn't sound like you, and press Try another look if you like.",
      "Press Download all slides. This step ticks itself once your carousel is saved.",
      "Rather be on camera? Film it as a talking-head video: phone at eye level, window light, one take. Then press I filmed a video instead.",
    ],
  },
  firstpost: {
    how: [
      "Carousel: in Instagram, press + › Post, pick all your slides in order, then Add music.",
      "Video: post it as a reel. Trimming the start and end is all the editing it needs.",
      "Write one line under it, then press Share.",
      "Come back and press I posted it.",
    ],
  },
  pages: {
    how: [
      "Make a Facebook Page for your group, and an Instagram account set to business or creator.",
      "In Meta Business Suite, link the Instagram account to your Page.",
      "Put your Skool group's link in your Instagram bio.",
      "Come back and press Both are set up.",
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
  research: {
    target: "research-analyse",
    how: [
      "Press Search in Meta Ad Library and pick 3 ads that started running a month or more ago.",
      "Copy each ad's words and paste them into Competitor ads.",
      "Press Analyse with AI, once. Read What's working in your niche and Gaps nobody uses yet.",
    ],
  },
  statics: {
    target: "ad-studio-make",
    how: [
      "Check your answers: where these ads go (Day 2 is My website), $10 a day, country, who it's for and the result you promise.",
      "Press Make my 5 statics. Your ads offer your free checklist by themselves.",
      "Paste each image prompt into ChatGPT or Gemini to make the images. Your launch plan is the next step.",
    ],
  },
  clicks: {
    how: [
      "Open Your launch plan and follow it in Meta Ads Manager, one click at a time.",
      "Day 2's ads go to your website as a Leads campaign at $10 a day, with your Pixel under Dataset and Lead as the event.",
      "Press Publish in Ads Manager, then come back and press I pressed Publish.",
      "Meta checks new ads before they run. There's nothing for you to do while it does.",
    ],
  },
  planweek: {
    how: [
      "Make 3 more carousels or scripts, the same way as yesterday.",
      "Open the Planner in Meta Business Suite and press Create post.",
      "Tick both Facebook and Instagram, add your slides or video, then press Schedule and pick a day for each.",
      "Come back and press They're scheduled.",
    ],
  },
  refresh: {
    target: "ad-studio-make",
    how: [
      "Read Gaps nobody uses yet in Ad research first, so this set is genuinely new.",
      "Pick My Skool link and $5 a day. Your ads offer your free trial by themselves.",
      "Press Make my 5 statics. This step ticks when the pack is saved.",
    ],
  },
  live2: {
    how: [
      "Open Your launch plan for the Skool-link pack and follow it in Ads Manager.",
      "Make it a new Traffic campaign at $5 a day, so yesterday's website ads stay untouched.",
      "Press Publish, then come back and press I pressed Publish.",
    ],
  },
  lead1: {
    how: [
      "Open your website on your phone. The button opens it.",
      "Sign up with your own email, like a stranger would.",
      "Come back to Leads: there you are. Your first email is on its way too (check spam once).",
    ],
  },
  skoolvisit: {
    how: [
      "On Growth ladder, find Your Skool link.",
      "Open it once in a new tab. It goes to your About page and counts the click.",
    ],
  },
  events: {
    how: [
      "Open Events Manager and pick your Pixel.",
      "Look for a PageView and a Lead from your own sign-up. They can take a little while to show up.",
      "See both? Come back and press I can see PageView and Lead. Can't? Press Stuck?",
    ],
  },
  welcome: {
    how: [
      "Open your own group and start a new post.",
      "Say who the group is for and ask one easy question anyone can answer.",
      "Post it, pin it from the three dots on the post, then come back and press I pinned it.",
    ],
  },
  unlock: {
    target: "unlock-create",
    how: [
      "Your first one is filled in: your free guide, for one post of their own. Check it and press Create unlock.",
      "Press the big Copy Skool post, paste it in your group and pin it.",
      "Members do it, paste their link and get the reward by email.",
    ],
  },
  lesson: {
    how: [
      "In your group, open Classroom and add a course.",
      "Add one lesson with one quick win a new member can do straight away.",
      "Come back and press It's in my Classroom.",
    ],
  },
  warm: {
    how: [
      "List 20 people who have the problem you solve, or know someone who does.",
      "Text five, one at a time, in your own words. No link until they ask.",
      "Anyone who asks gets Copy link for texts from Growth ladder: it has ?src=text on the end. Anyone who replies goes in with Add contact at the top of Leads.",
    ],
  },
  review: {
    target: "ad-review",
    how: [
      "Only ads with 1,000 impressions or more. None yet? Press None at 1,000 yet. That's a normal answer.",
      "Copy each ad's spend, impressions and link clicks from Ads Manager, date range Maximum.",
      "Paste them here, one ad at a time, and say where it goes: My website or My Skool link. You get keep, fix or kill.",
      "Day 6: change nothing, except a broken Skool link. Too early means leave it running, and fixes go on next week's list.",
    ],
  },
  checkin: {
    target: "checkin",
    how: [
      "First one: Day 7, whatever the weekday. Zeros count.",
      "In Skool, open Settings › Growth.",
      "Copy your level, About-page visitors, new customers and Skool Network sign-ups.",
      "Type them into Check-in here and press Save check-in.",
    ],
  },
  decide: {
    how: [
      "Read what the app can see of your week, on the card.",
      "Decide in private whether this is for you. The app doesn't ask which way.",
      "Press I've decided. Only the time is saved, never your choice.",
    ],
  },
  /** Shared by every day's Skool post. {section} is that day's section name (see howFor). */
  post: {
    how: [
      "Open Skool and find the section called {section}.",
      "Press Copy my post here, paste it there and fill in the blanks.",
      'Review the post right before yours, then comment "Reviewed @their name" on your own post.',
      "Come back and tick both. The owner's audit comes as a reply on your post.",
    ],
  },
  customer: {
    how: [
      "List 20 people who have the problem you solve, or know someone who does, then text five.",
      "Follow up once, three days later, with anyone who replied. Just once.",
      "Ticks off when your check-in says 1 new customer.",
    ],
  },
  l2: {
    target: "checkin",
    how: [
      "Keep doing your weekly check-in. Level 2 needs 100 About-page visitors, 1 new customer and paid pricing.",
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
      "Then open A few extra numbers in your check-in and tick the bio box.",
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
      "Once a week, any day: check-in here (5 minutes). Four and it's a habit.",
    ],
  },
};

/** The how-to for a step. Every day's post shares one entry, with that day's section filled in. */
export function howFor(key: string, section?: string): StepHowTo | undefined {
  const isPost = /^post\d$/.test(key);
  const h = STEP_HOWTO[isPost ? "post" : key];
  if (!h || !isPost) return h;
  return { ...h, how: h.how.map((l) => l.replaceAll("{section}", section || "today's section")) };
}

export type PageGuide = { title: string; what: string; tips: string[] };

/** Keyed by the path after /app/w/<id>; the longest matching prefix wins. */
export const PAGE_GUIDES: Record<string, PageGuide> = {
  "": {
    title: "Dashboard",
    what: "Your one next step is the big card. Everything else can wait.",
    tips: [
      "Your numbers show up here once real visits come in.",
      "Lost? Follow me, one step at a time.",
    ],
  },
  path: {
    title: "Your path",
    what: "The seven days as a checklist, in the same order as your lessons in Skool.",
    tips: [
      "The big card is your one next thing.",
      "Nothing locks. Working ahead is fine.",
    ],
  },
  ai: {
    title: "Your AI",
    what: "Connect your Claude, so it writes your website, emails and ads and saves them here.",
    tips: [
      "Claude first: make a connector URL and paste it into Claude. The free Claude plan works.",
      "No Claude? A free Google Gemini key works too.",
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
  carousel: {
    title: "Make my carousel",
    what: "Turn a script into Instagram slides, ready to download and post.",
    tips: [
      "Paste a ReelVault script, or type a topic and let your AI write it.",
      "On Instagram: + › Post › pick all slides in order › Add music.",
    ],
  },
  sites: {
    title: "Funnels & pages",
    what: "Your website. A stranger gives their email here, gets your free checklist and sees your Skool offer.",
    tips: ["Change three lines, then Publish.", "Sign up yourself to test it."],
  },
  leads: {
    title: "Leads",
    what: "Everyone who signed up or messaged you, hottest first.",
    tips: [
      "Sign up on your own page once, to see your form work.",
      "Open a lead to see their whole story.",
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
      "Do the check-in once a week, any day you like.",
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
      "Day 2 goes to your website at $10 a day. Day 3 goes to your Skool link at $5, in its own campaign.",
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
      "First round: verdicts on Day 6. Change nothing that day, except a broken Skool link.",
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
      "Ads get you seen fast, and your posts make it stick. ReelVault shows you what to post.",
    ],
  },
  settings: {
    title: "Settings",
    what: "Your business details, Skool link and Meta Pixel.",
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
