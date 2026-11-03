import * as z from "zod/v4";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, aiGenerations, contacts, workspaces } from "@/lib/db/schema";
import { automationActionSchema, type AutomationAction, type AutomationTrigger } from "@/lib/db/types";
import { isUuid } from "@/lib/util";
import { presetByKey } from "../automationPresets";
import { getAutomation, listAutomations } from "../automations";
import { listSequences } from "../email/sequences";
import { latestCheckins } from "../growth";
import { listSites } from "../sites";
import { skoolMemberCounts } from "../skool";
import { ENGAGED_TAG } from "../unlocks";
import { env } from "@/lib/env";
import { AI_PROVIDERS, chargeAi, describeAiError, generateStructured, isAiProvider, refundAi, VOICE_RULES } from "./client";

// "Tell your AI what to automate": the owner describes what they want in plain words (or picks a
// suggestion built from their own numbers), and their AI turns it into a real automation: one
// trigger and a list of steps the engine already runs. Nothing is saved here. The draft opens in the
// builder, and the owner reads it and presses Save, same as a recipe.

export const TRIGGER_TYPES = ["lead_created", "message_received", "tag_added", "temperature_changed", "stage_changed"] as const;
// No webhook: it needs a real Zapier/Make URL from the owner, so the AI says so in notes instead.
export const STEP_TYPES = ["add_tag", "remove_tag", "set_stage", "wait", "send_email", "enroll_sequence", "notify_owner", "ai_score", "ai_draft_reply", "send_message", "only_if_temperature", "ask_my_ai"] as const;
const STAGES = ["new", "engaged", "trial", "member", "lost"] as const;
const CHANNELS = ["facebook", "instagram", "whatsapp", "sms"] as const;
const TEMPERATURES = ["hot", "warm", "cold"] as const;
export const MAX_STEPS = 12;

/** What the engine can do, in words an AI (ours or the owner's connected one) can build from. */
export const AUTOMATION_GUIDE = `TRIGGERS (what starts it; value is an optional filter, "" means any):
- stage_changed: value trial | member | lost | engaged | new. The weekly Skool member sync sets trial (started a free trial), member (paying) and lost (churned, left).
- tag_added: value is the tag. The system adds "skool-cancelling" when a Skool member cancels but still has access, "skool-churned" when they leave, "${ENGAGED_TAG}" when a member posts or comments in Skool to claim an Unlock, "skool-member" for everyone from the Skool sync.
- lead_created: someone fills in a landing page form. value: a site id to limit it to one funnel, or "".
- message_received: a DM, WhatsApp or SMS arrives. value: facebook | instagram | whatsapp | sms, or "".
- temperature_changed: after AI scoring. value: hot | warm | cold, or "".

STEPS (run in order, per contact):
- send_email {subject, body}: emails the contact from the platform. Merge fields: {{first_name}}, {{business_name}}, {{owner_name}}, {{skool_url}}, {{lead_magnet_name}}, {{lead_magnet_url}}. Plain text, short, one question or one link.
- wait {minutes}: 1 hour = 60, 1 day = 1440, 3 days = 4320, 7 days = 10080. Max 60 days.
- ask_my_ai {instruction}: hands a job to the owner's own AI (their key or their connected Claude/ChatGPT), e.g. drafting a personal Skool DM. The draft is saved on the contact for the owner to send. Use this for anything that must go out in Skool.
- notify_owner {message}: emails the owner an alert. Say exactly what to do next.
- add_tag / remove_tag {tag}: lowercase-with-hyphens.
- set_stage {stage}: new | engaged | trial | member | lost. Careful: this fires stage_changed automations.
- only_if_temperature {temperature}: stop here unless the lead is hot | warm | cold. Put ai_score before it.
- ai_score: AI scores the lead hot/warm/cold from their messages and activity.
- ai_draft_reply: AI drafts a reply in the inbox conversation (message_received flows only).
- send_message {body}: replies in the contact's DM/WhatsApp/SMS conversation. Only works when they messaged first, so only after a message_received trigger.
- enroll_sequence {sequenceId}: starts one of the owner's existing email sequences (use only an id from the list given).

HARD RULES:
- Nothing can post, DM or act inside Skool, and nothing should pretend to. For Skool DMs or posts: ask_my_ai to draft it, then notify_owner to send it by hand. "AI writes, you send."
- No invented results, testimonials, income claims, fake deadlines or guilt.
- Never email the same person twice without a wait between.`;

const stepSchema = z.object({
  type: z.enum(STEP_TYPES),
  tag: z.string().describe("add_tag/remove_tag only, else empty"),
  stage: z.string().describe("set_stage only, else empty"),
  minutes: z.number().describe("wait only, else 0"),
  subject: z.string().describe("send_email only, else empty"),
  body: z.string().describe("send_email or send_message only, else empty"),
  message: z.string().describe("notify_owner only, else empty"),
  temperature: z.string().describe("only_if_temperature only, else empty"),
  instruction: z.string().describe("ask_my_ai only, else empty"),
  sequenceId: z.string().describe("enroll_sequence only, else empty"),
});

const draftSchema = z.object({
  name: z.string().describe("2-6 words, like 'Save a cancelling member'"),
  summary: z.string().describe("1-2 plain sentences for the owner: what happens, to whom, when"),
  why: z.string().describe("One sentence linking it to the owner's numbers (what is growing or leaking), or empty"),
  trigger: z.object({ type: z.enum(TRIGGER_TYPES), value: z.string() }),
  steps: z.array(stepSchema).describe(`1-${MAX_STEPS} steps`),
  notes: z.array(z.string()).describe("Short things the owner must check or fill in (a link to paste, a Zapier step to add). Empty if none."),
});

export type AutomationDraft = {
  name: string;
  summary: string;
  why: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  notes: string[];
};

export type DraftResult = { ok: true; draftId: string; draft: AutomationDraft; model: string; recipe?: string } | { ok: false; error: string };

const tagOf = (raw: string) =>
  raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

type StepIn = z.infer<typeof stepSchema>;

/** Turns the AI's flat step into a real, validated action, or null if it doesn't hold up. */
function toAction(s: StepIn, sequenceIds: Set<string>): AutomationAction | null {
  const candidate: Record<string, unknown> = { type: s.type };
  switch (s.type) {
    case "add_tag":
    case "remove_tag":
      candidate.tag = tagOf(s.tag);
      break;
    case "set_stage":
      candidate.stage = s.stage.toLowerCase().trim();
      break;
    case "wait":
      candidate.minutes = Math.round(s.minutes);
      break;
    case "send_email":
      Object.assign(candidate, { subject: s.subject.trim(), body: s.body.trim() });
      break;
    case "send_message":
      candidate.body = s.body.trim();
      break;
    case "notify_owner":
      candidate.message = s.message.trim();
      break;
    case "only_if_temperature":
      candidate.temperature = s.temperature.toLowerCase().trim();
      break;
    case "ask_my_ai":
      candidate.instruction = s.instruction.trim();
      break;
    case "enroll_sequence":
      if (!sequenceIds.has(s.sequenceId)) return null;
      candidate.sequenceId = s.sequenceId;
      break;
  }
  const r = automationActionSchema.safeParse(candidate);
  return r.success ? r.data : null;
}

function cleanTrigger(t: { type: AutomationTrigger["type"]; value: string }, siteIds: Set<string>): AutomationTrigger {
  const v = t.value.trim();
  const lower = v.toLowerCase();
  switch (t.type) {
    case "lead_created":
      return { type: t.type, value: siteIds.has(v) ? v : "" };
    case "message_received":
      return { type: t.type, value: (CHANNELS as readonly string[]).includes(lower) ? lower : "" };
    case "temperature_changed":
      return { type: t.type, value: (TEMPERATURES as readonly string[]).includes(lower) ? lower : "" };
    case "stage_changed":
      return { type: t.type, value: (STAGES as readonly string[]).includes(lower) ? lower : "" };
    case "tag_added":
      return { type: t.type, value: tagOf(v) };
  }
}

/** Makes a raw AI draft safe to show: valid trigger, valid steps only, sensible ordering. */
export type RawDraft = z.infer<typeof draftSchema>;

export function finishDraft(raw: RawDraft, ctx: { siteIds: Set<string>; sequenceIds: Set<string> }): AutomationDraft | { error: string } {
  const trigger = cleanTrigger(raw.trigger, ctx.siteIds);
  const notes = raw.notes.map((n) => n.trim()).filter(Boolean).slice(0, 6);
  const actions: AutomationAction[] = [];
  let dropped = 0;
  for (const s of raw.steps.slice(0, MAX_STEPS)) {
    const a = toAction(s, ctx.sequenceIds);
    if (!a) {
      dropped++;
      continue;
    }
    // send_message can only reply in an existing conversation.
    if (a.type === "send_message" && trigger.type !== "message_received") {
      dropped++;
      continue;
    }
    // Two emails back to back would land at the same moment: put a day between them.
    const prev = actions[actions.length - 1];
    if (a.type === "send_email" && actions.some((x) => x.type === "send_email") && prev?.type !== "wait") actions.push({ type: "wait", minutes: 1440 });
    actions.push(a);
  }
  if (trigger.type === "tag_added" && !trigger.value) return { error: "Your AI didn't say which tag starts it. Try naming it, like \"when a member gets the engaged tag\"." };
  if (actions.length === 0) return { error: "Your AI's draft had no steps that work here. Try saying what should happen, step by step." };
  if (dropped) notes.push(`${dropped} step${dropped === 1 ? "" : "s"} didn't fit what automations can do, so I left ${dropped === 1 ? "it" : "them"} out.`);
  return {
    name: raw.name.trim().slice(0, 120) || "AI automation",
    summary: raw.summary.trim().slice(0, 400),
    why: raw.why.trim().slice(0, 300),
    trigger,
    actions,
    notes,
  };
}

/** The owner's numbers, so the AI (and the suggestions) can see what's growing and what's leaking. */
export async function automationContext(workspaceId: string) {
  const db = await getDb();
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const n = sql<number>`count(*)::int`;
  const [[ws], piles, [leads], [clicks], [engaged], [hot], checkins, existing, sites, sequences] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
    skoolMemberCounts(workspaceId),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, workspaceId), eq(activities.type, "lead"), gte(activities.createdAt, since30))),
    db.select({ n }).from(activities).where(and(eq(activities.workspaceId, workspaceId), eq(activities.type, "skool_visit"), gte(activities.createdAt, since30))),
    db.select({ n }).from(contacts).where(and(eq(contacts.workspaceId, workspaceId), sql`${ENGAGED_TAG} = any(${contacts.tags})`)),
    db.select({ n }).from(contacts).where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.temperature, "hot"))),
    latestCheckins(workspaceId, 1),
    listAutomations(workspaceId),
    listSites(workspaceId),
    listSequences(workspaceId),
  ]);
  const s = ws?.settings ?? {};
  const last = checkins[0] ?? null;
  return {
    business: { name: s.businessName || ws?.name || "", niche: s.niche || "", offer: s.offer || "", audience: s.audience || "", skoolUrl: s.skoolUrl || "", memberPrice: s.skoolMemberPrice ?? null },
    numbers: {
      leadsLast30Days: leads?.n ?? 0,
      skoolLinkClicksLast30Days: clicks?.n ?? 0,
      hotLeads: hot?.n ?? 0,
      onTrial: piles.trials,
      paying: piles.members,
      cancelling: piles.cancelling,
      churned: piles.churned,
      engagedMembers: engaged?.n ?? 0,
      skoolLevel: last?.skoolLevel ?? null,
      aboutPageVisitors30d: last?.aboutVisitors ?? null,
    },
    existing: existing.map((a) => ({ id: a.id, name: a.name, on: a.active, trigger: a.trigger, steps: a.actions.map((x) => x.type), runs: a.runsCount })),
    sites: sites.map((x) => ({ id: x.id, name: x.name })),
    sequences: sequences.map((x) => ({ id: x.id, name: x.name })),
  };
}

export type AutomationContext = Awaited<ReturnType<typeof automationContext>>;

/** One-tap ideas built from the numbers: whatever is leaking most comes first. */
export function automationSuggestions(ctx: AutomationContext): { label: string; request: string }[] {
  const n = ctx.numbers;
  const has = (pred: (t: AutomationTrigger) => boolean) => ctx.existing.some((a) => a.on && pred(a.trigger));
  const out: { label: string; request: string; weight: number }[] = [];
  if (!has((t) => t.type === "tag_added" && t.value === "skool-cancelling"))
    out.push({
      weight: 10 + n.cancelling * 3,
      label: n.cancelling ? `${n.cancelling} cancelling: save them` : "Save people who cancel",
      request: "When a member cancels (they still have access for now), email them a short, kind note asking what would have made them stay, have my AI draft a personal Skool DM, and tell me to send it today.",
    });
  if (!has((t) => t.type === "stage_changed" && t.value === "trial"))
    out.push({
      weight: 8 + n.onTrial * 2,
      label: n.onTrial ? `${n.onTrial} on trial: help them convert` : "Turn trials into paying members",
      request: "When someone starts a free trial, email a warm hello that points them to the one lesson worth finishing first. On day 4, email to ask how it's going with one question. On day 6, have my AI draft a personal Skool DM and tell me to send it.",
    });
  if (!has((t) => t.type === "stage_changed" && t.value === "lost"))
    out.push({
      weight: 6 + n.churned,
      label: n.churned ? `${n.churned} churned: win some back` : "Win back people who left",
      request: "A week after a member leaves, email them to say the door's open, mention one new thing inside, no guilt trip. Tag them win-back and tell me so I can say hi in Skool.",
    });
  if (!has((t) => t.type === "lead_created"))
    out.push({
      weight: 5 + Math.max(0, n.leadsLast30Days - n.paying),
      label: n.leadsLast30Days ? `${n.leadsLast30Days} new leads: walk them to Skool` : "Walk new leads to your Skool",
      request: "When someone grabs my free guide, wait a day, then email them one useful tip from the guide and my Skool link with one question. Two days later, if they're still a lead, score them with AI and alert me if they're hot.",
    });
  if (!has((t) => t.type === "tag_added" && t.value === ENGAGED_TAG))
    out.push({
      weight: 4 + n.engagedMembers,
      label: n.engagedMembers ? `${n.engagedMembers} engaged: thank them` : "Thank members who post",
      request: `When a member gets the ${ENGAGED_TAG} tag (they posted or commented to claim an Unlock), email a short thank-you and have my AI draft a shout-out I can post in Skool.`,
    });
  if (!has((t) => t.type === "message_received"))
    out.push({
      weight: 3 + n.hotLeads,
      label: "Catch hot DMs",
      request: "When a new DM comes in, score it with AI. If they're hot, tag them hot-lead, draft a reply and email me straight away.",
    });
  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map(({ label, request }) => ({ label, request }));
}

/** One line under the box: whose AI does the building, and what it costs. */
export function whoBuilds(ws: { plan: string; settings: { aiKeyEnc?: string; aiProvider?: string } }): string {
  const p = ws.settings.aiProvider;
  if (ws.settings.aiKeyEnc && isAiProvider(p)) return `Built by your ${AI_PROVIDERS[p].label}${AI_PROVIDERS[p].free ? " (free tier)" : ""}. Costs you nothing here.`;
  if (env.aiEnabled) return ws.plan === "owner" ? "Built with the platform AI. Unlimited on your plan." : "Uses 1 AI generation from your plan. Connect your own AI in Your AI and it's free.";
  return "No AI connected yet, so you'll get the closest recipe. Connect yours in Your AI (Gemini is free) for custom builds.";
}

/** No AI anywhere: pick the closest recipe so the owner still gets a working start. */
export function recipeFor(request: string): string | null {
  const r = request.toLowerCase();
  if (/cancel|quit|leaving|about to leave|save/.test(r)) return "skool-save";
  if (/churn|win.?back|came back|left|gone|lost/.test(r)) return "skool-winback";
  if (/trial|convert|upgrade/.test(r)) return "skool-convert";
  if (/welcome|new member|onboard|joins?\b|paying/.test(r)) return "skool-welcome";
  if (/\bhot\b|\bdm\b|message|inbox|instagram|whatsapp/.test(r)) return "hot";
  if (/lead|opt.?in|guide|nurture|sign.?up/.test(r)) return "nurture";
  return null;
}

/**
 * Builds (or changes, when automationId is set) an automation from a plain-words request.
 * The draft is stored, not saved as an automation: the builder opens it for the owner to review.
 */
export async function draftAutomation(workspaceId: string, input: { request: string; automationId?: string | null }): Promise<DraftResult> {
  const request = input.request.trim().slice(0, 1500);
  if (request.length < 8) return { ok: false, error: "Tell your AI a bit more: what should happen, to whom, and when?" };
  const current = input.automationId && isUuid(input.automationId) ? await getAutomation(workspaceId, input.automationId) : null;
  if (input.automationId && !current) return { ok: false, error: "That automation is gone." };
  const ctx = await automationContext(workspaceId);
  const siteIds = new Set(ctx.sites.map((x) => x.id));
  const sequenceIds = new Set(ctx.sequences.map((x) => x.id));
  const db = await getDb();
  const store = async (draft: AutomationDraft, model: string, usage = { inputTokens: 0, outputTokens: 0 }) => {
    const [row] = await db
      .insert(aiGenerations)
      .values({ workspaceId, kind: "automation_draft", input: { request, automationId: current?.id ?? null }, output: draft as unknown as Record<string, unknown>, model, ...usage })
      .returning({ id: aiGenerations.id });
    return row.id;
  };

  const charge = await chargeAi(workspaceId, "ai_generation", current ? "AI: change an automation" : "AI: build an automation");
  if (!charge) {
    const key = current ? null : recipeFor(request);
    const preset = presetByKey(key ?? undefined);
    if (!preset) {
      return {
        ok: false,
        error: "Building a custom automation needs an AI. Connect yours in Your AI (Gemini's free tier works), or start from a recipe below.",
      };
    }
    const draft: AutomationDraft = {
      ...preset.def,
      summary: preset.body,
      why: "",
      notes: ["No AI is connected, so this is the closest ready-made recipe. Connect your AI in Your AI and it will build exactly what you asked for."],
    };
    return { ok: true, draftId: await store(draft, "recipe"), draft, model: "recipe", recipe: preset.key };
  }

  try {
    const res = await generateStructured({
      workspaceId,
      creds: charge.creds,
      effort: "medium",
      maxTokens: 8000,
      schema: draftSchema,
      system: `You build automations for a Skool community owner's CRM. The owner tells you what they want in plain words; you turn it into one trigger and an ordered list of steps that this system can actually run. Use only what's listed below.
${AUTOMATION_GUIDE}

How to build well:
- Do exactly what the owner asked. If they were vague, build the simplest version that does the job and say what you assumed in notes.
- Use the owner's numbers to explain why it matters in "why" (one sentence, real numbers only), e.g. "4 members are cancelling right now, so this is your biggest leak."
- Don't duplicate an automation they already have switched on; if theirs nearly does it, say so in notes.
- Emails: 40-120 words, sound like the owner talking to one person, first name, one clear next step. Sign off with {{owner_name}}.
- Prefer ask_my_ai + notify_owner for anything personal or anything in Skool.
- Steps use flat fields: fill only the fields for that step type, leave the rest empty ("" or 0).
${VOICE_RULES}`,
      prompt: `${current ? `CHANGE THIS AUTOMATION as asked, keep everything else the same:\n${JSON.stringify({ name: current.name, trigger: current.trigger, steps: current.actions })}\n\n` : ""}The owner's request: """${request}"""

Their business: ${JSON.stringify(ctx.business)}
Their numbers (what's growing and what's leaking): ${JSON.stringify(ctx.numbers)}
Automations they already have: ${JSON.stringify(ctx.existing.filter((a) => a.id !== current?.id).map(({ id: _id, ...rest }) => rest))}
Their landing pages (for lead_created value): ${JSON.stringify(ctx.sites)}
Their email sequences (for enroll_sequence): ${JSON.stringify(ctx.sequences)}`,
    });
    const finished = finishDraft(res.data, { siteIds, sequenceIds });
    if ("error" in finished) {
      await refundAi(workspaceId, "ai_generation", charge, "Refund: AI automation draft didn't fit");
      return { ok: false, error: finished.error };
    }
    const draftId = await store(finished, res.usage.model, { inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens });
    return { ok: true, draftId, draft: finished, model: res.usage.model };
  } catch (err) {
    await refundAi(workspaceId, "ai_generation", charge, "Refund: AI automation draft failed");
    return { ok: false, error: describeAiError(err) };
  }
}

/** A stored draft, only for this workspace (and the automation it was made for). */
export async function getAutomationDraft(workspaceId: string, draftId: string, automationId: string | null) {
  if (!isUuid(draftId)) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(aiGenerations)
    .where(and(eq(aiGenerations.id, draftId), eq(aiGenerations.workspaceId, workspaceId), eq(aiGenerations.kind, "automation_draft")))
    .orderBy(desc(aiGenerations.createdAt))
    .limit(1);
  if (!row) return null;
  if (((row.input.automationId as string | null) ?? null) !== automationId) return null;
  return { request: String(row.input.request ?? ""), draft: row.output as unknown as AutomationDraft, model: row.model };
}

