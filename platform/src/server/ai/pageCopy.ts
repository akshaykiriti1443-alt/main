import * as z from "zod/v4";
import { env } from "@/lib/env";
import { midSentence, personFirstName } from "@/lib/util";
import { getPage, getSite } from "../sites";
import { takeRateLimit } from "../rateLimit";
import { businessContext, contextLines, type BusinessContext } from "./businessContext";
import { VOICE_RULES, chargeAi, describeAiError, generateText, refundAi } from "./client";

// "Write it for me" / "Rewrite in my voice" beside each text box in the page editor.
// The answer only fills the box: nothing is saved until the member presses Save.

export const COPY_FIELDS = ["eyebrow", "headline", "subheadline", "bullets", "button", "formTitle", "title", "body", "itemTitle", "itemBody", "question", "answer"] as const;
export type CopyField = (typeof COPY_FIELDS)[number];
const SECTIONS = ["hero", "benefits", "steps", "text", "faq", "cta", "form", "video"] as const;

export const pageCopyRequestSchema = z.object({
  field: z.enum(COPY_FIELDS),
  section: z.enum(SECTIONS).catch("text"),
  current: z.string().max(4000).catch(""),
  /** The section's headline or title, so a rewritten line still fits the rest of the section. */
  nearby: z.string().max(600).catch(""),
});
export type PageCopyRequest = z.input<typeof pageCopyRequestSchema>;

export type PageCopyResult = { ok: true; text: string; usedAi: boolean; note?: string } | { ok: false; error: string };

export const COPY_NO_AI = "No AI is connected yet, so this is a starter line. Add a free Gemini key in Your AI for lines written around you.";
export const COPY_NO_RUNS = "You've used your free AI runs for this month, so this is a starter line. Add a free Gemini key in Your AI, then press the button again.";
const KEEP_NO_AI = "No AI is connected yet, so your words stay as they are. Add a free Gemini key in Your AI, then press Rewrite in my voice again.";
const KEEP_NO_RUNS = "You've used your free AI runs for this month, so your words stay as they are. Add a free Gemini key in Your AI, then press Rewrite in my voice again.";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const tidy = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Each box's job, its length, and how the AI should shape it. */
const FIELD_GUIDE: Record<CopyField, { what: string; max: number }> = {
  eyebrow: { what: "a tiny label above the headline, 2 to 5 words, e.g. who it's for or that it's free", max: 60 },
  headline: { what: "the page headline: one clear promise in under 12 words", max: 140 },
  subheadline: { what: "one or two short sentences under the headline that say what they get and who it's for", max: 280 },
  bullets: { what: "exactly 3 short bullet points (under 8 words each), one per line, no dashes or numbers", max: 300 },
  button: { what: "the button text, 2 to 5 words, starting with a verb, written as the visitor (e.g. Send me the checklist)", max: 40 },
  formTitle: { what: "a short title above the email form, under 8 words", max: 80 },
  title: { what: "a short section title, under 7 words", max: 100 },
  body: { what: "the section's text: 2 to 4 short sentences in plain words", max: 900 },
  itemTitle: { what: "a short item title, 2 to 5 words", max: 80 },
  itemBody: { what: "one short sentence that explains the item", max: 240 },
  question: { what: "one question a visitor would ask, under 10 words, ending with a question mark", max: 140 },
  answer: { what: "a short, honest answer of 1 or 2 sentences", max: 400 },
};

/** A starter line built only from what the member told us. Used when no AI can run. */
export function starterCopy(field: CopyField, section: string, c: BusinessContext): string {
  const lm = c.leadMagnetName.replace(/^the\s+/i, "");
  // What they typed, ready to sit mid-sentence ("Free for busy dads", not "Free for Busy dads").
  const who = c.audience ? midSentence(c.audience) : "people like you";
  const first = personFirstName(c.ownerName);
  const name = c.businessName || "the group";
  switch (field) {
    case "eyebrow":
      return c.audience ? `Free for ${who}` : "Free checklist";
    case "headline":
      if (section === "cta") return `Ready to join ${name}?`;
      return c.outcome ? `${cap(c.outcome)}. Start today.` : c.niche ? `${cap(c.niche)}, made simple.` : "Your first step starts here.";
    case "subheadline":
      return lm ? `Get the free ${lm}. It shows ${who} the first steps that work.` : `A simple plan for ${who}. Start with one small step today.`;
    case "bullets":
      return "One small action a day\nTakes 10 minutes\nFree to download";
    case "button":
      if (section === "cta") return "Join the group";
      return lm ? "Send me the checklist" : "Send it to me";
    case "formTitle":
      return "Where should I send it?";
    case "title":
      if (section === "benefits") return "What you get";
      if (section === "steps") return "How it works";
      if (section === "faq") return "Questions";
      if (section === "form") return lm ? `Get the free ${lm}` : "Get it free";
      if (section === "video") return "Watch this first";
      return first ? `Hi, I'm ${first}` : `About ${name}`;
    case "body":
      if (section === "cta") return `Join ${name} for the full plan and people who keep you on track.`;
      if (section === "form") return "Enter your best email. It lands in your inbox in a minute.";
      return `I help ${who}${c.niche ? ` with ${midSentence(c.niche)}` : ""}. I built ${name} so you get a clear plan and people who keep you on track.`;
    case "itemTitle":
      return section === "steps" ? "Enter your email" : "A clear plan";
    case "itemBody":
      return section === "steps" ? "The checklist lands in your inbox." : "Know exactly what to do each day.";
    case "question":
      return "Is it really free?";
    case "answer":
      return lm ? `Yes. The ${lm} is free.` : "Yes. It's free.";
  }
}

/** Clean what the AI wrote so it drops straight into the box. */
export function cleanCopy(field: CopyField, raw: string): string {
  let text = tidy(raw.replace(/^```[a-z]*\n?|```$/gi, ""));
  if (field === "bullets") {
    return text
      .split("\n")
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 5)
      .join("\n")
      .slice(0, FIELD_GUIDE.bullets.max);
  }
  // One-line boxes: first line only, no wrapping quotes.
  if (field !== "body" && field !== "answer" && field !== "subheadline") text = text.split("\n")[0];
  text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  return text.slice(0, FIELD_GUIDE[field].max);
}

export async function writePageCopy(workspaceId: string, pageId: string, raw: PageCopyRequest): Promise<PageCopyResult> {
  const parsed = pageCopyRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That box can't be written for you." };
  const req = parsed.data;
  const page = await getPage(workspaceId, pageId);
  const site = page ? await getSite(workspaceId, page.siteId) : null;
  if (!page || !site) return { ok: false, error: "This page doesn't exist any more. Go back to your funnel and open it again." };
  if (!(await takeRateLimit(`page-copy:${workspaceId}`, [{ seconds: 60, max: 20 }, { seconds: 86_400, max: 300 }]))) {
    return { ok: false, error: "That's a lot of rewrites in a row. Wait a minute, then try again." };
  }

  const ctx = await businessContext(workspaceId);
  if (site.leadMagnetName) ctx.leadMagnetName = site.leadMagnetName;
  const current = tidy(req.current);

  const charge = await chargeAi(workspaceId, "ai_assist", "AI page copy");
  if (!charge) {
    if (current) return { ok: true, text: current, usedAi: false, note: env.aiEnabled ? KEEP_NO_RUNS : KEEP_NO_AI };
    return { ok: true, text: starterCopy(req.field, req.section, ctx), usedAi: false, note: env.aiEnabled ? COPY_NO_RUNS : COPY_NO_AI };
  }
  const guide = FIELD_GUIDE[req.field];
  try {
    const res = await generateText({
      workspaceId,
      creds: charge.creds,
      effort: "low",
      maxTokens: 800,
      system: `You write the words on a beginner coach's free-checklist website. The visitor is a stranger. The page invites them to get a free checklist and then join the owner's paid Skool group.
${VOICE_RULES}
Mention a free trial, a price or cancelling only if the offer below states it.
Return ONLY the words for the box. No quotes, no labels, no explanation.`,
      prompt: `About the business:
${contextLines(ctx)}

Page section: ${req.section}${req.nearby ? `\nThe section's headline or title: ${req.nearby}` : ""}
Box to fill: ${guide.what}. At most ${guide.max} characters.
${current ? `The owner's draft, to rewrite in their own voice (keep their meaning and any facts, make it clearer and warmer):\n${current}` : "The box is empty. Write it from scratch."}`,
    });
    const text = cleanCopy(req.field, res.text);
    if (!text) throw new Error("The AI returned an empty reply.");
    return { ok: true, text, usedAi: true };
  } catch (err) {
    await refundAi(workspaceId, "ai_assist", charge, "Refund: AI page copy failed");
    return { ok: false, error: `${describeAiError(err)} Your words are unchanged.` };
  }
}
