import { computePath, type Path, type WeekStep } from "./path";
import { getCourseUnlocks } from "./courseUnlocks";
import { getEntryTicket } from "./unlocks";

// The companion ("Penny"): how to do this exact step, on the page where it happens. She never
// picks a step: she reads path.current, so she can't disagree with the big card on the home page.
// The words live in src/lib/guides.ts and src/lib/week.ts.

export {
  GUIDE_COOKIE,
  GUIDE_HELLO_COOKIE,
  GUIDE_SKIP_COOKIE,
  isGuideMode,
  type GuideMode,
} from "@/lib/guides";

export type CompanionSnapshot = {
  mode: Path["mode"];
  state: Path["state"];
  current: WeekStep | null;
  /** The current day's title, for her kicker. */
  dayTitle?: string;
  doneKeys: string[];
  /** Win line per done key, so a fresh tick can say what now exists. */
  wins: Record<string, string>;
  laterCount: number;
  waitingOnMeta: boolean;
  skoolGroupUrl: string;
};

/** Pure: the slice of the path Penny needs. */
export function snapshotFromPath(path: Path): CompanionSnapshot {
  const steps = path.days.flatMap((d) => d.steps);
  return {
    mode: path.mode,
    state: path.state,
    current: path.current,
    dayTitle: path.current ? path.days[path.current.day - 1]?.title : undefined,
    doneKeys: path.doneKeys,
    wins: Object.fromEntries(steps.filter((s) => s.done).map((s) => [s.key, s.win])),
    laterCount: path.laterKeys.length,
    waitingOnMeta: path.waitingOnMeta,
    skoolGroupUrl: path.links.skoolGroup,
  };
}

export async function companionSnapshot(
  ws: Parameters<typeof computePath>[0],
  userId: string,
): Promise<CompanionSnapshot> {
  return snapshotFromPath(
    await computePath(ws, userId, {
      entryTicketOn: Boolean((await getEntryTicket())?.on),
      ...(await getCourseUnlocks().then((c) => ({ courseUnlocksOn: c.on, courseUnlocksSince: c.since }))),
    }),
  );
}
