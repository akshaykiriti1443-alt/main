"use client";

import { useState, useTransition } from "react";
import { ExternalLinkIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Callout } from "@/components/ui";
import { draftSkoolMessageAction, type SkoolDraftResult } from "@/actions/skool";

const INTENTS = [
  { value: "welcome", label: "Welcome" },
  { value: "convert", label: "Convert trial" },
  { value: "save", label: "Save" },
  { value: "winback", label: "Win back" },
] as const;

export function SkoolAssist({ wid, contactId, defaultIntent, skoolUrl }: { wid: string; contactId: string; defaultIntent: string; skoolUrl?: string }) {
  const [intent, setIntent] = useState(defaultIntent);
  const [result, setResult] = useState<SkoolDraftResult | null>(null);
  const [pending, start] = useTransition();

  const draft = (which: string) => {
    setIntent(which);
    start(async () => setResult(await draftSkoolMessageAction(wid, contactId, which)));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {INTENTS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setIntent(o.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
              intent === o.value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <Button type="button" onClick={() => draft(intent)} disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
        {pending ? "Writing…" : result ? "Rewrite" : "Draft a message"}
      </Button>

      {result?.ok ? (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border bg-muted/50 p-3 text-sm whitespace-pre-wrap">{result.text}</div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={result.text} label="Copy message" />
            {skoolUrl ? (
              <Button variant="outline" size="sm" asChild>
                <a href={skoolUrl} target="_blank" rel="noopener noreferrer">
                  Open Skool <ExternalLinkIcon data-icon="inline-end" />
                </a>
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">AI wrote this draft. You send it yourself in Skool, so no account is ever at risk. Make it yours before sending.</p>
        </div>
      ) : result && !result.ok ? (
        <Callout tone="error">{result.error}</Callout>
      ) : null}
    </div>
  );
}
