"use client";

import { useActionState, useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { rosterAction, type RosterState } from "@/actions/admin";
import { compactRoster } from "@/lib/roster";
import { Callout } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Two steps on purpose: preview who gets added and removed, then apply. A filtered or broken
// export can't silently pause everyone.
export function RosterUpload() {
  const [state, action, pending] = useActionState<RosterState, FormData>(rosterAction, {});
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const p = state.ok ? undefined : state.preview;

  // A big Skool export (answers, dates…) can pass the 2 MB upload limit. Only names and emails
  // matter, so send just those; the server reads the result exactly like the full file.
  function submit(fd: FormData) {
    const raw = String(fd.get("members") ?? "");
    if (raw.length > 500_000) fd.set("members", compactRoster(raw));
    return action(fd);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <UploadIcon data-icon="inline-start" />
          Upload Skool export (.csv)
        </Button>
        <span className="text-sm text-muted-foreground">{fileName || "or paste below"}</span>
      </div>
      <Textarea
        name="members"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="font-mono text-xs"
        aria-label="Member export"
        placeholder={"First Name,Last Name,Email,Answer 1\nJane,Doe,jane@example.com,jane.app@example.com"}
      />

      {state.error ? <Callout tone="error">{state.error}</Callout> : null}
      {state.ok ? <Callout tone="ok">{state.ok}</Callout> : null}
      {p ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <span>
            <b>{p.emails}</b> member emails in {p.rows} rows{p.skipped ? ` (${p.skipped} rows had no email)` : ""}.
          </span>
          <span>
            <b className="text-success">{p.added.length}</b> new · <b>{p.stillActive}</b> already members · <b className="text-destructive">{p.removed.length}</b> no longer in Skool
          </span>
          {p.removed.length ? (
            <details>
              <summary className="cursor-pointer text-muted-foreground">Who gets removed</summary>
              <p className="mt-1 break-words font-mono text-xs">
                {p.removed.slice(0, 200).join(", ")}
                {p.removed.length > 200 ? "…" : ""}
              </p>
            </details>
          ) : null}
          {p.largeDrop ? (
            <Label className="flex items-start gap-2 text-warning">
              <input type="checkbox" name="confirmLargeDrop" className="mt-1" />
              That is a big drop. I checked this is the full, unfiltered export.
            </Label>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="apply" value="0" variant={p ? "outline" : "default"} disabled={pending || !text.trim()}>
          {pending ? "Working…" : "Preview"}
        </Button>
        {p ? (
          <Button type="submit" name="apply" value="1" disabled={pending}>
            Apply: {p.added.length} in, {p.removed.length} out
          </Button>
        ) : null}
      </div>
    </form>
  );
}
