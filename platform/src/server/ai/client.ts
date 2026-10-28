import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { env } from "@/lib/env";

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  // Resolves credentials from ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN).
  return (client ??= new Anthropic());
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
}): Promise<{ data: z.infer<T>; usage: AiUsage }> {
  const message = await anthropic().beta.messages.parse({
    model: env.aiModel,
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
  if (err instanceof Anthropic.AuthenticationError) return "The AI key is invalid. Check ANTHROPIC_API_KEY.";
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
}): Promise<{ text: string; usage: AiUsage }> {
  const message = await anthropic().beta.messages.create({
    model: env.aiModel,
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
