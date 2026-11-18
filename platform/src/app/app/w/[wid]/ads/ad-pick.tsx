"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewAdChoice } from "@/server/ai/adStudio";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Dest = "optin" | "skool";

/**
 * "Which ad?" in Ad review: the names Ad studio gave their ads (Web S1…S5, Skool S1…S5), or Other.
 * Picking one also sets where it sends people and how many days it has run, worked out from the day
 * it went live. Every box stays editable: once they type their own days, we leave them alone.
 */
export function AdPick({ choices, launchDays }: { choices: ReviewAdChoice[]; launchDays: Record<Dest, number | null> }) {
  const [pick, setPick] = useState(choices.length ? "" : "other");
  const [other, setOther] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const daysTyped = useRef(false);

  const form = () => wrap.current?.closest("form") ?? null;
  const setDays = (dest: Dest) => {
    const days = launchDays[dest];
    const box = form()?.querySelector<HTMLInputElement>('input[name="days"]');
    if (box && days && !daysTyped.current) box.value = String(days);
  };

  useEffect(() => {
    const f = form();
    if (!f) return;
    const daysBox = f.querySelector<HTMLInputElement>('input[name="days"]');
    const typed = () => {
      daysTyped.current = true;
    };
    const destChanged = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.name === "destination" && (t.value === "optin" || t.value === "skool")) setDays(t.value);
    };
    daysBox?.addEventListener("input", typed);
    f.addEventListener("change", destChanged);
    return () => {
      daysBox?.removeEventListener("input", typed);
      f.removeEventListener("change", destChanged);
    };
    // launchDays comes from the server and doesn't change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!choices.length) {
    return <Input id="adName" name="adName" placeholder="e.g. Web S1" maxLength={80} />;
  }

  const onPick = (value: string) => {
    setPick(value);
    const choice = choices.find((c) => c.value === value);
    if (!choice) return;
    const radio = form()?.querySelector<HTMLInputElement>(`input[name="destination"][value="${choice.destination}"]`);
    if (radio) radio.checked = true;
    setDays(choice.destination);
  };

  return (
    <div ref={wrap} className="flex flex-col gap-2">
      <NativeSelect id="adName" aria-label="Which ad?" value={pick} onChange={(e) => onPick(e.currentTarget.value)} className="w-full">
        <NativeSelectOption value="" disabled>
          Pick your ad
        </NativeSelectOption>
        {choices.map((c) => (
          <NativeSelectOption key={c.value} value={c.value}>
            {c.label}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value="other">Other</NativeSelectOption>
      </NativeSelect>
      {pick === "other" ? <Input aria-label="The ad's name" placeholder="The name in Ads Manager, e.g. Reel 1" maxLength={80} value={other} onChange={(e) => setOther(e.currentTarget.value)} autoFocus /> : null}
      <input type="hidden" name="adName" value={pick === "other" ? other : pick} />
    </div>
  );
}
