import * as z from "zod/v4";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, emailSequences, emailSequenceSteps, pages, sites, workspaces, type PageKind } from "@/lib/db/schema";
import { pageContentSchema, siteThemeSchema, type PageContent, type SiteTheme } from "@/lib/db/types";
import { env } from "@/lib/env";
import { DEFAULT_SEQUENCE } from "../defaults";
import { createSite, getSite, newSectionId, type Site } from "../sites";
import { AD_ANGLES, AD_FRAMEWORK_RULES } from "./adFramework";
import { VOICE_RULES, chargeAi, describeAiError, generateStructured, refundAi } from "./client";
import { isUuid } from "@/lib/util";

export const launchKitInputSchema = z.object({
  businessName: z.string().min(2).max(80),
  ownerName: z.string().min(1).max(60),
  niche: z.string().min(3).max(160),
  audience: z.string().min(3).max(200),
  outcome: z.string().min(3).max(200),
  /** The name the member gave their free checklist. Blank: the AI names it. */
  leadMagnetIdea: z.string().max(200).default(""),
  offer: z.string().max(200).default(""),
  /** What they charge a month, as they typed it ("$29"). With trialDays it becomes the offer line. */
  price: z.string().trim().max(20).optional(),
  /** Days of free trial on their group. 0 means no free trial. */
  trialDays: z.coerce.number().int().min(0).max(90).optional(),
  skoolUrl: z.string().max(300).default(""),
  tone: z.enum(["friendly", "bold", "calm"]).default("friendly"),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#2A44EE"),
});
export type LaunchKitInput = z.infer<typeof launchKitInputSchema>;

// No min/max counts here: counts live in the prompt and we normalize afterwards.
export const launchKitSchema = z.object({
  leadMagnetName: z.string(),
  leadMagnetType: z.string(),
  leadMagnetContent: z.string(),
  eyebrow: z.string(),
  headline: z.string(),
  subheadline: z.string(),
  bullets: z.array(z.string()),
  ctaText: z.string(),
  formTitle: z.string(),
  benefitsTitle: z.string(),
  benefits: z.array(z.object({ title: z.string(), body: z.string() })),
  steps: z.array(z.object({ title: z.string(), body: z.string() })),
  aboutTitle: z.string(),
  aboutBody: z.string(),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  thankYouHeadline: z.string(),
  thankYouBody: z.string(),
  thankYouButton: z.string(),
  emails: z.array(z.object({ subject: z.string(), body: z.string() })),
  ads: z.array(z.object({ angle: z.enum(AD_ANGLES), hook: z.string(), turn: z.string(), door: z.string(), headline: z.string(), description: z.string() })),
  hooks: z.array(z.string()),
  skoolAboutPage: z.string(),
  adPlan: z.object({
    dailyBudgetUsd: z.number(),
    audience: z.string(),
    campaigns: z.array(z.object({ name: z.string(), objective: z.string(), budgetUsd: z.number(), why: z.string() })),
    firstWeek: z.array(z.string()),
  }),
});
export type LaunchKit = z.infer<typeof launchKitSchema>;

const SYSTEM = `You are a direct-response marketer who builds lead funnels for Skool community owners, coaches and personal trainers.
You write a complete "launch kit" for one community: a free checklist (the lead magnet), a landing page, a thank-you page that sends people to the Skool group, three follow-up emails, Meta ad copy, hooks and a Skool About page.
The owner grows with small paid ads, not social media. The first ads send people to the owner's website for the free checklist. The thank-you page then invites them into the Skool group.
The lead magnet is always a free checklist someone can tick off in a week, so leadMagnetType is "checklist".

${VOICE_RULES}

${AD_FRAMEWORK_RULES}

Formatting rules:
- Email bodies and the lead magnet use plain text with blank lines between paragraphs. Use "- " for list items and **bold** for emphasis. No HTML.
- In emails, use {{first_name}} for the reader's name, {{lead_magnet_url}} for the lead magnet link and {{skool_url}} for the group link. Sign emails with the owner's first name.
- The Skool About page uses plain text with emojis as bullets. Skool has no bold, so keep structure with line breaks.`;

/** days: null is a free trial of unstated length, 0 is no free trial at all. */
export type Deal = { days: number | null; price: string | null };
type DealSource = Pick<LaunchKitInput, "offer" | "price" | "trialDays">;

/** The free trial the member's own offer mentions, if any. Only their words count: nothing is invented. */
export function trialInOffer(offer: string): Deal | null {
  if (!/\bfree[- ]trial\b|\bdays? free\b|\bfree for \d/i.test(offer)) return null;
  const days = offer.match(/(\d+)[\s-]*days?\b/i);
  const price = offer.match(/[$£€₹]\s?\d[\d,.]*/) ?? offer.match(/\d[\d,.]*(?:\s*(?:usd|gbp|eur|aud|cad|inr|dollars?|pounds?|euros?))?(?=\s*(?:\/|a\b|per\b)\s*mo)/i);
  return { days: days ? Number(days[1]) : null, price: price ? price[0].replace(/\s+/g, " ").replace(/[.,]$/, "") : null };
}

/** "$29" from whatever they typed in the price box: "29", "$29/month", "£19 a month". Empty when there's no amount. */
export function cleanPrice(raw: string): string {
  const amount = raw.match(/\d[\d,]*(?:\.\d{1,2})?/)?.[0] ?? "";
  if (!(Number(amount.replace(/,/g, "")) > 0)) return "";
  return `${raw.match(/[$£€₹]/)?.[0] ?? "$"}${amount}`;
}

/** The deal the member told us: their price and trial boxes, else whatever their offer line says. */
export function dealFor(input: DealSource): Deal | null {
  const price = cleanPrice(input.price ?? "");
  return price ? { days: input.trialDays ?? 0, price } : trialInOffer(input.offer);
}

/** Their deal as one line, the way they'd say it. Saved as their offer, so ads and replies use the same words. */
export function offerLine(deal: Deal): string {
  const price = deal.price ? `${deal.price} a month` : "A paid Skool group";
  return deal.days === 0 ? price : `${price} with a ${deal.days ? `${deal.days}-day ` : ""}free trial`;
}

/** Where someone cancels. Kept general on purpose: Skool moves its menus, and this sits on live pages. */
export const HOW_TO_CANCEL = "To cancel, open your settings on Skool.";

/** The deal in plain words, for the thank-you page. `how` adds where to cancel. */
export function trialTerms(t: Deal, opts: { how?: boolean } = {}): string {
  const price = t.price ? `${t.price} a month` : "the monthly price on the group's page";
  const deal =
    t.days === 0
      ? `${t.price ? price : "The monthly price is on the group's page"}, from the day you join. There is no free trial.`
      : `${t.days ? `${t.days} ${t.days === 1 ? "day" : "days"} free` : "A free trial"}, then ${price}. Cancel before it bills and you pay nothing.`;
  return opts.how ? `${deal} ${HOW_TO_CANCEL}` : deal;
}

/** Which parts of the deal a piece of page text states. */
export function termsCheck(text: string, deal: Deal): { price: boolean; trial: boolean; cancel: boolean; how: boolean } {
  return {
    price: !deal.price || text.includes(deal.price),
    // "7 days" or "7-day", so the 7 in "$27" doesn't count.
    trial: !deal.days || new RegExp(`\\b${deal.days}[\\s-]*days?\\b`, "i").test(text),
    cancel: /cancel/i.test(text),
    how: /cancel/i.test(text) && /settings/i.test(text),
  };
}

export function buildPrompt(input: LaunchKitInput) {
  const deal = dealFor(input);
  const boxes = Boolean(cleanPrice(input.price ?? ""));
  return `Write the launch kit for this community.

Community name: ${input.businessName}
Owner: ${input.ownerName}
Niche: ${input.niche}
Who it serves: ${input.audience}
Main outcome members want: ${input.outcome}
${input.leadMagnetIdea ? `Free checklist name: use "${input.leadMagnetIdea}" as leadMagnetName, word for word` : "Free checklist: (pick the best quick-win checklist for this niche and give it a short name)"}
Offer inside the Skool group: ${input.offer || (deal ? offerLine(deal) : "(a paid Skool membership, no details given)")}
Mention a free trial, a price or cancelling only if the offer line above states it. Never invent one, on any page or in any email.${
    deal && deal.days !== 0
      ? `
The offer has a free trial, so thankYouBody must state the deal in plain words, right above the button: ${trialTerms(deal, { how: boxes })} Keep all of that (how long it's free, the price a month after, and that they can cancel before it bills${boxes ? ", and where they cancel" : ""}), in your own warm words. thankYouButton invites them to start the trial.`
      : deal
        ? `
There is no free trial, so thankYouBody must state the price in plain words, right above the button: ${trialTerms(deal, { how: true })} Keep the price and where they cancel, in your own warm words. Never mention a free trial.`
        : ""
  }
Tone: ${input.tone}

Counts: exactly 3 bullets, 3 benefits, 3 steps, 4 FAQ items, 3 emails (day 0, day 1, day 3), 3 ads (the 3-Pack: angle pain, dream and lesson, in that order) and 10 hooks.
The lead magnet content must be the full, usable checklist itself (300 to 600 words), not a description of it.`;
}

/**
 * The AI should already have said it. If the deal didn't make it onto the page, it goes on anyway.
 * A member who filled in the price and trial boxes also gets where to cancel.
 */
export function withTrialTerms(kit: LaunchKit, from: string | DealSource): LaunchKit {
  const boxes = typeof from !== "string" && Boolean(cleanPrice(from.price ?? ""));
  const deal = typeof from === "string" ? trialInOffer(from) : dealFor(from);
  if (!deal) return kit;
  const body = kit.thankYouBody.trim();
  const said = termsCheck(body, deal);
  const dealSaid = said.price && said.trial && (deal.days === 0 || said.cancel);
  if (dealSaid && (!boxes || said.how)) return kit;
  return { ...kit, thankYouBody: `${body} ${dealSaid ? HOW_TO_CANCEL : trialTerms(deal, { how: boxes })}`.trim() };
}

/** The checklist's name as the pages use it: "Get the free 7-Day Dad Reset", never "Get the free The 7-Day...". */
export function checklistName(raw: string): string {
  return raw.trim().replace(/^the\s+/i, "");
}

function take<T>(arr: T[], n: number, filler: (i: number) => T): T[] {
  const out = arr.slice(0, n);
  while (out.length < n) out.push(filler(out.length));
  return out;
}

export function normalizeKit(kit: LaunchKit): LaunchKit {
  return {
    ...kit,
    bullets: take(kit.bullets, 3, () => "Simple steps you can start today"),
    benefits: take(kit.benefits, 3, () => ({ title: "A clear plan", body: "Know what to do each day." })),
    steps: take(kit.steps, 3, (i) => ({ title: `Step ${i + 1}`, body: "Follow the plan." })),
    faq: kit.faq.slice(0, 6),
    emails: take(kit.emails, 3, (i) => ({ subject: DEFAULT_SEQUENCE.steps[i].subject, body: DEFAULT_SEQUENCE.steps[i].body })),
    ads: kit.ads.slice(0, 4),
    hooks: kit.hooks.slice(0, 15),
  };
}

// Deterministic copy used when no AI key is configured (local dev, demos, tests).
export function fallbackKit(input: LaunchKitInput): LaunchKit {
  const first = input.ownerName.split(" ")[0];
  const lm = checklistName(input.leadMagnetIdea) || `7-Day ${titleCase(input.niche)} Quick-Start Checklist`;
  const deal = dealFor(input);
  const trial = deal && deal.days !== 0 ? deal : null;
  // Only the price and trial boxes add where to cancel; a typed offer line keeps to the member's own words.
  const how = Boolean(cleanPrice(input.price ?? ""));
  return {
    leadMagnetName: lm,
    leadMagnetType: "checklist",
    leadMagnetContent: `**${lm}**

This checklist gives you one small action a day for 7 days. Each action takes about 10 minutes.

- Day 1: Write down your main goal: ${input.outcome}.
- Day 2: Pick one habit that moves you toward it. Do it today.
- Day 3: Remove one thing that slows you down.
- Day 4: Do your habit again. Track it on paper.
- Day 5: Tell one friend your goal. Ask them to check on you.
- Day 6: Review your week. Keep what works.
- Day 7: Plan next week. Join a group that keeps you going.

Want help with every step? Join ${input.businessName}. We do this together.`,
    eyebrow: `Free for ${input.audience}`,
    headline: `${capitalize(input.outcome)}. Start today.`,
    subheadline: `Get the free ${lm}. It shows ${input.audience} the first steps that work.`,
    bullets: ["One small action a day", "Takes 10 minutes", "Free to download"],
    ctaText: "Send me the checklist",
    formTitle: "Where should I send it?",
    benefitsTitle: "What you get",
    benefits: [
      { title: "A clear plan", body: "Know exactly what to do each day." },
      { title: "Quick wins", body: "See progress in your first week." },
      { title: "Real support", body: `Get help from ${first} and the group.` },
    ],
    steps: [
      { title: "Enter your email", body: "The checklist lands in your inbox." },
      { title: "Do day 1", body: "It takes about 10 minutes." },
      { title: "Join the group", body: `Get the full system inside ${input.businessName}.` },
    ],
    aboutTitle: `Hi, I'm ${first}`,
    aboutBody: `I help ${input.audience} with ${input.niche}. I built ${input.businessName} so you get a clear plan and people who keep you on track.`,
    faq: [
      { q: "Is it really free?", a: "Yes. The checklist is free." },
      { q: "How long does it take?", a: "About 10 minutes a day." },
      { q: "What is the group?", a: `${input.businessName} is my Skool community. Members get the full plan and live help.` },
      { q: "Can I start today?", a: "Yes. Enter your email and start with day 1." },
    ],
    thankYouHeadline: "It's in your inbox 📬",
    thankYouBody: trial
      ? `Want help putting it to work? Come and join ${input.businessName}. ${trialTerms(trial, { how })}`
      : `Want the full system? Join ${input.businessName} and get live help every week.${deal && how ? ` ${trialTerms(deal, { how })}` : ""}`,
    thankYouButton: trial ? "Start my free trial" : "Join the group",
    emails: [
      {
        subject: `Here's your ${lm} 📥`,
        body: `Hey {{first_name}},\n\nHere it is: [${lm}]({{lead_magnet_url}})\n\nDo day 1 today. It takes 10 minutes.\n\nTomorrow I'll send you the mistake that keeps most people stuck.\n\n${first}`,
      },
      {
        subject: "The #1 mistake I see",
        body: `Hey {{first_name}},\n\nMost people try to change everything at once. They stop by day 3.\n\nPick one small action. Do it every day this week.\n\nWant help? Join us inside ${input.businessName}: {{skool_url}}\n\n${first}`,
      },
      {
        subject: "Still thinking about it?",
        body: `Hey {{first_name}},\n\nInside ${input.businessName} you get the full plan, live calls and a group that keeps you going.\n\nCome and have a look: {{skool_url}}\n\nNot for you? No hard feelings.\n\n${first}`,
      },
    ],
    ads: [
      {
        angle: "pain",
        hook: `Still stuck on ${input.niche}?`,
        turn: `It's rarely effort. It's doing ten things at once. ${input.businessName} gives you one small step a day.`,
        door: "Tap Learn more to look inside the community.",
        headline: `${capitalize(input.outcome)}, one step a day`,
        description: "See what's inside",
      },
      {
        angle: "dream",
        hook: `Picture this: ${input.outcome}.`,
        turn: `The people who get there aren't more talented. They follow a plan, with people who check in on them.`,
        door: `That's ${input.businessName}. Tap Learn more to see the plan.`,
        headline: `Join ${input.businessName}`,
        description: "A plan and a group",
      },
      {
        angle: "lesson",
        hook: `One thing that helps with ${input.niche} today:`,
        turn: `Pick one small action and do it at the same time every day. Tiny beats perfect.`,
        door: `That's lesson 1 of ${input.businessName}. The rest is inside. Tap Learn more.`,
        headline: "Free lesson inside",
        description: "Lesson 1 of the plan",
      },
    ],
    hooks: [
      `If you want ${input.outcome}, watch this.`,
      `3 mistakes that keep people stuck with ${input.niche}.`,
      "Do this before you start tomorrow.",
      `The 10-minute plan for ${input.outcome}.`,
      "Save this if you want a simple start.",
      `Most people get ${input.niche} wrong. Here's the fix.`,
      "This one change made the biggest difference.",
      "Here's my exact daily routine.",
      'Comment "PLAN" and I\'ll send you my checklist.',
      "Read this before you quit.",
    ],
    skoolAboutPage: `🚀 ${input.businessName}\n\n${capitalize(input.outcome)} with a simple plan and real support.\n\n💎 WHAT YOU GET:\n🔹 Step-by-step plan\n🔹 Weekly live calls with ${first}\n🔹 A group that keeps you on track\n\n${input.offer || "Tap Join and come say hi."}`,
    adPlan: {
      dailyBudgetUsd: 15,
      audience: "People in your country, 18 and over, broad with no interests. Your pictures do the targeting.",
      campaigns: [
        { name: "Website · Leads", objective: "Leads to your website, using your Meta Pixel and the Lead event", budgetUsd: 10, why: "Collects emails with your free checklist and teaches Meta who your real buyers are." },
        { name: "Skool link · Traffic", objective: "Traffic to your Skool link, optimised for landing page views", budgetUsd: 5, why: "Starts on Day 2 in its own campaign. Feeds Skool's 100-visitor bar for Level 2." },
      ],
      firstWeek: [
        "Day 1: Add your free Gemini key, build this kit, publish your website, open your Skool group, connect your Meta Pixel, then launch 5 statics to your website at $10 a day.",
        "Day 2: Launch 5 more statics to your Skool link at $5 a day, in their own campaign.",
        "Day 3: Hands off the ads. Walk through your own website and sign-up, the way a stranger would.",
        "Day 4: Pin a welcome post, make your first Unlock and add your first lesson.",
        "Day 5: Text five people who already know you, by hand.",
        "Day 6: Read your first numbers in Ad review.",
        "Day 7: Save your check-in on Growth ladder and decide, in private, whether to stay.",
      ],
    },
  };
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const titleCase = (s: string) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));

export function funnelPagesFromKit(kit: LaunchKit, input: Pick<LaunchKitInput, "businessName">) {
  const optin: PageContent = {
    sections: [
      {
        id: newSectionId(),
        type: "hero",
        eyebrow: kit.eyebrow,
        headline: kit.headline,
        subheadline: kit.subheadline,
        bullets: kit.bullets,
        ctaText: kit.ctaText,
        formTitle: kit.formTitle,
        showForm: true,
        imageUrl: "",
      },
      { id: newSectionId(), type: "benefits", title: kit.benefitsTitle, items: kit.benefits },
      { id: newSectionId(), type: "steps", title: "How it works", items: kit.steps },
      { id: newSectionId(), type: "text", title: kit.aboutTitle, body: kit.aboutBody },
      { id: newSectionId(), type: "faq", title: "Questions", items: kit.faq },
      {
        id: newSectionId(),
        type: "form",
        title: `Get the free ${kit.leadMagnetName}`,
        body: "Enter your best email. It lands in your inbox in a minute.",
        buttonText: kit.ctaText,
        collectPhone: false,
      },
    ],
  };
  const thankyou: PageContent = {
    sections: [
      {
        id: newSectionId(),
        type: "cta",
        headline: kit.thankYouHeadline,
        body: kit.thankYouBody,
        buttonText: kit.thankYouButton,
        buttonUrl: "{{skool_url}}",
      },
      {
        id: newSectionId(),
        type: "text",
        title: "Start here",
        body: `Open your free ${kit.leadMagnetName} now: [Get it here]({{lead_magnet_url}})\n\nThen join ${input.businessName} for the full plan.`,
      },
    ],
  };
  const guide: PageContent = {
    sections: [{ id: newSectionId(), type: "text", title: kit.leadMagnetName, body: kit.leadMagnetContent }],
  };
  return { optin, thankyou, guide };
}

export type LaunchKitResult =
  | { ok: true; generationId: string; siteId: string; usedAi: boolean; /** An earlier kit's website was rewritten, not a second one made. */ replaced: boolean; warning?: string }
  | { ok: false; error: string; /** no_runs: the free AI runs are used up. ai_failed: the AI call broke, and nothing was built. */ code?: "no_runs" | "ai_failed" };

/** What the member reads when their free AI runs are gone. The page shows the "add your free key" card beside it. */
export const KIT_OUT_OF_RUNS = "You've used your free AI runs for this month. Add a free Gemini key in Your AI, then press Build my launch kit again.";

// The ad plan is never shown anywhere, so the AI isn't asked to write it: that keeps the reply
// inside the smaller limit a free key allows. The kit still carries the rule-based plan.
const aiKitSchema = launchKitSchema.omit({ adPlan: true });

type KitPage = { slug: string; title: string; kind: PageKind; content: PageContent };

/** The website an earlier launch kit built, if it's still there. Building again rewrites it. */
export async function kitSite(workspaceId: string): Promise<Site | null> {
  const db = await getDb();
  const kits = await db
    .select({ input: aiGenerations.input })
    .from(aiGenerations)
    .where(and(eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, "launch_kit")))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(5);
  for (const k of kits) {
    const site = typeof k.input.siteId === "string" ? await getSite(workspaceId, k.input.siteId) : null;
    if (site) return site;
  }
  if (!kits.length) return null;
  // Kits from before the website was recorded on them: only a kit's website keeps its checklist at /guide.
  const [old] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.workspaceId, workspaceId), eq(sites.leadMagnetUrl, "/guide")))
    .orderBy(desc(sites.createdAt))
    .limit(1);
  return old ?? null;
}

/**
 * Put a new kit into the website the last one built: same address, same name. Only the draft
 * changes, so a live website shows the old pages until the member presses Publish again.
 */
async function rewriteSite(site: Site, next: { theme: Partial<SiteTheme>; skoolUrl: string; leadMagnetName: string; pages: KitPage[] }) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(sites)
      .set({
        theme: siteThemeSchema.parse({ ...site.theme, ...next.theme }),
        skoolUrl: next.skoolUrl || site.skoolUrl,
        leadMagnetName: next.leadMagnetName,
        leadMagnetUrl: "/guide",
        updatedAt: new Date(),
      })
      .where(eq(sites.id, site.id));
    const existing = await tx.select({ id: pages.id, slug: pages.slug }).from(pages).where(eq(pages.siteId, site.id));
    for (const p of next.pages) {
      const content = pageContentSchema.parse(p.content);
      const hit = existing.find((e) => e.slug === p.slug);
      if (hit) await tx.update(pages).set({ content, title: p.title, kind: p.kind, updatedAt: new Date() }).where(eq(pages.id, hit.id));
      else await tx.insert(pages).values({ siteId: site.id, workspaceId: site.workspaceId, slug: p.slug, title: p.title, kind: p.kind, content });
    }
  });
  return site;
}

/**
 * Generate the kit (AI or template), build the website and wire up the emails.
 * Building again rewrites the website the last kit made. If the AI call fails, nothing is
 * built or changed; `useAi: false` asks for the starter template on purpose.
 */
export async function runLaunchKit(workspaceId: string, rawInput: unknown, opts: { useAi?: boolean } = {}): Promise<LaunchKitResult> {
  const parsedInput = launchKitInputSchema.safeParse(rawInput);
  if (!parsedInput.success) return { ok: false, error: "Please fill in every required field." };
  // The price and trial boxes become the offer line, so Ad studio, ad research and reply drafts read the same deal.
  const price = cleanPrice(parsedInput.data.price ?? "");
  const input: LaunchKitInput = price
    ? { ...parsedInput.data, price, trialDays: parsedInput.data.trialDays ?? 0, offer: offerLine({ price, days: parsedInput.data.trialDays ?? 0 }) }
    : parsedInput.data;

  let kit: LaunchKit;
  let usedAi = false;
  let warning: string | undefined;
  let usage = { inputTokens: 0, outputTokens: 0, model: "template" };

  const charge = opts.useAi === false ? null : await chargeAi(workspaceId, "ai_generation", "AI launch kit");
  if (charge) {
    try {
      const res = await generateStructured({ workspaceId, creds: charge.creds, system: SYSTEM, prompt: buildPrompt(input), schema: aiKitSchema, effort: "medium" });
      const written = normalizeKit({ ...res.data, adPlan: fallbackKit(input).adPlan });
      const named = checklistName(input.leadMagnetIdea) || checklistName(written.leadMagnetName) || written.leadMagnetName;
      kit = withTrialTerms({ ...written, leadMagnetName: named }, input);
      usage = res.usage;
      usedAi = true;
    } catch (err) {
      await refundAi(workspaceId, "ai_generation", charge, "Refund: AI launch kit failed");
      return { ok: false, code: "ai_failed", error: `${describeAiError(err)} Nothing was built or changed. Press Build my launch kit to try again, or use the starter template for now.` };
    }
  } else if (opts.useAi !== false && env.aiEnabled) {
    return { ok: false, code: "no_runs", error: KIT_OUT_OF_RUNS };
  } else {
    kit = fallbackKit(input);
    warning =
      opts.useAi === false
        ? "This kit is the starter template, not written by AI. You can edit every word, or build again once your AI is working."
        : "No AI is connected yet, so this kit is a starter template. Add a free Gemini key in Your AI, then build again for a kit written around you.";
  }

  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  // A blank link box never wipes a link saved earlier.
  const skoolUrl = input.skoolUrl || ws?.settings.skoolUrl || "";
  const pagesContent = funnelPagesFromKit(kit, input);
  const theme: Partial<SiteTheme> = { brandColor: input.brandColor, style: input.tone === "calm" ? "clean" : "bold" };
  const kitPages: KitPage[] = [
    { slug: "", title: "Opt-in page", kind: "optin", content: pagesContent.optin },
    { slug: "thank-you", title: "Thank-you page", kind: "thankyou", content: pagesContent.thankyou },
    { slug: "guide", title: kit.leadMagnetName, kind: "custom", content: pagesContent.guide },
  ];
  const earlier = await kitSite(workspaceId);
  const site = earlier
    ? await rewriteSite(earlier, { theme, skoolUrl, leadMagnetName: kit.leadMagnetName, pages: kitPages })
    : await createSite({ workspaceId, name: `${input.businessName} funnel`, theme: { ...theme, font: "sans" }, skoolUrl, leadMagnetName: kit.leadMagnetName, leadMagnetUrl: "/guide", pages: kitPages });

  const [generation] = await db
    .insert(aiGenerations)
    .values({
      workspaceId,
      kind: "launch_kit",
      input: { ...input, siteId: site.id },
      output: kit as unknown as Record<string, unknown>,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    })
    .returning({ id: aiGenerations.id });
  await replaceDefaultEmails(workspaceId, kit, input.ownerName);

  await db
    .update(workspaces)
    .set({
      settings: {
        ...(ws?.settings ?? {}),
        businessName: input.businessName,
        niche: input.niche,
        audience: input.audience,
        offer: input.offer || ws?.settings.offer || "",
        skoolUrl,
        launchKitId: generation.id,
      },
    })
    .where(eq(workspaces.id, workspaceId));

  return { ok: true, generationId: generation.id, siteId: site.id, usedAi, replaced: Boolean(earlier), warning };
}

const NOT_WORDS = new Set(["id", "type", "buttonUrl", "imageUrl", "url"]);
const words = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(words) : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => (NOT_WORDS.has(k) ? [] : words(x))) : [];

/** Every word a visitor reads on a page, for checking what it states. */
export function pageText(content: PageContent | null | undefined): string {
  return words(content?.sections ?? []).join(" ");
}

/** The kit's website and what its thank-you page says right now (the draft, edits included). */
export async function kitWebsite(workspaceId: string): Promise<{ site: Site; thankYou: { id: string; text: string } | null } | null> {
  const site = await kitSite(workspaceId);
  if (!site) return null;
  const db = await getDb();
  const [page] = await db
    .select({ id: pages.id, content: pages.content })
    .from(pages)
    .where(and(eq(pages.siteId, site.id), eq(pages.kind, "thankyou")))
    .orderBy(asc(pages.createdAt))
    .limit(1);
  return { site, thankYou: page ? { id: page.id, text: pageText(page.content) } : null };
}

async function replaceDefaultEmails(workspaceId: string, kit: LaunchKit, ownerName: string) {
  const db = await getDb();
  const [seq] = await db
    .select()
    .from(emailSequences)
    .where(and(eq(emailSequences.workspaceId, workspaceId), eq(emailSequences.trigger, "lead_created")))
    .orderBy(asc(emailSequences.createdAt))
    .limit(1);
  const delays = [0, 60 * 24, 60 * 24 * 3];
  const steps = kit.emails.slice(0, 3).map((e, i) => ({
    position: i,
    delayMinutes: delays[i],
    subject: e.subject,
    body: e.body.replace(/\{\{owner_name\}\}/g, ownerName.split(" ")[0]),
  }));
  if (!seq) {
    const [created] = await db
      .insert(emailSequences)
      .values({ workspaceId, name: "Lead magnet follow-up", trigger: "lead_created", active: true })
      .returning();
    await db.insert(emailSequenceSteps).values(steps.map((s) => ({ ...s, sequenceId: created.id })));
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(emailSequenceSteps).where(eq(emailSequenceSteps.sequenceId, seq.id));
    await tx.insert(emailSequenceSteps).values(steps.map((s) => ({ ...s, sequenceId: seq.id })));
  });
}

export async function getLaunchKit(workspaceId: string, generationId: string) {
  if (!isUuid(generationId)) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(aiGenerations)
    .where(and(eq(aiGenerations.id, generationId), eq(aiGenerations.workspaceId, workspaceId)))
    .limit(1);
  return row ? { ...row, kit: row.output as unknown as LaunchKit, input: row.input as unknown as LaunchKitInput } : null;
}
