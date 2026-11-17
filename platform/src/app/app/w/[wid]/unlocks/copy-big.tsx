"use client";

import { useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The one big Copy on a screen: the thing to paste into Skool or a text. The small CopyButton is for the rest. */
export function BigCopyButton({ text, label, copied = "Copied. Now paste it", variant = "cta", className }: { text: string; label: ReactNode; copied?: string; variant?: "cta" | "default" | "outline"; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size="lg"
      className={className}
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 2500);
          })
          .catch(() => setDone(false));
      }}
    >
      {done ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
      <span aria-live="polite">{done ? copied : label}</span>
    </Button>
  );
}
