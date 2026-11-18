// The Anti-Pete Week, as the app says it: day titles, step titles, Skool section names, post
// layouts and every win line. The course itself lives in Skool as text and pictures; this file
// only holds the words the app shows, in the same order as the lessons. When the course changes,
// change this file and nothing else.
// Client-safe: no server imports.

export type Where = "app" | "skool" | "meta" | "phone" | "you";
export type HrefKind =
  | "ai"
  | "referral"
  | "launch"
  | "sites"
  | "settingsTracking"
  | "research"
  | "studio"
  | "studioPlan"
  | "skool"
  | "ownGroup"
  | "website"
  | "growth"
  | "events"
  | "unlocks"
  | "ads"
  | "reelvault"
  | "carousel"
  | "metaPages"
  | "metaPlanner"
  | "none";
/**
 * app: the app sees it happen. you: the member's word. you-upgrades: the member's word until the
 * app sees proof, then it turns solid by itself.
 */
export type TickKind = "app" | "you" | "you-upgrades";

export type WeekDayDef = {
  day: number;
  title: string;
  /** The Skool Community section for this day. */
  section: string;
  /** "Make your own post" from the paste kit. {website} becomes the member's own site, {group} their own Skool group. */
  postLayout: string;
  /** What goes in the day's post, for the post step's one-line why. */
  postWhat: string;
  /** Under "You're done for today." */
  line: string;
};

export type WeekStepDef = {
  key: string;
  day: number;
  title: string;
  why: string;
  /** The button's words. */
  verb: string;
  where: Where;
  hrefKind: HrefKind;
  tick: TickKind;
  canLater: boolean;
  win: string;
  selfLabel?: string;
  reviewLabel?: string;
  waitingLabel?: string;
  /** Small print beside a self-tick: why this one is on the member's word. */
  note?: string;
};

export const WEEK: WeekDayDef[] = [
  {
    day: 1,
    title: "Your first win",
    section: "Day 1: My First Post",
    postWhat: "the link to your first post, the reel you borrowed the hook from and your group",
    postLayout: "My first post: [link]\nThe reel I borrowed the hook from: [link]\nMy group: {group}\nThe part that scared me: ___",
    line: "Day 1 done. Your first post is out, and your group exists.",
  },
  {
    day: 2,
    title: "Your shop window and your first ads",
    section: "Day 2: Website + Ads Live",
    postWhat: "your website, your 5 ads and how many posts you scheduled",
    postLayout: "My website: {website}\nMy 5 ads: [one image showing all five]\nPosts scheduled this week: __\nThe bit I'm most nervous about: ___",
    line: "Day 2 done. Your website is live, 5 ads are with Meta and this week's posts are planned.",
  },
  {
    day: 3,
    title: "A second road, and a stranger's eyes",
    section: "Day 3: Live or Stuck",
    postWhat: "your 5 Skool-link ads, your website and your Lead in Events Manager, or exactly where you're stuck",
    postLayout:
      "Live: {website}\nMy 5 Skool-link ads: [one image showing all five]\n[a screenshot of Events Manager showing your Lead]\nThe one thing I fixed today: ___\n\n(Stuck instead? Post the exact part you're on and the exact words on your screen.)",
    line: "Day 3 done. Ten ads on two roads, and you've walked through your own machine.",
  },
  {
    day: 4,
    title: "Furnish the room before guests arrive",
    section: "Day 4: Would You Answer?",
    postWhat: "who your group is for and the question from your welcome post",
    postLayout: "My group is for: [who]\nThe question from my welcome post: ___",
    line: "Day 4 done. The room is furnished.",
  },
  {
    day: 5,
    title: "Five real conversations",
    section: "Day 5: Would You Reply?",
    postWhat: "one of your texts, with the name taken out, and the line you're least sure about",
    postLayout: 'My text, name taken out: "___"\nThe line I\'m least sure about: ___',
    line: "Day 5 done. Five people have heard from you.",
  },
  {
    day: 6,
    title: "Your ad numbers, in plain words",
    section: "Day 6: Three Numbers",
    postWhat: "your three numbers",
    postLayout: "Website ads: $__ spent ÷ __ leads = $__ a lead\nSkool ads: $__ spent ÷ __ ad visits = $__ a visit\nThe verdict I'm least sure about: Web/Skool S_ got ___",
    line: "Day 6 done. You've read your first numbers.",
  },
  {
    day: 7,
    title: "The Level 2 checkpoint, and your decision",
    section: "Day 7: Before and After",
    postWhat: "your before and after",
    postLayout: "Day 1, I was nervous about: ___\nDay 7, I've got: ___\nMy best number: ___\nNext week I'll change: ___",
    line: "Seven days, done.",
  },
];

/** Day 6's line when the verdicts step is the clock tick ("None at 1,000 yet"). */
export const DAY6_WAITING_LINE = "Day 6 done. Your numbers need more time, and that's normal.";

const POSTED = "I posted mine";
const REVIEWED = "I reviewed the one before me";
const POST_WIN = "Done: posted and reviewed. Your audit comes as a reply on your post.";

const post = (day: number): WeekStepDef => {
  const d = WEEK[day - 1];
  return {
    key: `post${day}`,
    day,
    title: `Post your Day ${day} and review one`,
    why: `Post ${d.postWhat} in the section called ${d.section}. Then review the post right before yours and comment "Reviewed @their name" on your own post. That's what gets your post audited.`,
    verb: "Open Skool",
    where: "skool",
    hrefKind: "skool",
    tick: "you",
    canLater: false,
    win: POST_WIN,
    selfLabel: POSTED,
    reviewLabel: REVIEWED,
  };
};

const ADS_MANAGER_NOTE = "The app can't see Ads Manager, so this one is on your word.";

export const WEEK_STEPS: WeekStepDef[] = [
  // Day 1: your first win. Content first: find what already works, make your first post and put it
  // out, then open your group. Nothing spends money today, and nothing needs a paid tool.
  {
    key: "ai",
    day: 1,
    title: "Connect your Claude",
    why: "Claude writes your carousel, your website and your emails, and saves them straight into the app. No Claude? A free Gemini key works too.",
    verb: "Connect my Claude",
    where: "app",
    hrefKind: "ai",
    // Claude through the connector, or a saved key: either ticks it. A member with neither still gets
    // through the week on the included runs.
    tick: "you-upgrades",
    selfLabel: "I'll use my 3 included runs",
    canLater: true,
    win: "Done: your AI key is saved. No more counting runs.",
  },
  {
    key: "reel1",
    day: 1,
    title: "Find what already works in your niche",
    why: "Open ReelVault and add 1 to 3 accounts in your niche, or let it find the top ones. Open the outliers: reels that got 3 times that creator's normal views, or more. Pick one and press Remake this for a script in your own words.",
    verb: "Open ReelVault",
    where: "app",
    hrefKind: "reelvault",
    tick: "you",
    canLater: false,
    win: "Done: you have a script, borrowed from a reel that already works.",
    selfLabel: "I've got my script",
    note: "ReelVault doesn't tell the app which reel you picked, so this one is on your word.",
  },
  {
    key: "carousel",
    day: 1,
    title: "Make your first post",
    why: "Turn your script into a carousel in Make my carousel. Rather be on camera? Film it as a short talking-head video instead: phone at eye level, one take, no editing.",
    verb: "Make my carousel",
    where: "app",
    hrefKind: "carousel",
    // A saved carousel ticks it. A video on the member's phone is their word.
    tick: "you-upgrades",
    canLater: false,
    win: "Done: your first post is made.",
    selfLabel: "I filmed a video instead",
    note: "A saved carousel ticks this by itself. The app can't see a video on your phone, so that one is on your word.",
  },
  {
    key: "firstpost",
    day: 1,
    title: "Post it on Instagram",
    why: "A carousel: post the slides in order and add music in the Instagram app. A video: post it as a reel, no editing needed. People who see your ads tomorrow will look at your profile, so this is the start of it.",
    verb: "I posted it",
    where: "phone",
    hrefKind: "none",
    tick: "you",
    canLater: false,
    win: "Done: your first post is out. That's your first win.",
    selfLabel: "I posted it",
    note: "The app can't see Instagram, so this one is on your word.",
  },
  {
    key: "skool",
    day: 1,
    title: "Open your own Skool group",
    why: "This is the room people will pay to join. Start it (or use the group you already have), set a monthly price and switch on the 7-day free trial, then paste its link here so every Join button knows where to go.",
    verb: "Start my group",
    where: "skool",
    hrefKind: "referral",
    tick: "app",
    canLater: false,
    win: "Done: your group's link is saved. Every Join button now goes there.",
  },
  {
    key: "kit",
    day: 1,
    title: "Build your launch kit",
    why: "AI writes your Skool About page and your group description, then makes your cover. It writes your website, free checklist and emails too: those go live tomorrow. Press it once.",
    verb: "Build my launch kit",
    where: "app",
    hrefKind: "launch",
    tick: "app",
    canLater: false,
    win: "Done: your About page, group description and cover are ready. Your website, free checklist and emails wait for tomorrow.",
  },
  post(1),
  // Day 2: your shop window and your first ads. Your profile and your website first (half-time), then
  // the Pixel, your first 5 ads and this week's posts.
  {
    key: "pages",
    day: 2,
    title: "Set up your Facebook Page and Instagram",
    why: "Make both business (or creator) accounts, link them together in Meta, and put your Skool group's link in your Instagram bio. Your ads run from this Page, and anyone who looks you up finds a real profile.",
    verb: "Open Meta Business Suite",
    where: "meta",
    hrefKind: "metaPages",
    tick: "you",
    canLater: false,
    win: "Done: your Page and Instagram are linked, with your Skool link in the bio.",
    selfLabel: "Both are set up",
    note: "The app can't see Facebook or Instagram, so this one is on your word.",
  },
  {
    key: "publish",
    day: 2,
    title: "Put your website live",
    why: "It's built on the premium template, with your free checklist on it. Change three lines, check your thank-you page states the deal, then press Publish.",
    verb: "Open my website",
    where: "app",
    hrefKind: "sites",
    tick: "app",
    canLater: false,
    win: "Done: your website is live.",
  },
  {
    key: "pixel",
    day: 2,
    title: "Connect your Meta Pixel",
    why: "It tells Meta who gave you their email, so Meta can find more people like them. Your website ads use it.",
    verb: "Open Pixel setup",
    where: "app",
    hrefKind: "settingsTracking",
    tick: "app",
    canLater: true,
    win: "Done: your Pixel is saved.",
  },
  {
    key: "research",
    day: 2,
    title: "Find ads that already work",
    why: "Copy 3 ads that have run a month or more from Meta's Ad Library, paste them in, then press Analyse with AI to see what's working and the gaps nobody uses yet.",
    verb: "Open Ad research",
    where: "app",
    hrefKind: "research",
    tick: "app",
    canLater: true,
    win: "Done: your ad research is saved.",
  },
  {
    key: "statics",
    day: 2,
    title: "Make your 5 ads",
    why: "Five different image ads for your free checklist, with the exact clicks to launch them. Pick My website as where they go.",
    verb: "Open Ad studio",
    where: "app",
    hrefKind: "studio",
    tick: "app",
    canLater: false,
    win: "Done: your 5 ads are written.",
  },
  {
    key: "clicks",
    day: 2,
    title: "Put your 5 ads live",
    why: "Follow your launch plan in Meta Ads Manager: a Leads campaign to your website, $10 a day. Press Publish, then come back and tick it.",
    verb: "Open my launch plan",
    where: "meta",
    hrefKind: "studioPlan",
    tick: "you-upgrades",
    canLater: false,
    win: "Done: you pressed Publish. Now it's Meta's turn.",
    selfLabel: "I pressed Publish",
    note: ADS_MANAGER_NOTE,
  },
  {
    key: "planweek",
    day: 2,
    title: "Plan this week's posts in one sitting",
    why: "Make 3 more carousels or scripts, the same way as yesterday. Then schedule them for free in the Planner in Meta Business Suite, for Facebook and Instagram at once, so they go out without you.",
    verb: "Open the Planner",
    where: "meta",
    hrefKind: "metaPlanner",
    tick: "you",
    canLater: true,
    win: "Done: this week's posts are scheduled.",
    selfLabel: "They're scheduled",
    note: "The app can't see Meta's Planner, so this one is on your word.",
  },
  post(2),
  // Day 3: a second road (5 ads to the Skool link), and a stranger's eyes on your own website.
  {
    key: "refresh",
    day: 3,
    title: "Make 5 more ads for your Skool link",
    why: "Fresh ideas from Gaps nobody uses yet. Pick My Skool link and $5 a day, so these go straight to your group.",
    verb: "Open Ad studio",
    where: "app",
    hrefKind: "studio",
    tick: "app",
    canLater: false,
    win: "Done: five more ads, made for your Skool link.",
  },
  {
    key: "live2",
    day: 3,
    title: "Launch them in their own campaign",
    why: "A Traffic campaign to your Skool link at $5 a day, separate from yesterday's, so your website ads are left alone. Press Publish, then tick it.",
    verb: "Open my launch plan",
    where: "meta",
    hrefKind: "studioPlan",
    tick: "you-upgrades",
    canLater: false,
    win: "Done: your second campaign is published. Two roads in now.",
    selfLabel: "I pressed Publish",
    note: ADS_MANAGER_NOTE,
  },
  {
    key: "lead1",
    day: 3,
    title: "Sign up on your own website",
    why: "Open your website on your phone and sign up with your own email, like a stranger would. Then you've seen your form work with your own eyes.",
    verb: "Open my website",
    where: "phone",
    hrefKind: "website",
    tick: "app",
    canLater: false,
    win: "Done: your form works. A sign-up is in Leads.",
  },
  {
    key: "skoolvisit",
    day: 3,
    title: "Click your own Skool link once",
    why: "Open Your Skool link on Growth ladder and press it once, so you can see it counting.",
    verb: "Open Growth ladder",
    where: "app",
    hrefKind: "growth",
    tick: "app",
    canLater: true,
    win: "Done: your Skool link counted its first click.",
  },
  {
    key: "events",
    day: 3,
    title: "Find yourself in Meta",
    why: "In Events Manager, look for the PageView and the Lead from the sign-up you just did.",
    verb: "Open Events Manager",
    where: "meta",
    hrefKind: "events",
    tick: "you",
    canLater: true,
    win: "Done: Meta can see your website.",
    selfLabel: "I can see PageView and Lead",
    note: "The app can't see Events Manager, so this one is on your word. Can't find them? Press Stuck?",
  },
  post(3),
  // Day 4
  {
    key: "welcome",
    day: 4,
    title: "Pin your welcome post",
    why: "In your own group, post a welcome with one easy question and pin it, so the first person in has something to answer.",
    verb: "Open my group",
    where: "skool",
    hrefKind: "ownGroup",
    tick: "you",
    canLater: true,
    win: "Done: your welcome post is pinned.",
    selfLabel: "I pinned it",
  },
  {
    key: "unlock",
    day: 4,
    title: "Create your first Unlock",
    why: "A small reward for a real post in your group. Your free checklist is already sitting there.",
    verb: "Open Unlocks",
    where: "app",
    hrefKind: "unlocks",
    tick: "app",
    canLater: false,
    win: "Done: your first Unlock exists.",
  },
  {
    key: "lesson",
    day: 4,
    title: "Add your first lesson",
    why: "One quick win in your Classroom, so a new member gets something useful the day they join.",
    verb: "Open my group",
    where: "skool",
    hrefKind: "ownGroup",
    tick: "you",
    canLater: true,
    win: "Done: your Classroom has its first lesson.",
    selfLabel: "It's in my Classroom",
  },
  post(4),
  // Day 5
  {
    key: "warm",
    day: 5,
    title: "Text five people you know",
    why: "List 20 people who have the problem you solve, then text five by hand. Send your link only when they ask.",
    verb: "Copy my link for texts",
    where: "phone",
    hrefKind: "growth",
    tick: "you-upgrades",
    canLater: false,
    win: "Done: five texts sent.",
    selfLabel: "I sent five",
    note: "The app can't see your texts, so this one is on your word. It ticks itself when you add someone in Leads or your link counts a text click.",
  },
  post(5),
  // Day 6
  {
    key: "review",
    day: 6,
    title: "Get your first verdicts",
    why: "Copy the numbers of each ad with 1,000 impressions or more into Ad review. You get keep, fix or kill for each one.",
    verb: "Open Ad review",
    where: "app",
    hrefKind: "ads",
    tick: "you-upgrades",
    canLater: false,
    win: "Done: your first verdicts are in.",
    waitingLabel: "None at 1,000 yet",
  },
  post(6),
  // Day 7
  {
    key: "checkin",
    day: 7,
    title: "Do your first check-in",
    why: "Copy four numbers from Skool › Settings › Growth into your check-in. Zeros count.",
    verb: "Open Growth ladder",
    where: "app",
    hrefKind: "growth",
    tick: "app",
    canLater: false,
    win: "Done: your first check-in is saved. Zeros count.",
  },
  {
    key: "decide",
    day: 7,
    title: "Make your call, in private",
    why: "Your call, and it stays yours. The app doesn't ask which way, and it can't see your Skool billing.",
    verb: "I've decided",
    where: "you",
    hrefKind: "none",
    tick: "you",
    canLater: false,
    win: "Decided. That stays yours.",
    selfLabel: "I've decided",
    note: "Only the time you ticked this is saved, never which way you went.",
  },
  post(7),
];

/** The intro post, before Day 1, when the platform asks for one. Ticks from the entry ticket. */
export const HELLO_STEP: WeekStepDef = {
  key: "hello",
  day: 1,
  title: "Say hi in the community",
  why: "Your intro is your first post in the community, and the owner answers it with a question.",
  verb: "Open my intro",
  where: "skool",
  hrefKind: "none",
  tick: "app",
  canLater: false,
  win: "Done: your intro is posted.",
};

/** Day 6's verdicts step, ticked as "None at 1,000 yet": the clock, not a to-do. */
export const REVIEW_WAITING_WIN = "Your numbers need more time. That's normal this early.";

/** Day 1's AI step, ticked as "I'll use my 3 included runs": no key is saved, so its win says so. */
export const AI_RUNS_WIN = "Done: you're on your 3 included runs. You can connect Claude or add a free key in Your AI any time.";

/** Day 1's AI step, seen from a connected Claude (a connector link) rather than a saved key. */
export const AI_CONNECTOR_WIN = "Done: your Claude is connected. Ask it to build your website and emails, and it saves them here.";

/** A step carried over from the old day order (withCarriedTicks): done on the member's post, not on anything the app saw. */
export const CARRIED_WIN = "Counted as done: you'd posted this far before the week changed order.";

/**
 * Course unlocks: what pasting a day's post link gives, besides the next lesson opening in Skool.
 * Each is a bonus lesson in Skool. Day 6 has none (every bonus is open by then). Nothing in the app
 * is a reward: ReelVault and every other tool are open from the start.
 */
export const DAY_REWARDS: Record<number, string> = {
  1: 'Your reward: the bonus lesson "Steal the Hook" opens in Skool too.',
  2: 'Your reward: the bonus lesson "Ten Posts From One Reel" opens in Skool too.',
  3: 'Your reward: the bonus lesson "The Text That Gets a Reply" opens in Skool too.',
  4: 'Your reward: the bonus lesson "The About Page Swipe" opens in Skool too.',
  5: 'Your reward: the bonus lesson "Your Second Week" opens in Skool too.',
  7: "One more thing: the weekly live call is in the Skool calendar. Come and say hi.",
};

/** Day 2 is two sittings: the half-time line sits under this step on today's list. */
export const HALF_TIME = { day: 2, after: "publish" } as const;

/**
 * Ticks saved under steps the week no longer has. A member who ticked "Post your first video or
 * carousel" (video1, the old Day 2) made and posted their first post, so it counts for both of
 * today's Day 1 steps. "Name 3 competitors" (rivals) has no step now and counts for nothing.
 * Read through withLegacyTicks(), never written.
 */
export const LEGACY_TICKS: Record<string, string[]> = {
  video1: ["carousel", "firstpost"],
};

/** The member's saved ticks, with old keys counted for the steps that replaced them. Pure. */
export function withLegacyTicks<T>(ticks: Record<string, T> | undefined): Record<string, T> {
  const out: Record<string, T> = { ...(ticks ?? {}) };
  for (const [old, keys] of Object.entries(LEGACY_TICKS)) {
    const t = ticks?.[old];
    if (!t) continue;
    for (const k of keys) if (!out[k]) out[k] = t;
  }
  return out;
}

/**
 * When this day order went live. Before it, Day 1 was the website, the Pixel and 5 ads, and Day 2
 * the Skool-link ads. Used only for carry-over (carriedTicks), nothing else.
 */
export const WEEK_V5_SINCE = new Date("2026-11-18T21:15:00Z");

/**
 * Steps only this day order has. A tick on one of them from before WEEK_V5_SINCE means the member was
 * already on this order (a preview), so there is nothing to carry over for them.
 */
const V5_ONLY_KEYS = ["reel1", "carousel", "firstpost", "pages", "planweek", ...Object.keys(LEGACY_TICKS)];

type SavedTick = { at: string; as?: string };
type SavedPost = { url?: string; at?: string; flagged?: boolean };
/** A step counted done because the member posted that day (or a later one) on the old week. Never saved. */
export type CarriedTick = { at: string; as: "carried" };

const before = (at: string | undefined, since: Date) => {
  const t = at ? Date.parse(at) : NaN;
  return Number.isFinite(t) && t < since.getTime();
};

/**
 * Carry-over from the old day order: the last day whose post went in before WEEK_V5_SINCE (a ticked
 * post, or a saved post link), and every key of that day and the days before it (both halves of each
 * post). day 0 and no keys when there is nothing to carry. `at` is when that post went in. Pure.
 */
export function carryRange(ticks: Record<string, SavedTick> | undefined, posts?: Record<string, SavedPost> | undefined, since: Date = WEEK_V5_SINCE): { day: number; at: string; keys: string[] } {
  const none = { day: 0, at: "", keys: [] as string[] };
  if (V5_ONLY_KEYS.some((k) => before(ticks?.[k]?.at, since))) return none;
  let day = 0;
  let at = "";
  for (const d of WEEK) {
    const t = ticks?.[`post${d.day}`];
    const p = posts?.[String(d.day)];
    const tickAt = t && t.as !== "waiting" && before(t.at, since) ? t.at : "";
    const linkAt = p?.url && !p.flagged && before(p.at, since) ? (p.at as string) : "";
    const when = tickAt || linkAt;
    if (when) {
      day = d.day;
      at = when;
    }
  }
  if (!day) return none;
  const keys = WEEK_STEPS.filter((s) => s.day <= day).flatMap((s) => (POST_KEYS.includes(s.key) ? [s.key, `${s.key}r`] : [s.key]));
  return { day, at, keys };
}

/**
 * The member's ticks, with every step they hadn't ticked on a carried-over day counted as done
 * (as "carried"): a member who posted Days 1 and 2 on the old order lands on Day 3, not back on
 * Day 1. `uncarried` holds the steps they undid since. Pass ticks through withLegacyTicks first.
 * Read only, never written. Pure.
 */
export function withCarriedTicks<T extends SavedTick>(
  ticks: Record<string, T>,
  posts?: Record<string, SavedPost> | undefined,
  uncarried?: Record<string, string> | undefined,
  since: Date = WEEK_V5_SINCE,
): Record<string, T | CarriedTick> {
  const range = carryRange(ticks, posts, since);
  const out: Record<string, T | CarriedTick> = { ...ticks };
  for (const k of range.keys) if (!out[k] && !uncarried?.[k]) out[k] = { at: range.at, as: "carried" };
  return out;
}

export const POST_KEYS = WEEK.map((d) => `post${d.day}`);
export const POST_REVIEW_KEYS = WEEK.map((d) => `post${d.day}r`);

/** Keys the member may tick by hand. "review" only ever as the waiting clock. */
export const SELF_TICK_KEYS: string[] = [
  ...WEEK_STEPS.filter((s) => s.tick !== "app" && s.key !== "review").map((s) => s.key),
  ...POST_REVIEW_KEYS,
  "review",
];

export const WHERE_LABEL: Record<Where, string> = {
  app: "In the app",
  skool: "In Skool",
  meta: "In Meta",
  phone: "On your phone",
  you: "Just you",
};

/** The post-link box's example: the Skool group the post goes in, when we know it. */
export function postLinkPlaceholder(group: string | null | undefined): string {
  return group ? `https://www.skool.com/${group}/…` : "https://www.skool.com/…";
}

/** Day 5's "add someone who replied" link: Leads opens the form with the tag "friend" already in. */
export const DAY5_ADD_CONTACT = "leads?add=1&from=day5#add-contact";

/** What the Add contact form starts with. Opened from Day 5, the person is a friend you texted. */
export function addContactPreset(from: string | undefined): { tags: string; welcome: boolean } {
  return from === "day5" ? { tags: "friend", welcome: false } : { tags: "", welcome: false };
}

export type EventKey = "adLead" | "adClick" | "claim";
/** Real events, shown once each whatever step the member is on. Only from data the app reads. */
export const EVENT_WINS: Record<EventKey, { text: string; link: string; to: "leads" | "growth" | "unlocks" }> = {
  adLead: { text: "Your first lead from an ad just landed.", link: "See them", to: "leads" },
  adClick: { text: "Your first click from an ad just landed on your Skool link.", link: "See it", to: "growth" },
  claim: { text: "Someone claimed your Unlock.", link: "Thank them by name", to: "unlocks" },
};

/**
 * The day this checklist shipped. Accounts made more than 8 days before it, with no journey
 * saved, are past their week: they get the numbers dashboard and nothing is owed.
 */
export const JOURNEY_SINCE = new Date("2026-11-17T00:00:00Z");

/** Every other string on Dashboard, Your path and Penny. {name} style slots are filled by fill(). */
export const JOURNEY_COPY = {
  home: {
    firstTitle: "Welcome, {name}",
    firstTitleNoName: "Welcome",
    firstSub: "This page always shows your one next step. Do it, come back, and the next one is waiting.",
    doingTitle: "Day {day} · {title}",
    doingSub: "{done} of {total} done.",
    newDaySub: "Day {prev} is done. Here's today's first step.",
    dayDoneTitle: "Day {day} done",
    dayDoneSub: "That's everything for today.",
    weekDoneTitle: "Seven days, done",
    weekDoneSub: "Here's what you built, from what the app can see.",
    backTitle: "Welcome back, {name}",
    backTitleNoName: "Dashboard",
    backSub: "How your website did over the last 14 days.",
    veteranNote: "Your path now has the seven days as a checklist. Nothing there is owed.",
    veteranButton: "Open Your path",
    resultsTitle: "Your results",
    resultsSub: "Real visits and sign-ups on your website.",
    viewsHint: "Last 14 days",
    leadsHint: "Last 14 days",
    clicksHint: "Last 30 days",
    newestLeads: "Newest leads",
    newestLeadsSub: "Everyone who signed up on your pages, newest first.",
    allLeads: "All leads",
    noNumbersTitle: "No visits yet",
    noNumbersBody: "Your numbers show up here once your website gets its first visit. Nothing is drawn until then.",
    noNumbersButton: "Open Funnels & pages",
    chartTitle: "Views and leads",
    chartSub: "Daily, last 14 days",
  },
  /** The link after a win line: proof that the thing exists. */
  proof: {
    kit: "Read them",
    publish: "Open it",
    pixelAccepted: "Meta accepted a test event",
    pixelUntested: "Not tested with Meta yet",
    research: "See the gaps",
    carousel: "See your slides",
    statics: "Open your launch plan",
    lead1: "Open Leads",
    unlock: "Copy its Skool post",
    review: "Read them",
  },
  strip: {
    caption: "Day {day} · {title} · {done} of {total} done",
    pathCount: "{done} of {total} this week",
    legendApp: "Seen by the app",
    legendYou: "You ticked this",
    legendWaiting: "Waiting on someone else",
    dayLink: "Day {day}",
  },
  hero: {
    eyebrowFirst: "Start here · Day 1, step {n} of {count}",
    eyebrowNext: "Next · step {n} of {count}",
    eyebrowLast: "Last step today · In Skool",
    eyebrowLaterOnly: "One left from Day {day}",
    laterOnlyBody: "You saved this one for later. It's the only Day {day} step still open.",
    stuck: "Stuck?",
    later: "Do this later",
    groupSmall: "That's our referral link. Skool pays us if you stay, and it costs you nothing extra.",
    groupNoReferral: "The link to start your group is in your Day 1 lesson.",
    groupField: "Your group's link",
    groupPlaceholder: "https://www.skool.com/your-group",
    groupSave: "Save link",
    wordSkool: "The app can't see Skool, so this one is on your word.",
    wordPhone: "The app can't see your phone, so this one is on your word.",
    wordYou: "Only you know this one, so it's on your word.",
    wordMeta: "The app can't see Meta, so this one is on your word.",
    noOwnGroup: "Open your own group in Skool.",
    // Day 1's AI step: Claude is the pink button, the free key is the quiet way round.
    aiFallback: "No Claude? Get a free Gemini key instead",
    warmAdd: "Someone replied? Add them in Leads",
    aiRunsNote: "Neither today? Your 3 included runs get you started.",
    // Day 1's ReelVault step when ReelVault isn't switched on for this app: the same job, by hand.
    reelVaultOff: "ReelVault isn't switched on here yet, so do it by hand: open 3 accounts in your niche on Instagram, look at their most-viewed reels, pick one and write its script in your own words.",
    reviewWaitEyebrow: "Day 6 · Nothing to judge yet",
    reviewWaitTitle: "Your ads need more time",
    reviewWaitBody: "Ad review only works on an ad with 1,000 impressions or more. None there yet is normal this early. It isn't a bad sign or a good one.",
    reviewWaitCta: "Check my numbers",
    decideFacts: "What the app can see of your week",
    decideEmpty: "Nothing on here yet, and that's fine. It's a list, not a score.",
  },
  post: {
    openSkool: "Open Skool",
    noSkool: "Open the community in Skool",
    section: "Section",
    copyPost: "Copy my post",
    firstIn: "First one in today? Review the owner's post in that section.",
    word: "The app can't see Skool. These two ticks are your word.",
    // Course unlocks: the post half is the pasted link instead of a tick.
    linkWhy: "Then copy your post's link in Skool (the ⋯ menu › Copy link) and paste it here. That opens your next lesson.",
    linkField: "Link to your Day {day} post",
    linkPlaceholder: "https://www.skool.com/…",
    linkHint: "In Skool: ⋯ on your post › Copy link",
    linkSave: "Save my post link",
    linkSaved: "Posted · link saved",
    linkWord: "The app can't see Skool. Your post's link opens the next lesson, and the review is your word.",
    linkNext: "Tomorrow's lesson is opening in Skool now.",
    linkLast: "Your last post of the week is in.",
    // A post ticked before course unlocks went on: it counts, but Skool only opens the next lesson from its link.
    linkCatchUp: "Paste your Day {day} post link to open your next lesson in Skool.",
    linkCatchUpLast: "Paste your Day {day} post link so your last post of the week counts in Skool too.",
    linkFlagged: "Saved. The owner takes a quick look at this link before your next lesson opens ({reason}). Pasted the wrong one? Paste your own post's link below.",
    linkInstead: "Paste your post's link to tick this one.",
    opensToday: "Opens when you post today's",
    opensAfter: "Opens after your Day {day} post",
    posted: "Posted",
    reviewed: "Reviewed",
    pathRow: "Post in {section}, then review the post before yours",
    noWebsite: "[your link]",
  },
  dayDone: {
    heading: "You're done for today.",
    exists: "This is what exists now:",
    youTicked: "(you ticked this)",
    tomorrow: "Tomorrow · Day {day}: {title}.",
    start: "Start Day {day} now",
    comeBack: "or come back tomorrow. Nothing closes.",
  },
  weekDone: {
    heading: "Seven days, done.",
    after: "From here it's one small job a week: your weekly check-in.",
    cta: "Open Growth ladder",
  },
  waiting: {
    title: "Meta is checking your ads",
    body: "Nothing for you to do. Meta reviews new ads before they run, and if one is turned down, Meta tells you why in Ads Manager.",
    live: "They're live",
    turnedDown: "One was turned down",
    liveOk: "Good. Your ads are out there now.",
  },
  today: {
    title: "Today's steps",
    sub: "Day {day} · step {n} of {count} today",
    firstTitle: "Today is your first win",
    firstSub: "{count} steps. By the last one, your first post is out and your group exists.",
    whole: "Whole week",
    // Day 2 is two sittings: your profile and your website, then the Pixel, the ads and this week's posts.
    halfTimeDone: "Half-time. Your Page, your Instagram and your website are sorted, and nothing is spending. The Pixel, the ads and this week's posts are the second sitting. Stop here or carry on, the app remembers where you were.",
    halfTimeAhead: "Half-time comes once your website is live. The Pixel, the ads and this week's posts are the second sitting, so you can stop there and carry on later. The app remembers where you were.",
  },
  later: {
    line: "Saved for later: {title}",
    doItNow: "Do it now",
    saved: "Saved for later. It comes back before Day {next} starts.",
    savedLastDay: "Saved for later. It comes back before your week ends.",
    back: "Back on your list.",
  },
  row: {
    seen: "Seen by the app",
    youTicked: "You ticked this",
    undo: "Undo",
    waiting: "Waiting on your ads' numbers",
    saved: "Saved for later",
    doNow: "Do it now",
    next: "Next",
    aheadNote: "Day {day} still has {open} open. Your home page starts with those.",
    oneStep: "1 step",
    manySteps: "{n} steps",
    untick: "Unticked. It's back on your list.",
  },
  path: {
    eyebrow: "The Anti-Pete Week",
    title: "Your path",
    sub: "Seven days, in the same order as your lessons in Skool. Go at your own speed. Nothing locks and nothing closes.",
    // Course unlocks on: Skool drips the lessons, so "nothing locks" would not be true there.
    subUnlocks: "Seven days, in the same order as your lessons in Skool. Go at your own speed. Each day's lesson opens in Skool when you paste the link to your post from the day before. The app's tools never lock.",
    dayTag: "Day {day}",
    youreHere: "You're here",
    done: "Done",
    count: "{done} of {total}",
    afterTitle: "After your week",
    afterSub: "These tick themselves from your check-ins. Nothing here is a to-do today.",
    ticksItself: "Ticks itself",
    loopTitle: "The Skool Loop, live",
    loopSub: "Ad, Skool link, lead, customer. Each number opens where it comes from.",
    loopClicks: "Skool link clicks",
    loopLeads: "Leads",
    loopCustomers: "New paying members",
    last30: "last 30 days",
    fromCheckin: "from your check-in",
    veteranLine: "This checklist is newer than your account. Nothing here is owed.",
    veteranStart: "Start the checklist anyway",
  },
  stuck: {
    title: "Stuck on: {title}",
    sub: "Three ways out. None of them is wrong.",
    tryThis: "Try this",
    ask: "Ask in Skool",
    askText: "Stuck on Day {day}, step {n} ({title}). What I did: ___ What my screen says: ___",
    copy: "Copy",
    openSkool: "Open Skool",
    noReview: "Asking for help doesn't need a review first.",
    laterTitle: "Do this later",
    laterBody: "It moves to the end of Day {day}. Your home page shows it again before the next day starts.",
  },
  penny: {
    hello: "Hi, I'm Penny. I'll show you one step at a time, on the page where you do it. Follow the glowing dot. You can switch me off at the top.",
    gotIt: "Got it",
    kicker: "Day {day} · step {n} of {count}",
    here: "You're in the right place. Here's how:",
    showMe: "Show me where",
    takeMe: "Take me there",
    backHome: "Back to Dashboard",
    elsewhere: "Your next step is in {place}.",
    nextLabel: "Next",
    flip: "{win} Next: {title}.",
    flipLast: "{win}",
    dayDone: "Day {day} done. Nothing else today.",
    metaTurn: "Meta's still checking your ads. Nothing for you to do there.",
    open: "Open your guide",
    openNext: "Open your guide. Next: {title}",
    minimise: "Minimise",
    off: "Turn off (the Guide button at the top turns me back on)",
    about: "About this page: {title}",
  },
  actions: {
    postedHalf: "Ticked: you posted yours. Next, review the post right before it.",
    reviewedHalf: "Ticked: you reviewed one. Next, post your own.",
    started: "Day {day} is open. Here's its first step.",
    startedChecklist: "The checklist is on. Here's where it starts.",
    groupError: "Your Skool link must be a skool.com link, like https://www.skool.com/your-group",
    groupEmpty: "Paste your group's link first, then press Save link.",
    notYours: "That step ticks itself when the app sees it done.",
    notLater: "That step can't be saved for later. It's part of today's finish line.",
  },
} as const;

/** Fill {slots} in a copy string. */
export function fill(text: string, vars: Record<string, string | number | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined ? m : String(vars[k])));
}

/** A day's post layout with the member's website in place of {website} and their own Skool group in place of {group}. */
export function postFor(day: number, website?: string, group?: string): string {
  const d = WEEK[day - 1];
  if (!d) return "";
  return d.postLayout.replaceAll("{website}", website || JOURNEY_COPY.post.noWebsite).replaceAll("{group}", group || JOURNEY_COPY.post.noWebsite);
}

export const stepDef = (key: string): WeekStepDef | undefined => (key === "hello" ? HELLO_STEP : WEEK_STEPS.find((s) => s.key === key));

/** Every string in this file, for the honesty tests. */
export function allWeekStrings(): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk([WEEK, WEEK_STEPS, HELLO_STEP, EVENT_WINS, JOURNEY_COPY, DAY6_WAITING_LINE, REVIEW_WAITING_WIN, AI_RUNS_WIN, AI_CONNECTOR_WIN, CARRIED_WIN, DAY_REWARDS, WHERE_LABEL]);
  return out;
}
