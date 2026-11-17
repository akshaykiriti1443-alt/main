import Link from "next/link";
import { cookies } from "next/headers";
import { EVENT_WINS, type EventKey } from "@/lib/week";
import type { Path } from "@/server/path";
import { MarkSeen } from "./mark-seen";
import { Tick } from "./tick";
import { eventKey, pickWin, WINS_COOKIE } from "./wins";

/**
 * One true sentence about something that now exists, with its link. It shows only for a step or
 * a real event that's new since the last visit, and stays until the next win replaces it.
 */
export async function WinLine({ path, wid }: { path: Path; wid: string }) {
  const base = `/app/w/${wid}`;
  const events = (Object.keys(EVENT_WINS) as EventKey[]).filter((k) => path.events[k]);
  const all = [...path.doneKeys, ...events.map(eventKey)];
  const raw = (await cookies()).get(WINS_COOKIE)?.value;
  const { show, write } = pickWin(all, raw === undefined ? undefined : decodeURIComponent(raw));

  let line: { text: string; link?: { text: string; href: string }; tick: "app" | "you" | "waiting" } | null = null;
  if (show?.startsWith("ev:")) {
    const e = EVENT_WINS[show.slice(3) as EventKey];
    if (e) line = { text: e.text, link: { text: e.link, href: `${base}/${e.to}` }, tick: "app" };
  } else if (show) {
    const step = path.days.flatMap((d) => d.steps).find((s) => s.key === show);
    if (step?.tick) line = { text: step.win, link: step.proof?.href ? { text: step.proof.text, href: step.proof.href } : undefined, tick: step.tick };
  }

  return (
    <>
      <MarkSeen name={WINS_COOKIE} value={write} path={base} />
      {line ? (
        <p role="status" className="flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-3 text-sm leading-snug ring-1 ring-success/20">
          <Tick tick={line.tick} className="size-6" />
          <span className="min-w-0 flex-1">
            {line.text}
            {line.link ? (
              <>
                {" "}
                <Link href={line.link.href} {...(/^https?:/.test(line.link.href) ? { target: "_blank", rel: "noreferrer" } : {})} className="font-semibold whitespace-nowrap">
                  {line.link.text}
                </Link>
              </>
            ) : null}
          </span>
        </p>
      ) : null}
    </>
  );
}
