import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { googleCalendarUrl } from "@/lib/booking";
import { availableSlots, bookingByToken, isActive, LOCATION_LABELS, locationText, manageUrl } from "@/server/booking";
import { ManageBooking } from "@/components/booking/manage";
import { HostMark, PublicShell } from "@/components/booking/public-shell";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

const load = cache((token: string) => bookingByToken(token));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const row = await load((await params).token);
  const host = row ? row.workspace.settings.businessName || row.workspace.name : null;
  return {
    title: row ? `${row.calendar.name} with ${host}` : "Your booking",
    robots: { index: false, follow: false },
    // The link is the key to this booking: never send it on to other sites.
    referrer: "no-referrer",
  };
}

// The booker's private link: just their own booking, to see, move or cancel.
export default async function ManageBookingPage({ params }: Params) {
  const { token } = await params;
  const row = await load(token);
  if (!row) notFound();
  const { booking, calendar, workspace } = row;
  const host = workspace.settings.businessName || workspace.name;
  const active = isActive(booking);
  const past = booking.startAt.getTime() <= Date.now();
  const slots = active && !past ? (await availableSlots(calendar, { excludeBookingId: booking.id })).map((d) => d.toISOString()) : [];
  const url = manageUrl(token);
  const where = active ? locationText(calendar, booking) : null;

  return (
    <PublicShell note={<>This page is private to you. Anyone with the link can change this booking, so keep it to yourself.</>}>
      <span className="inline-flex items-center gap-2.5 rounded-full bg-card py-1.5 pr-4 pl-1.5 text-sm font-medium shadow-card ring-1 ring-ink/[0.06] dark:ring-white/[0.08]">
        <HostMark host={host} className="size-7 text-[10px]" />
        {host}
      </span>
      <ManageBooking
        token={token}
        booking={{
          startAt: booking.startAt.toISOString(),
          endAt: booking.endAt.toISOString(),
          status: booking.status,
          timezone: booking.timezone,
          name: booking.name,
          email: booking.email,
          past,
        }}
        calendar={{
          name: calendar.name,
          durationMinutes: calendar.durationMinutes,
          maxDaysAhead: calendar.maxDaysAhead,
          timezone: calendar.timezone,
          locationLabel: LOCATION_LABELS[calendar.locationType],
          locationType: calendar.locationType,
        }}
        host={host}
        location={where}
        slots={slots}
        now={Date.now()}
        links={{
          google:
            active && !past
              ? googleCalendarUrl({ start: booking.startAt, end: booking.endAt, title: `${calendar.name} with ${host}`, details: `${where ?? ""}\nReschedule or cancel: ${url}`, location: calendar.locationValue })
              : null,
          ics: `/booking/${token}/invite.ics`,
          bookAgain: `/b/${workspace.slug}/${calendar.slug}`,
        }}
      />
    </PublicShell>
  );
}
