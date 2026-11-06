import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRightIcon, ClockIcon } from "lucide-react";
import { publicCalendarsFor } from "@/server/booking";
import { ClosedCard, HostMark, PLACE_ICON, PublicShell } from "@/components/booking/public-shell";
import { durationLabel } from "@/components/booking/shared";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ workspaceSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const list = await publicCalendarsFor((await params).workspaceSlug);
  return { title: list ? `Book a call with ${list.host}` : "Book a call", robots: { index: false, follow: false } };
}

// Every open calendar of one workspace: pick the kind of call, then a time.
export default async function WorkspaceBookingPage({ params }: Params) {
  const { workspaceSlug } = await params;
  const list = await publicCalendarsFor(workspaceSlug);
  if (!list) notFound();

  if (!list.calendars.length) {
    return (
      <PublicShell>
        <ClosedCard host={list.host} title="No booking pages are open" />
      </PublicShell>
    );
  }

  return (
    <PublicShell note={<>Your details only go to {list.host}.</>}>
      <div className="flex w-full max-w-[640px] flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-2.5 rounded-full bg-card py-1.5 pr-4 pl-1.5 text-sm font-medium shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.08]">
          <HostMark host={list.host} className="size-7 text-[10px]" />
          {list.host}
        </span>
        <h1 className="mt-2 text-[38px] leading-[1.02] tracking-[-0.012em] md:text-[48px]">Book a time with {list.host}</h1>
        <p className="max-w-[46ch] text-[15.5px] leading-relaxed text-muted-foreground">Pick the call that fits. You&apos;ll choose a day and time next, in your own time zone.</p>
      </div>
      <ul className="mt-2 grid w-full max-w-[640px] gap-3">
        {list.calendars.map((c) => {
          const Place = PLACE_ICON[c.locationType];
          return (
            <li key={c.id}>
              <a
                href={`/b/${workspaceSlug}/${c.slug}`}
                className="group/cal flex items-center gap-4 rounded-2xl bg-card p-5 text-foreground no-underline shadow-card ring-1 ring-ink/[0.06] transition-[box-shadow,transform] duration-200 ease-soft outline-none hover:-translate-y-0.5 hover:no-underline hover:shadow-lift focus-visible:ring-[3px] focus-visible:ring-ring/35 md:p-6 dark:ring-white/[0.07]"
              >
                <span className="grid min-w-0 flex-1 gap-1.5">
                  <span className="text-[17px] font-semibold tracking-[-0.012em] transition-colors group-hover/cal:text-primary dark:group-hover/cal:text-violet-300">{c.name}</span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <ClockIcon className="size-3.5" aria-hidden />
                      {durationLabel(c.durationMinutes)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Place className="size-3.5" aria-hidden />
                      {c.locationLabel}
                    </span>
                  </span>
                  {c.description ? <span className="line-clamp-2 text-[14px] leading-relaxed text-foreground/75">{c.description}</span> : null}
                </span>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-primary transition-transform duration-200 ease-soft group-hover/cal:translate-x-0.5 dark:text-violet-300">
                  <ArrowRightIcon className="size-4" aria-hidden />
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </PublicShell>
  );
}
