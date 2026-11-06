"use client";

import { useEffect, useState } from "react";
import { ArrowRightIcon, GlobeIcon } from "lucide-react";
import { canonicalZone, cityOf, isValidTimeZone } from "@/lib/booking";
import { SubmitButton } from "@/components/client";

/** The first-visit button. Sends the browser's time zone so "9 to 5" means the owner's 9 to 5. */
export function StarterForm({ action }: { action: (fd: FormData) => void | Promise<void> }) {
  const [tz, setTz] = useState("");
  useEffect(() => {
    const detected = canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone, "");
    if (isValidTimeZone(detected)) setTz(detected);
  }, []);

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <input type="hidden" name="timezone" value={tz} />
      <SubmitButton variant="cta" size="lg" pendingText="Setting it up…" guide="calendar-start">
        Create my booking page
        <ArrowRightIcon data-icon="inline-end" />
      </SubmitButton>
      <span className="inline-flex items-center gap-1.5 text-[13px] text-white/75">
        <GlobeIcon className="size-3.5" aria-hidden />
        {tz ? <>Hours in {cityOf(tz)} time. You can change anything after.</> : <>Hours in your time zone. You can change anything after.</>}
      </span>
    </form>
  );
}
