import { LinkIcon } from "lucide-react";
import { EmptyArt } from "@/components/ui";
import { PublicShell } from "@/components/booking/public-shell";

export const metadata = { title: "Booking not found", robots: { index: false, follow: false } };

export default function BookingNotFound() {
  return (
    <PublicShell>
      <div className="w-full max-w-[520px] rounded-3xl bg-card px-6 pt-10 pb-9 text-center shadow-float ring-1 ring-ink/[0.06] md:px-10 dark:ring-white/[0.08]">
        <div className="flex flex-col items-center gap-4">
          <EmptyArt icon={LinkIcon} tone="muted" />
          <h1 className="text-[32px] leading-[1.05] tracking-[-0.012em] md:text-[38px]">This link doesn&apos;t work</h1>
          <p className="max-w-[40ch] text-[15px] leading-relaxed text-muted-foreground">
            Check you copied the whole link from your confirmation email. It&apos;s the &ldquo;Reschedule or cancel&rdquo; link in that email.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
