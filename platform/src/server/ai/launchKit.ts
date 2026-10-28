import * as z from "zod/v4";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, emailSequences, emailSequenceSteps, workspaces } from "@/lib/db/schema";
import type { PageContent } from "@/lib/db/types";
import { env } from "@/lib/env";
import { aiCostMicros } from "../pricing";
import { DEFAULT_SEQUENCE } from "../defaults";
import { createSite, newSectionId } from "../sites";
import { canAfford, chargeUsage } from "../wallet";
import { describeAiError, generateStructured, VOICE_RULES } from "./client";

export const launchKitInputSchema = z.object({
  businessName: z.string().min(2).max(80),
  ownerName: z.string().min(1).max(60),
  niche: z.string().min(3).max(160),
  audience: z.string().min(3).max(200),
  outcome: z.string().min(3).max(200),
  leadMagnetIdea: z.string().max(200).default(""),
  offer: z.string().max(200).default(""),
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
  ads: z.array(z.object({ primaryText: z.string(), headline: z.string(), description: z.string() })),
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
You write a complete "launch kit" for one community: a free lead magnet, a landing page, a thank-you page that sends people to the Skool group, three follow-up emails, Meta ad copy, hooks, a Skool About page and a first-week ad plan.

${VOICE_RULES}

Formatting rules:
- Email bodies and the lead magnet use plain text with blank lines between paragraphs. Use "- " for list items and **bold** for emphasis. No HTML.
- In emails, use {{first_name}} for the reader's name, {{lead_magnet_url}} for the lead magnet link and {{skool_url}} for the group link. Sign emails with the owner's first name.
- The Skool About page uses plain text with emojis as bullets. Skool has no bold, so keep structure with line breaks.
- Ad plan budgets are realistic for a beginner: $5 to $20 a day in total.`;

function buildPrompt(input: LaunchKitInput) {
  return `Write the launch kit for this community.

Community name: ${input.businessName}
Owner: ${input.ownerName}
Niche: ${input.niche}
Who it serves: ${input.audience}
Main outcome members want: ${input.outcome}
Lead magnet idea: ${input.leadMagnetIdea || "(pick the best quick-win lead magnet for this niche)"}
Offer inside the Skool group: ${input.offer || "(a paid Skool membership with a 7-day free trial)"}
Tone: ${input.tone}

Counts: exactly 3 bullets, 3 benefits, 3 steps, 4 FAQ items, 3 emails (day 0, day 1, day 3), 3 ads, 10 hooks, 3 campaigns in the ad plan and 7 first-week actions (one per day).
The lead magnet content must be the full, usable lead magnet itself (300 to 600 words), not a description of it.`;
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
    ads: kit.ads.slice(0, 5),
    hooks: kit.hooks.slice(0, 15),
  };
}

// Deterministic copy used when no AI key is configured (local dev, demos, tests).
export function fallbackKit(input: LaunchKitInput): LaunchKit {
  const first = input.ownerName.split(" ")[0];
  const lm = input.leadMagnetIdea || `The 7-Day ${titleCase(input.niche)} Quick-Start Checklist`;
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
    subheadline: `Grab the free ${lm}. It shows ${input.audience} the first steps that work.`,
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
    thankYouBody: `Want the full system? Join ${input.businessName} and get live help every week.`,
    thankYouButton: "Join the group",
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
        subject: "Your 7 free days are waiting",
        body: `Hey {{first_name}},\n\nInside ${input.businessName} you get the full plan, live calls and a group that keeps you going.\n\nStart your free trial here: {{skool_url}}\n\n${first}`,
      },
    ],
    ads: [
      {
        primaryText: `${capitalize(input.audience)}: here's a simple way to start. 👇\n\nGrab the free ${lm}.\n✅ One action a day\n✅ 10 minutes\n✅ Free\n\nTap "Learn more" to get it.`,
        headline: `Free: ${lm}`,
        description: "Start today. It's free.",
      },
      {
        primaryText: `I wrote down the 7 steps I give every new member of ${input.businessName}.\n\nThey're all in one free checklist. Tap "Learn more" to grab it.`,
        headline: "The 7-day quick start",
        description: "Free checklist",
      },
      {
        primaryText: `Inside ${input.businessName} you get a clear plan, live help and a group that keeps you going.\n\nTry it free for 7 days.`,
        headline: `Join ${input.businessName}`,
        description: "7 days free",
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
    skoolAboutPage: `🚀 ${input.businessName}\n\n${capitalize(input.outcome)} with a simple plan and real support.\n\n💎 WHAT YOU GET:\n🔹 Step-by-step plan\n🔹 Weekly live calls with ${first}\n🔹 A group that keeps you on track\n\n${input.offer || "Start your 7-day free trial today."}`,
    adPlan: {
      dailyBudgetUsd: 15,
      audience: `People in your country, age 25 to 55, who are interested in ${input.niche}.`,
      campaigns: [
        { name: "Followers", objective: "Traffic to Instagram profile", budgetUsd: 5, why: "Builds a warm audience fast." },
        { name: "Leads", objective: "Leads to your landing page", budgetUsd: 8, why: "Collects emails with your free checklist." },
        { name: "Retargeting", objective: "Traffic to your Skool page", budgetUsd: 2, why: "Brings warm people back to join." },
      ],
      firstWeek: [
        "Day 1: Launch the follower campaign.",
        "Day 2: Add your Skool keywords and post a welcome thread.",
        "Day 3: Publish this landing page and test a lead.",
        "Day 4: Launch the lead campaign.",
        "Day 5: Launch retargeting to your Skool page.",
        "Day 6: Swap in 3 new hooks from this kit.",
        "Day 7: Raise the best ad set's budget by 20%.",
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
  | { ok: true; generationId: string; siteId: string; usedAi: boolean; warning?: string }
  | { ok: false; error: string };

/** Generate the kit (AI or template), build the funnel and wire up the emails. */
export async function runLaunchKit(workspaceId: string, rawInput: unknown): Promise<LaunchKitResult> {
  const parsedInput = launchKitInputSchema.safeParse(rawInput);
  if (!parsedInput.success) return { ok: false, error: "Please fill in every required field." };
  const input = parsedInput.data;

  let kit: LaunchKit;
  let usedAi = false;
  let warning: string | undefined;
  let usage = { inputTokens: 0, outputTokens: 0, model: "template" };

  if (env.aiEnabled) {
    const afford = await canAfford(workspaceId, "ai_generation", 1);
    if (!afford) return { ok: false, error: "You've used this month's AI generations. Add funds in Wallet & Billing to generate more." };
    try {
      const res = await generateStructured({ system: SYSTEM, prompt: buildPrompt(input), schema: launchKitSchema, effort: "medium" });
      kit = normalizeKit(res.data);
      usage = res.usage;
      usedAi = true;
      await chargeUsage(workspaceId, "ai_generation", 1, {
        description: "AI launch kit",
        costMicros: aiCostMicros(usage.inputTokens, usage.outputTokens),
      }).catch((err) => console.error("[ai] could not bill launch kit", err));
    } catch (err) {
      warning = `${describeAiError(err)} We used a template kit instead.`;
      kit = fallbackKit(input);
    }
  } else {
    kit = fallbackKit(input);
    warning = "AI is not configured on this server, so this kit uses a template. Add ANTHROPIC_API_KEY for AI-written copy.";
  }

  const db = await getDb();
  const [generation] = await db
    .insert(aiGenerations)
    .values({
      workspaceId,
      kind: "launch_kit",
      input,
      output: kit as unknown as Record<string, unknown>,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    })
    .returning({ id: aiGenerations.id });

  const pagesContent = funnelPagesFromKit(kit, input);
  const site = await createSite({
    workspaceId,
    name: `${input.businessName} funnel`,
    theme: { brandColor: input.brandColor, style: input.tone === "calm" ? "clean" : "bold", font: "sans" },
    skoolUrl: input.skoolUrl,
    leadMagnetName: kit.leadMagnetName,
    leadMagnetUrl: "/guide",
    pages: [
      { slug: "", title: "Opt-in page", kind: "optin", content: pagesContent.optin },
      { slug: "thank-you", title: "Thank-you page", kind: "thankyou", content: pagesContent.thankyou },
      { slug: "guide", title: kit.leadMagnetName, kind: "custom", content: pagesContent.guide },
    ],
  });
  await replaceDefaultEmails(workspaceId, kit, input.ownerName);

  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  await db
    .update(workspaces)
    .set({
      settings: {
        ...(ws?.settings ?? {}),
        businessName: input.businessName,
        niche: input.niche,
        audience: input.audience,
        offer: input.offer,
        skoolUrl: input.skoolUrl,
        launchKitId: generation.id,
      },
    })
    .where(eq(workspaces.id, workspaceId));

  return { ok: true, generationId: generation.id, siteId: site.id, usedAi, warning };
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
  const db = await getDb();
  const [row] = await db
    .select()
    .from(aiGenerations)
    .where(and(eq(aiGenerations.id, generationId), eq(aiGenerations.workspaceId, workspaceId)))
    .limit(1);
  return row ? { ...row, kit: row.output as unknown as LaunchKit, input: row.input as unknown as LaunchKitInput } : null;
}
