import type { WorkspacePlan } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { AI_PROVIDERS, aiCredsFor, type AiProvider } from "@/server/ai/client";
import type { StudioDestination } from "@/server/ai/adStudio";
import { PLANS } from "@/server/plans";
import { playbookByName } from "@/server/playbooks";
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

/**
 * Which card sits above a page's AI button.
 *   claudeCard  their Claude is connected (a connector link it has used): "You're on the Claude road",
 *               with the sentence to say in Claude. It replaces the key nag; the buttons below still
 *               work as before when a key or included runs are there.
 *   keyCard     no Claude and the next press can't use AI: today's "Add your free AI key first".
 */
export function aiGate(runs: AiRuns, claude: boolean): { claudeCard: boolean; keyCard: boolean } {
  return { claudeCard: claude, keyCard: !claude && needsKey(runs) };
}

/** The pages whose work their Claude can do through the connector, and the sentence to say for each. */
export type ClaudeJob = "launch_kit" | "ad_research" | "ad_studio_website" | "ad_studio_skool" | "carousel";

/**
 * Each sentence maps to real connector tools (`tools`, checked against mcp.ts in the tests) and, where
 * one exists, the playbook Claude follows. There is no launch-kit tool: Claude builds Day 1 itself with
 * the Day 1 with Claude playbook, so that page uses the playbook's own words.
 */
export const CLAUDE_JOBS: Record<ClaudeJob, { say: string; does: string; tools: string[]; playbook?: string }> = {
  launch_kit: {
    say: playbookByName("day_1_with_claude")!.say,
    does: "it builds your website from the premium template, your free checklist and your 3 welcome emails as drafts, and writes your Skool About page.",
    tools: ["create_site", "set_lead_magnet", "upsert_email_sequence"],
    playbook: "day_1_with_claude",
  },
  ad_research: {
    say: `Search the Meta Ad Library for ads in my niche that have run for a month or more and save the best angles to my Ad research in ${env.platformName}.`,
    does: "it finds the long-running ads in your niche and saves the angles worth borrowing to this page.",
    tools: ["search_competitor_ads", "save_ad_pack"],
  },
  ad_studio_website: {
    say: `Make my 5 statics for my website at $10 a day with ${env.platformName}.`,
    does: "it writes your 5 statics and your video script, and saves the pack with your numbers and launch plan to this page.",
    tools: ["make_ad_studio_pack"],
    playbook: "make_my_5_statics",
  },
  ad_studio_skool: {
    say: `Make my 5 statics for my Skool link at $5 a day with ${env.platformName}.`,
    does: "it writes your 5 statics and your video script, and saves the pack with your numbers and launch plan to this page.",
    tools: ["make_ad_studio_pack"],
    playbook: "make_my_5_statics",
  },
  carousel: {
    // "Turn my ReelVault script into a 6-slide carousel and save it in OneX."
    say: playbookByName("make_my_carousel")!.say,
    does: "it turns your script into 6 slides and saves them on this page, ready to download.",
    tools: ["save_carousel"],
    playbook: "make_my_carousel",
  },
};

/** Ad studio's job: Day 2's pack goes to the website ($10 a day), Day 3's to the Skool link ($5 a day). */
export const studioJob = (destination: StudioDestination | undefined): ClaudeJob => (destination === "website" ? "ad_studio_website" : "ad_studio_skool");

/** The line beside an AI button, in plain words. `claude`: their Claude is connected. */
export function runsLine(r: AiRuns, claude = false): string {
  if (claude && r.kind === "off") return "This button needs a key. Your Claude doesn't.";
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
