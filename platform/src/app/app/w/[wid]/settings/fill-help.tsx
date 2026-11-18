"use client";

import { useRef, useState } from "react";
import { ClipboardPasteIcon } from "lucide-react";
import { cleanPixelId } from "@/lib/pixel";
import { skoolAboutLink } from "@/lib/skoolLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The Skool group link box, with a Paste button. A skool.com group link becomes its About page
 * (https://www.skool.com/<group>/about), the address every Join button and Skool-link ad uses.
 */
export function SkoolLinkInput({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [note, setNote] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const paste = async () => {
    setNote("");
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setNote("Nothing is copied yet. Copy your group's address in Skool first.");
        return;
      }
      setValue(skoolAboutLink(text));
    } catch {
      // Some browsers block reading the clipboard: the box takes a normal paste instead.
      setNote("Your browser didn't let us paste. Click in the box and press Ctrl+V (or ⌘V on a Mac).");
      ref.current?.focus();
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          ref={ref}
          id="skoolUrl"
          name="skoolUrl"
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setValue((v) => skoolAboutLink(v))}
          placeholder="https://www.skool.com/your-group/about"
          className="h-12 min-w-0 flex-1 rounded-xl px-4 text-[15px]"
        />
        <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={paste}>
          <ClipboardPasteIcon data-icon="inline-start" /> Paste
        </Button>
      </div>
      {note ? <p className="text-[13px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** The Pixel ID box. Says plainly what's wrong as soon as they type, and stops Save until it's a real ID. */
export function PixelIdInput({ defaultValue }: { defaultValue: string }) {
  const [error, setError] = useState("");
  const check = (el: HTMLInputElement) => {
    const res = cleanPixelId(el.value);
    const msg = res.ok ? "" : res.error;
    el.setCustomValidity(msg);
    setError(msg);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Input
        id="metaPixelId"
        name="metaPixelId"
        defaultValue={defaultValue}
        placeholder="123456789012345"
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "metaPixelId-error" : undefined}
        className="@2xl/main:max-w-sm"
        onChange={(e) => check(e.currentTarget)}
        onBlur={(e) => check(e.currentTarget)}
        onInvalid={(e) => check(e.currentTarget)}
      />
      {error ? (
        <p id="metaPixelId-error" role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
