import Link from "next/link";
import { ArrowRightIcon, CalendarClockIcon, CircleCheckIcon, CircleMinusIcon, SquareKanbanIcon } from "lucide-react";
import { cityOf, formatInZone, isValidTimeZone, shortTime, zoneAbbrev } from "@/lib/booking";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ACTIVE_STATUSES, listBookings } from "@/server/booking";
import { contactOpportunities } from "@/server/pipelines";
import { hasFeature } from "@/server/plans";
import { Panel } from "@/components/ui";
import { QuietEmpty, RowList } from "@/components/crm-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Timeline lines for imports, opportunities and bookings (the contact page's timeline). */
export function crmTimelineDetail(type: string, data: Record<string, unknown>): string | null {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  if (type === "imported") return data.file ? `From ${str(data.file)}` : "From a CSV import";
  if (type === "opportunity_created") return [str(data.title), str(data.stage)].filter(Boolean).join(" · ");
  if (type === "opportunity_moved") return `${str(data.title)}: ${str(data.from)} → ${str(data.to)}`;
  if (type.startsWith("booking_") && str(data.startAt)) {
    const tz = isValidTimeZone(data.timezone) ? data.timezone : "UTC";
    const at = new Date(str(data.startAt));
    const when = `${formatInZone(at, tz, { weekday: "short", month: "short", day: "numeric" })}, ${shortTime(at, tz)}${tz === "UTC" ? " UTC" : ` (${cityOf(tz)})`}`;
    return [str(data.calendar), when, type === "booking_cancelled" ? str(data.reason) : ""].filter(Boolean).join(" · ");
  }
  return null;
}

const STATUS: Record<string, { label: string; className: string } | undefined> = {
  won: { label: "Won", className: "bg-success-soft text-success" },
  lost: { label: "Lost", className: "bg-secondary text-muted-foreground" },
  abandoned: { label: "Abandoned", className: "bg-secondary text-muted-foreground" },
};

/**
 * The contact page's "Opportunities" panel: their deals on the pipeline boards, plus any calls
 * they've booked that are still coming up. Shows nothing on plans without pipelines.
 */
export async function ContactDeals({ wid, contactId }: { wid: string; contactId: string }) {
  const db = await getDb();
  const [ws] = await db.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, wid)).limit(1);
  if (!ws || !hasFeature(ws.plan, "pipelines")) return null;
  const [deals, calls] = await Promise.all([
    contactOpportunities(wid, contactId),
    hasFeature(ws.plan, "calendar") ? listBookings(wid, { contactId, from: new Date(Date.now() - 3600_000), statuses: ACTIVE_STATUSES, limit: 5 }) : Promise.resolve([]),
  ]);
  const board = `/app/w/${wid}/pipeline`;

  return (
    <Panel
      icon={SquareKanbanIcon}
      tone="primary"
      title="Opportunities"
      sub="Where they are on your pipeline, and what it's worth."
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link href={board}>
            Pipeline
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      }
    >
      {calls.length ? (
        <ul className="flex flex-col gap-2">
          {calls.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-xl bg-accent/60 px-3 py-2.5 text-sm dark:bg-white/[0.04]">
              <CalendarClockIcon className="size-4 shrink-0 text-primary dark:text-violet-300" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{b.calendarName}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {formatInZone(b.startAt, b.calendarTimezone, { weekday: "short", month: "short", day: "numeric" })}, {shortTime(b.startAt, b.calendarTimezone)} ({zoneAbbrev(b.startAt, b.calendarTimezone)})
                </span>
              </span>
              <Link href={`/app/w/${wid}/calendar`} className="shrink-0 text-xs font-medium">
                Calendar
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {deals.length === 0 ? (
        <QuietEmpty
          icon={SquareKanbanIcon}
          title="No opportunities yet"
          body="Add one on your pipeline when they look like they might buy. Booking a call adds one by itself."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={board}>Open pipeline</Link>
            </Button>
          }
        />
      ) : (
        <RowList>
          {deals.map((d) => {
            const status = STATUS[d.status];
            return (
              <li key={d.id}>
                <Link href={`${board}?p=${d.pipelineId}`} className="group/row flex items-center gap-3.5 px-6 py-3.5 text-foreground no-underline transition-colors duration-150 ease-swift hover:bg-accent/60 hover:no-underline dark:hover:bg-white/[0.03]">
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-[10px]",
                      d.stageKind === "won" ? "bg-success-soft text-success" : d.stageKind === "lost" ? "bg-muted text-muted-foreground" : "bg-accent text-primary dark:text-violet-300",
                    )}
                  >
                    {d.stageKind === "won" ? <CircleCheckIcon className="size-4" /> : d.stageKind === "lost" ? <CircleMinusIcon className="size-4" /> : <SquareKanbanIcon className="size-4" />}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm font-medium group-hover/row:text-primary">{d.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {d.pipelineName} › {d.stageName}
                    </span>
                  </span>
                  {status ? (
                    <Badge variant="secondary" className={status.className}>
                      {status.label}
                    </Badge>
                  ) : null}
                  <span className="shrink-0 text-sm font-medium tabular-nums">{d.valueCents ? formatCents(d.valueCents, d.currency) : <span className="text-subtle-foreground">No value</span>}</span>
                </Link>
              </li>
            );
          })}
        </RowList>
      )}
    </Panel>
  );
}
