import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";

let client: Anthropic | null = null;
export function anthropic(creds?: AiCreds | null): Anthropic {
  // The workspace's own key (bring your own AI), else ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN.
  if (creds?.provider === "anthropic") return new Anthropic({ apiKey: creds.apiKey });
  return (client ??= new Anthropic());
}

// ---------------------------------------------------------------------------
// Bring your own AI: a workspace can add its own Claude or OpenAI key. Its AI features then run
// on that key and are never charged to the wallet, so AI cost doesn't land on the platform.
// ---------------------------------------------------------------------------

export type AiProvider = "anthropic" | "openai";
export type AiCreds = { provider: AiProvider; apiKey: string; model?: string };
export const DEFAULT_OPENAI_MODEL = "gpt-5";

export async function aiCredsFor(workspaceId: string): Promise<AiCreds | null> {
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const s = ws?.settings;
  if (!s?.aiKeyEnc || (s.aiProvider !== "anthropic" && s.aiProvider !== "openai")) return null;
  try {
    return { provider: s.aiProvider, apiKey: decrypt(s.aiKeyEnc), model: s.aiModel || undefined };
  } catch {
    return null;
  }
}

/** Check a key works without spending tokens (lists models). */
export async function verifyAiKey(provider: AiProvider, apiKey: string): Promise<boolean> {
  const res =
    provider === "anthropic"
      ? await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } })
      : await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
  return res.ok;
}

async function openaiResponse(creds: AiCreds, opts: { system: string; prompt: string; maxTokens: number; jsonSchema?: unknown }) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: creds.model || DEFAULT_OPENAI_MODEL,
      instructions: opts.system,
      input: opts.prompt,
      max_output_tokens: opts.maxTokens,
      ...(opts.jsonSchema ? { text: { format: { type: "json_schema", name: "output", schema: opts.jsonSchema, strict: false } } } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    model?: string;
    output?: { content?: { type: string; text?: string }[] }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    incomplete_details?: { reason?: string } | null;
  };
  if (!res.ok) throw new AiOutputError(`OpenAI: ${data.error?.message ?? res.statusText}`);
  const parts = (data.output ?? []).flatMap((o) => o.content ?? []);
  if (parts.some((p) => p.type === "refusal")) throw new AiRefusalError("The AI declined this request. Try rewording your inputs.");
  if (data.incomplete_details?.reason === "max_output_tokens") throw new AiOutputError("The AI response was cut off. Please try again.");
  const text = parts.filter((p) => p.type === "output_text").map((p) => p.text ?? "").join("").trim();
  return { text, usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0, model: data.model ?? creds.model ?? DEFAULT_OPENAI_MODEL } };
}

export class AiRefusalError extends Error {}
export class AiOutputError extends Error {}

export type AiUsage = { inputTokens: number; outputTokens: number; model: string };

// House style for every customer-facing word the AI writes.
export const VOICE_RULES = `Writing rules for all copy:
- Use simple words a 10-year-old understands. Aim for a 3rd to 5th grade reading level.
- Keep sentences short. Use at most one comma per sentence.
- Use active voice and present tense.
- Cut adverbs. Pick stronger verbs instead.
- Tell the reader what to do. Frame things in positive terms.
- Never invent testimonials, reviews, numbers, results or credentials.
- Never promise income, weight loss amounts or guaranteed results.
- For ads, follow Meta's ad policies: never assert or imply a person's personal attributes (health, finances, body, identity), so prefer "people who want X" over "Are you X?".`;

/**
 * One structured call to Claude. The response is parsed and validated against
 * the given Zod (v4) schema. Server-side fallback is on, so a policy decline on
 * the main model is retried on Anthropic's recommended fallback model.
 */
export async function generateStructured<T extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: T;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
  /** Uses this workspace's own AI key when it has one. */
  workspaceId?: string;
}): Promise<{ data: z.infer<T>; usage: AiUsage }> {
  const creds = opts.workspaceId ? await aiCredsFor(opts.workspaceId) : null;
  if (creds?.provider === "openai") {
    const res = await openaiResponse(creds, { system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens ?? 16000, jsonSchema: z.toJSONSchema(opts.schema) });
    let parsed: unknown;
    try {
      parsed = opts.schema.parse(JSON.parse(res.text));
    } catch {
      throw new AiOutputError("The AI returned an unexpected format. Please try again.");
    }
    return { data: parsed as z.infer<T>, usage: res.usage };
  }
  const message = await anthropic(creds).beta.messages.parse({
    model: creds?.model || env.aiModel,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });

  if (message.stop_reason === "refusal") {
    throw new AiRefusalError("The AI declined this request. Try rewording your inputs.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiOutputError("The AI response was cut off. Please try again.");
  }
  if (!message.parsed_output) {
    throw new AiOutputError("The AI returned an unexpected format. Please try again.");
  }
  return {
    data: message.parsed_output as z.infer<T>,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      model: message.model,
    },
  };
}

export function describeAiError(err: unknown): string {
  if (err instanceof AiRefusalError || err instanceof AiOutputError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "The AI key is invalid. Check your key in Settings › AI & connectors.";
  if (err instanceof Anthropic.RateLimitError) return "The AI is busy right now. Please try again in a minute.";
  if (err instanceof Anthropic.BadRequestError) return `The AI rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `AI error (${err.status ?? "network"}). Please try again.`;
  return err instanceof Error ? err.message : "Something went wrong with the AI request.";
}

/** Plain-text generation (short replies, drafts). */
export async function generateText(opts: {
  system: string;
  prompt: string;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
  /** Uses this workspace's own AI key when it has one. */
  workspaceId?: string;
}): Promise<{ text: string; usage: AiUsage }> {
  const creds = opts.workspaceId ? await aiCredsFor(opts.workspaceId) : null;
  if (creds?.provider === "openai") {
    const res = await openaiResponse(creds, { system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens ?? 4000 });
    if (!res.text) throw new AiOutputError("The AI returned an empty reply.");
    return res;
  }
  const message = await anthropic(creds).beta.messages.create({
    model: creds?.model || env.aiModel,
    max_tokens: opts.maxTokens ?? 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.effort },
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });
  if (message.stop_reason === "refusal") throw new AiRefusalError("The AI declined this request.");
  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
  if (!text) throw new AiOutputError("The AI returned an empty reply.");
  return {
    text,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, model: message.model },
  };
}

export type AiCharge = { billedMicros: number; byo: boolean };

/**
 * Pay for one AI call. Returns null when AI can't run (no key anywhere, or the wallet can't cover it),
 * so the caller uses its rule-based fallback. Workspaces with their own key are never charged.
 */
export async function chargeAi(workspaceId: string, unit: "ai_generation" | "ai_assist", description: string): Promise<AiCharge | null> {
  if (await aiCredsFor(workspaceId)) return { billedMicros: 0, byo: true };
  if (!env.aiEnabled) return null;
  const { chargeUsage, InsufficientBalanceError } = await import("../wallet");
  try {
    const c = await chargeUsage(workspaceId, unit, 1, { description });
    return { billedMicros: c.billedMicros, byo: false };
  } catch (err) {
    if (err instanceof InsufficientBalanceError) return null;
    throw err;
  }
}

/** Undo chargeAi() after a failed call. A no-op for workspaces using their own key. */
export async function refundAi(workspaceId: string, unit: "ai_generation" | "ai_assist", charge: AiCharge, description: string) {
  if (charge.byo) return;
  const { refundUsage } = await import("../wallet");
  await refundUsage(workspaceId, unit, 1, charge.billedMicros, description);
}
