import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { isPublicHttpsUrl } from "@/lib/html";

let client: Anthropic | null = null;
export function anthropic(creds?: AiCreds | null): Anthropic {
  // The workspace's own key (bring your own AI), else ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN.
  if (creds?.provider === "anthropic") return new Anthropic({ apiKey: creds.apiKey });
  return (client ??= new Anthropic());
}

// ---------------------------------------------------------------------------
// Bring your own AI: a workspace can add its own AI key. Its AI features (and "Ask my AI"
// automation steps) then run on that key and are never charged to the wallet, so AI cost
// doesn't land on the platform. Free tiers work too: Google Gemini, Groq and OpenRouter's
// ":free" models all speak the OpenAI-compatible Chat Completions API.
// ---------------------------------------------------------------------------

export type AiProvider = "anthropic" | "openai" | "gemini" | "groq" | "openrouter" | "custom";
export type AiCreds = { provider: AiProvider; apiKey: string; model?: string; baseUrl?: string };
export const DEFAULT_OPENAI_MODEL = "gpt-5";

export const AI_PROVIDERS: Record<AiProvider, { label: string; free: boolean; base: string; keyUrl: string; note: string }> = {
  gemini: {
    label: "Google Gemini",
    free: true,
    base: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/apikey",
    note: "Free tier with daily limits. Google may use free-tier prompts to improve its products.",
  },
  groq: { label: "Groq", free: true, base: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys", note: "Free tier with rate limits. Very fast open models." },
  openrouter: {
    label: "OpenRouter",
    free: true,
    base: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/settings/keys",
    note: "Models ending in :free cost nothing, with daily limits. We pick one for you.",
  },
  anthropic: { label: "Claude (Anthropic API)", free: false, base: "https://api.anthropic.com/v1", keyUrl: "https://console.anthropic.com/settings/keys", note: "Paid API. The best writing quality." },
  openai: { label: "ChatGPT (OpenAI API)", free: false, base: "https://api.openai.com/v1", keyUrl: "https://platform.openai.com/api-keys", note: "Paid API." },
  custom: { label: "Other (OpenAI-compatible)", free: false, base: "", keyUrl: "", note: "Any OpenAI-compatible API on a public https URL, e.g. Mistral, DeepSeek or Together." },
};
const PROVIDER_KEYS = Object.keys(AI_PROVIDERS) as AiProvider[];
export const isAiProvider = (v: unknown): v is AiProvider => typeof v === "string" && (PROVIDER_KEYS as string[]).includes(v);

const COMPAT_MAX_TOKENS = 8192;

export async function aiCredsFor(workspaceId: string): Promise<AiCreds | null> {
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const s = ws?.settings;
  if (!s?.aiKeyEnc || !isAiProvider(s.aiProvider)) return null;
  if (s.aiProvider === "custom" && !(s.aiBaseUrl && isPublicHttpsUrl(s.aiBaseUrl))) return null;
  try {
    return { provider: s.aiProvider, apiKey: decrypt(s.aiKeyEnc), model: s.aiModel || undefined, baseUrl: s.aiBaseUrl || undefined };
  } catch {
    return null;
  }
}

function compatBase(creds: Pick<AiCreds, "provider" | "baseUrl">): string {
  const base = creds.provider === "custom" ? creds.baseUrl ?? "" : AI_PROVIDERS[creds.provider].base;
  return base.replace(/\/+$/, "");
}

/** Pick a sensible default chat model from a provider's model list. */
export function pickModel(provider: AiProvider, ids: string[]): string | undefined {
  const clean = ids.map((id) => id.replace(/^models\//, "")).filter((id) => !/embed|whisper|tts|audio|image|vision-only|guard|moderation|transcri|realtime|live|veo|imagen/i.test(id));
  const prefer: RegExp[] =
    provider === "gemini"
      ? [/^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-flash(?!-lite)/, /flash/, /gemini/]
      : provider === "groq"
        ? [/llama-3\.3-70b/, /70b/, /llama/, /qwen|mixtral|gemma/]
        : provider === "openrouter"
          ? [/:free$/]
          : [/./];
  for (const re of prefer) {
    const hit = clean.filter((id) => re.test(id)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
    if (hit) return hit;
  }
  return clean[0];
}

/**
 * Check a key works without spending tokens, and find a default model.
 * Returns ok:false with a reason the owner can act on.
 */
export async function verifyAiKey(provider: AiProvider, apiKey: string, baseUrl?: string): Promise<{ ok: boolean; model?: string; error?: string }> {
  const t = AbortSignal.timeout(15_000);
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, signal: t });
      return res.ok ? { ok: true } : { ok: false, error: "Anthropic didn't accept that key." };
    }
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` }, signal: t });
      return res.ok ? { ok: true } : { ok: false, error: "OpenAI didn't accept that key." };
    }
    if (provider === "custom" && !(baseUrl && isPublicHttpsUrl(baseUrl))) return { ok: false, error: "Use a public https:// base URL." };
    const base = compatBase({ provider, baseUrl });
    if (provider === "openrouter") {
      const key = await fetch(`${base}/key`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: t, redirect: "error" });
      if (!key.ok) return { ok: false, error: "OpenRouter didn't accept that key." };
    }
    const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: t, redirect: "error" });
    if (!res.ok) return { ok: false, error: `${AI_PROVIDERS[provider].label} didn't accept that key (${res.status}).` };
    const data = (await res.json().catch(() => ({}))) as { data?: { id?: string }[] };
    const ids = (data.data ?? []).map((m) => m.id ?? "").filter(Boolean);
    return { ok: true, model: pickModel(provider, ids) };
  } catch (err) {
    return { ok: false, error: `Couldn't reach ${AI_PROVIDERS[provider].label}: ${err instanceof Error ? err.message : String(err)}` };
  }
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

/** OpenAI-compatible Chat Completions (Gemini, Groq, OpenRouter, custom). */
async function chatCompletion(creds: AiCreds, opts: { system: string; prompt: string; maxTokens: number; json?: boolean; extra?: { role: "assistant" | "user"; content: string }[] }) {
  const base = compatBase(creds);
  if (creds.provider === "custom" && !isPublicHttpsUrl(base)) throw new AiOutputError("Your AI base URL must be a public https:// address.");
  const call = (withFormat: boolean) =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(180_000),
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
        ...(creds.provider === "openrouter" ? { "HTTP-Referer": env.appUrl, "X-Title": env.platformName } : {}),
      },
      body: JSON.stringify({
        model: creds.model,
        messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.prompt }, ...(opts.extra ?? [])],
        max_tokens: Math.min(opts.maxTokens, COMPAT_MAX_TOKENS),
        ...(withFormat ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  let res = await call(Boolean(opts.json));
  // Some models reject response_format; ask again without it (the prompt still demands JSON).
  if (!res.ok && opts.json && res.status === 400) res = await call(false);
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
    model?: string;
    choices?: { finish_reason?: string; message?: { content?: string | { type?: string; text?: string }[] | null; refusal?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const label = AI_PROVIDERS[creds.provider].label;
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : data.error?.message;
    if (res.status === 429) throw new AiOutputError(`${label} says you've hit its rate limit (free tiers have daily limits). Try again later.`);
    throw new AiOutputError(`${label}: ${msg ?? res.statusText}`);
  }
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new AiRefusalError("The AI declined this request. Try rewording your inputs.");
  if (choice?.finish_reason === "length") throw new AiOutputError("The AI response was cut off. Please try again.");
  const content = choice?.message?.content;
  const text = (typeof content === "string" ? content : (content ?? []).map((c) => c.text ?? "").join("")).trim();
  return { text, usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0, model: data.model ?? creds.model ?? label } };
}

/** Pull the JSON object out of a model reply (tolerates code fences and stray prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
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
  if (creds && creds.provider !== "anthropic") {
    // Free and open models: ask for JSON matching the schema, validate, and give one retry with the error.
    const system = `${opts.system}\n\nReply with ONLY one JSON object, no prose and no code fences, matching this JSON Schema:\n${JSON.stringify(z.toJSONSchema(opts.schema))}`;
    const maxTokens = opts.maxTokens ?? 16000;
    let res = await chatCompletion(creds, { system, prompt: opts.prompt, maxTokens, json: true });
    const tryParse = (text: string) => {
      try {
        return { ok: true as const, data: opts.schema.parse(extractJson(text)) as z.infer<T> };
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message.slice(0, 600) : "invalid JSON" };
      }
    };
    let parsed = tryParse(res.text);
    if (!parsed.ok) {
      res = await chatCompletion(creds, {
        system,
        prompt: opts.prompt,
        maxTokens,
        json: true,
        extra: [
          { role: "assistant", content: res.text.slice(0, 4000) },
          { role: "user", content: `That reply did not match the schema (${parsed.error}). Reply again with only the corrected JSON object.` },
        ],
      });
      parsed = tryParse(res.text);
    }
    if (!parsed.ok) throw new AiOutputError("The AI returned an unexpected format. Please try again, or pick a stronger model.");
    return { data: parsed.data, usage: res.usage };
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
  if (creds && creds.provider !== "anthropic") {
    const res = await chatCompletion(creds, { system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens ?? 4000 });
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
