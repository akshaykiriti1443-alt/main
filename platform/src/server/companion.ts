import { computePath } from "./path";
import { getEntryTicket } from "./unlocks";

// The companion ("Penny"): a step-by-step guide on every page that a member can turn on and off.
// The server only says where the member is on Your path; the words live in src/lib/guides.ts.

export {
  GUIDE_COOKIE,
  GUIDE_SKIP_COOKIE,
  isGuideMode,
  type GuideMode,
} from "@/lib/guides";

export type CompanionStep = {
  key: string;
  title: string;
  why: string;
  lesson: string;
  href: string;
  done: boolean;
  locked?: string;
  /** Optional steps and outcomes are never "next"; they still tick when done (see path.ts). */
  kind?: "optional" | "outcome";
  stage: string;
};
export type CompanionSnapshot = {
  steps: CompanionStep[];
  done: number;
  total: number;
  level: number;
};

export async function companionSnapshot(
  ws: Parameters<typeof computePath>[0],
  userId: string,
): Promise<CompanionSnapshot> {
  const path = await computePath(ws, userId, {
    entryTicketOn: Boolean((await getEntryTicket())?.on),
  });
  return {
    steps: path.stages.flatMap((st) =>
      st.steps.map((x) => ({ ...x, stage: st.tag })),
    ),
    done: path.done,
    total: path.total,
    level: path.level,
  };
}
