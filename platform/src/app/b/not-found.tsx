import { CalendarSearchIcon } from "lucide-react";
import { EmptyArt } from "@/components/ui";
import { PublicShell } from "@/components/booking/public-shell";

export const metadata = { title: "Booking page not found", robots: { index: false, follow: false } };

export default function BookingPageNotFound() {
  return (
    <PublicShell>
      <div className="w-full max-w-[520px] rounded-3xl bg-card px-6 pt-10 pb-9 text-center shadow-float ring-1 ring-ink/[0.06] md:px-10 dark:ring-white/[0.08]">
        <div className="flex flex-col items-center gap-4">
          <EmptyArt icon={CalendarSearchIcon} tone="muted" />
          <h1 className="text-[32px] leading-[1.05] tracking-[-0.012em] md:text-[38px]">We can&apos;t find that booking page</h1>
          <p className="max-w-[40ch] text-[15px] leading-relaxed text-muted-foreground">The link may have a typo, or the page was renamed. Ask whoever shared it for the latest link.</p>
        </div>
      </div>
    </PublicShell>
  );
}
