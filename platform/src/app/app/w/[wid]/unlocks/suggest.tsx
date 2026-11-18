"use client";

import { useRef, useState, useTransition } from "react";
import { SparklesIcon } from "lucide-react";
import { suggestUnlockAction } from "@/actions/unlocks";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * "Suggest an unlock": asks the member's AI for an idea and fills the create form's boxes with it.
 * Nothing is saved until they press Create unlock. The reward link is left as it is.
 */
export function SuggestUnlockButton({ wid }: { wid: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "note" | "error"; text: string } | null>(null);

  const fill = (form: HTMLFormElement, name: string, value: string) => {
    const el = form.elements.namedItem(name);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const press = () =>
    start(async () => {
      setMsg(null);
      const res = await suggestUnlockAction(wid);
      if (!res.ok) {
        setMsg({ tone: "error", text: res.error });
        return;
      }
      const form = ref.current?.closest("form");
      if (form) {
        fill(form, "title", res.suggestion.title);
        fill(form, "reward", res.suggestion.reward);
        fill(form, "action", res.suggestion.action);
        fill(form, "instructions", res.suggestion.instructions);
      }
      setMsg(
        res.note
          ? { tone: "note", text: `${res.note} Change any word, then press Create unlock.` }
          : { tone: "ok", text: "Filled in by your AI. Change any word, then press Create unlock." },
      );
    });

  return (
    <div ref={ref} className="flex flex-col gap-1.5">
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={press} disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
        {pending ? "Thinking…" : "Suggest an unlock"}
      </Button>
      {msg ? (
        <p aria-live="polite" className={msg.tone === "error" ? "text-[13px] text-destructive" : msg.tone === "note" ? "text-[13px] text-warning" : "text-[13px] text-success"}>
          {msg.text}
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">Stuck for an idea? AI suggests one from your business. Nothing is saved until you press Create unlock.</p>
      )}
    </div>
  );
}
