import type { WorkspacePlan } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { AI_PROVIDERS, aiCredsFor, type AiProvider } from "@/server/ai/client";
import { PLANS } from "@/server/plans";
import { canAfford, usageThisMonth } from "@/server/wallet";

/**
 * How the next AI press on this account runs, for the line beside every AI button.
 *   own        the member's own key: no counting.
 *   free       one of the runs the plan includes this month; `next` is the run this press uses.
 *   out        those runs are used up and nothing else can pay: add a free key.
 *   paid       past the included runs, but the account can still pay (Growth with funds).
 *   unlimited  the owner's own accounts.
 *   off        no AI anywhere: the tools give their starter template.
 */
export type AiRuns =
  | { kind: "own"; provider: AiProvider; label: string }
  | { kind: "free"; used: number; total: number; next: number }
  | { kind: "out"; total: number }
  | { kind: "paid" }
  | { kind: "unlimited" }
  | { kind: "off" };

// The owner plan's allowance is 1e9: never worth counting out loud.
const UNLIMITED = 1e6;

export function aiRunsFrom(o: { provider: AiProvider | null; aiEnabled: boolean; included: number; used: number; canPay: boolean }): AiRuns {
  if (o.provider) return { kind: "own", provider: o.provider, label: AI_PROVIDERS[o.provider].label };
  if (!o.aiEnabled) return { kind: "off" };
  if (o.included >= UNLIMITED) return { kind: "unlimited" };
  if (o.used < o.included) return { kind: "free", used: o.used, total: o.included, next: o.used + 1 };
  return o.canPay ? { kind: "paid" } : { kind: "out", total: o.included };
}

export async function aiRunsFor(workspace: { id: string; plan: WorkspacePlan }): Promise<AiRuns> {
  const creds = await aiCredsFor(workspace.id);
  if (creds || !env.aiEnabled) return aiRunsFrom({ provider: creds?.provider ?? null, aiEnabled: env.aiEnabled, included: 0, used: 0, canPay: false });
  const included = PLANS[workspace.plan].included.ai_generation ?? 0;
  const used = (await usageThisMonth(workspace.id)).ai_generation ?? 0;
  // Only asked once the included runs are gone, so a normal page view never touches billing.
  const canPay = used >= included && included < UNLIMITED ? await canAfford(workspace.id, "ai_generation") : false;
  return aiRunsFrom({ provider: null, aiEnabled: true, included, used, canPay });
}

/** True when the next press can't use AI, so the page shows the "add your free key" card. */
export const needsKey = (r: AiRuns) => r.kind === "out" || r.kind === "off";

/** The line beside an AI button, in plain words. */
export function runsLine(r: AiRuns): string {
  switch (r.kind) {
    case "own":
      return `Runs on your ${r.label} key.`;
    case "free":
      return `AI run ${r.next} of ${r.total} this month.`;
    case "out":
      return `You've used your ${r.total} free AI runs this month.`;
    case "paid":
      return "Uses 1 AI run.";
    case "unlimited":
      return "";
    case "off":
      return "No AI is connected yet.";
  }
}
