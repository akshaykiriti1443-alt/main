"use client";

import { useActionState, useState } from "react";
import { LightbulbIcon, SparklesIcon } from "lucide-react";
import type { AutomationAiState } from "@/actions/automationAi";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/** "Tell your AI what to automate": plain words in, a drafted automation out (opened in the builder). */
export function AutomationAiBox({
  action,
  suggestions = [],
  placeholder,
  cta,
  pendingText,
  aiNote,
  compact,
}: {
  action: (prev: AutomationAiState, fd: FormData) => Promise<AutomationAiState>;
  suggestions?: { label: string; request: string }[];
  placeholder: string;
  cta: string;
  pendingText: string;
  aiNote?: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [text, setText] = useState("");
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Textarea
        name="request"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={compact ? 2 : 3}
        maxLength={1500}
        minLength={8}
        required
        placeholder={placeholder}
        aria-label="What should your automation do?"
        className={cn("rounded-xl bg-card px-3.5 py-3 text-[15px] leading-relaxed shadow-xs md:text-[15px]", compact ? "min-h-16" : "min-h-24")}
      />
      {suggestions.length ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Ideas from your numbers">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <LightbulbIcon className="size-3.5 text-gold-foreground" aria-hidden /> Ideas from your numbers:
          </span>
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setText(s.request)}
              aria-pressed={text === s.request}
              className={cn(
                "rounded-full border bg-card px-3 py-1 text-xs font-medium shadow-xs transition-colors hover:border-primary/50 hover:text-primary",
                text === s.request && "border-primary bg-accent text-accent-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      {state?.error ? (
        <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {aiNote ? <span className="max-w-[52ch] text-xs text-muted-foreground">{aiNote}</span> : <span />}
        <Button type="submit" size={compact ? "default" : "lg"} disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
          {pending ? pendingText : cta}
        </Button>
      </div>
    </form>
  );
}
