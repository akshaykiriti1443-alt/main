"use client";

import { useRef, useState, useTransition } from "react";
import { SparklesIcon } from "lucide-react";
import type { KitSuggestField } from "@/server/ai/kitSuggest";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { suggestKitAnswerAction } from "./actions";

/**
 * "Suggest" under a launch kit box: AI offers 2 or 3 answers from the niche (and what the member
 * already typed); clicking one fills the box. Nothing is saved until they build the kit.
 */
export function SuggestAnswers({ wid, field, what }: { wid: string; field: KitSuggestField; what: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [options, setOptions] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: "note" | "error"; text: string } | null>(null);

  const form = () => ref.current?.closest("form") ?? null;
  const read = (f: HTMLFormElement, name: string) => String(new FormData(f).get(name) ?? "");

  const press = () =>
    start(async () => {
      setMsg(null);
      const f = form();
      const res = await suggestKitAnswerAction(wid, {
        field,
        businessName: f ? read(f, "businessName") : "",
        niche: f ? read(f, "niche") : "",
        audience: f ? read(f, "audience") : "",
        outcome: f ? read(f, "outcome") : "",
        leadMagnetFramework: f ? (read(f, "leadMagnetFramework") as "domino" | "wide") : undefined,
      });
      if (!res.ok) {
        setOptions([]);
        setMsg({ tone: "error", text: res.error });
        return;
      }
      setOptions(res.options);
      setMsg(res.note ? { tone: "note", text: res.note } : null);
    });

  const pick = (value: string) => {
    const el = form()?.elements.namedItem(field);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.focus();
    }
  };

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant="outline" size="sm" onClick={press} disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
          {pending ? "Thinking…" : options.length ? "Suggest more" : "Suggest"}
        </Button>
        {!options.length && !msg ? <span className="text-[13px] text-muted-foreground">Stuck? AI suggests {what} from what you help with.</span> : null}
      </div>
      {options.length ? (
        <ul className="flex flex-col gap-1.5" aria-label="Suggestions">
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                onClick={() => pick(o)}
                className="w-full rounded-lg bg-background px-3 py-2 text-left text-[13.5px] leading-snug ring-1 ring-border transition-colors ring-inset hover:bg-accent hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {options.length ? <p className="text-[12.5px] text-muted-foreground">Click one to put it in the box. You can change any word.</p> : null}
      {msg ? (
        <p aria-live="polite" className={msg.tone === "error" ? "text-[13px] text-destructive" : "text-[13px] text-warning"}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
