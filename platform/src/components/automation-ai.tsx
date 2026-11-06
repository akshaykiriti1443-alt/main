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
  ctaVariant = "default",
}: {
  action: (prev: AutomationAiState, fd: FormData) => Promise<AutomationAiState>;
  suggestions?: { label: string; request: string }[];
  placeholder: string;
  cta: string;
  pendingText: string;
  aiNote?: string;
  compact?: boolean;
  /** "cta" when building it is the one thing to do on the page. */
  ctaVariant?: "cta" | "default";
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
        className={cn("rounded-xl bg-card px-4 py-3.5 text-[15px] leading-relaxed shadow-xs md:text-[15px]", compact ? "min-h-16" : "min-h-28")}
      />
      {suggestions.length ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Ideas from your numbers">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <LightbulbIcon className="size-3.5 text-gold-foreground" aria-hidden /> Ideas from your numbers
          </span>
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setText(s.request)}
              aria-pressed={text === s.request}
              className={cn(
                "h-8 rounded-full border border-border-strong bg-card px-3.5 text-[12.5px] font-medium shadow-xs transition-colors duration-150 ease-swift hover:border-violet-200 hover:bg-accent/60 hover:text-accent-foreground dark:bg-white/[0.03] dark:hover:border-white/20",
                text === s.request && "border-violet-300 bg-accent text-accent-foreground dark:border-violet-400/40 dark:bg-accent",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      {state?.error ? (
        <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {aiNote ? <span className="max-w-[52ch] text-xs leading-relaxed text-muted-foreground">{aiNote}</span> : <span />}
        <Button type="submit" variant={ctaVariant} size={compact ? "default" : "lg"} disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
          {pending ? pendingText : cta}
        </Button>
      </div>
    </form>
  );
}
