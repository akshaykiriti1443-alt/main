import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { availableSlots, publicCalendar, publicCalendarsFor } from "@/server/booking";
import { BookingWidget } from "@/components/booking/booking-widget";
import { CalendarIntro, ClosedCard, EmbedShell, PublicShell } from "@/components/booking/public-shell";
import type { WidgetCalendar } from "@/components/booking/shared";
import { Button } from "@/components/ui/button";
import { bookingPrefill, isEmbed, safeNextPath, type SearchParams } from "@/lib/bookingEmbed";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ workspaceSlug: string; calendarSlug: string }>; searchParams: Promise<SearchParams> };

// One lookup per request, shared by the metadata and the page.
const load = cache((workspaceSlug: string, calendarSlug: string) => publicCalendar(workspaceSlug, calendarSlug));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { workspaceSlug, calendarSlug } = await params;
  const pub = await load(workspaceSlug, calendarSlug);
  return {
    title: pub ? `Book a call with ${pub.calendar.host}` : "Book a call",
    description: pub ? `${pub.calendar.name} with ${pub.calendar.host}. Pick a time that suits you.` : undefined,
    robots: { index: false, follow: false },
  };
}

// The public booking page. Everything it needs is rendered here, so it opens ready, with no spinner.
// Query options (src/lib/bookingEmbed.ts): name/first_name/last_name, email, phone prefill the form;
// embed=1 is the chrome-light layout for an iframe on the same site; next=/path goes there after
// booking (same-site paths only).
export default async function BookingPage({ params, searchParams }: Params) {
  const { workspaceSlug, calendarSlug } = await params;
  const sp = await searchParams;
  const pub = await load(workspaceSlug, calendarSlug);
  if (!pub) notFound();
  const c = pub.calendar;
  const embed = isEmbed(sp);
  const Shell = embed ? EmbedShell : PublicShell;

  if (!pub.open) {
    const others = (await publicCalendarsFor(workspaceSlug))?.calendars.filter((x) => x.slug !== c.slug) ?? [];
    return (
      <Shell>
        <ClosedCard
          host={c.host}
          action={
            others.length ? (
              <Button asChild variant="outline" className="mt-1">
                <a href={`/b/${workspaceSlug}`}>
                  See other ways to book
                  <ArrowRightIcon data-icon="inline-end" />
                </a>
              </Button>
            ) : null
          }
        />
      </Shell>
    );
  }

  const slots = (await availableSlots(pub.raw)).map((d) => d.toISOString());
  const calendar: WidgetCalendar = {
    name: c.name,
    slug: c.slug,
    workspaceSlug: c.workspaceSlug,
    host: c.host,
    durationMinutes: c.durationMinutes,
    timezone: c.timezone,
    locationType: c.locationType,
    locationLabel: c.locationLabel,
    phoneMode: c.phoneMode,
    questions: c.questions,
    maxDaysAhead: c.maxDaysAhead,
    description: c.description,
  };

  const widget = (
    <BookingWidget
      calendar={calendar}
      slots={slots}
      now={Date.now()}
      prefill={bookingPrefill(sp)}
      next={safeNextPath(sp.next)}
      embed={embed}
      aside={<CalendarIntro host={c.host} name={c.name} durationMinutes={c.durationMinutes} locationType={c.locationType} locationLabel={c.locationLabel} description={c.description} />}
    />
  );
  if (embed) return <EmbedShell>{widget}</EmbedShell>;
  return <PublicShell note={<>Your details only go to {c.host}. You can reschedule or cancel any time from your confirmation email.</>}>{widget}</PublicShell>;
}
