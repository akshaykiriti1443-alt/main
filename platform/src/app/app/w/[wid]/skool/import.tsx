"use client";

import { useRef, useState } from "react";
import { FileCheck2Icon, UploadIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

// Lets the owner either drop in their Skool export file or paste the list. The file is read in the
// browser into the textarea, so the plain server action still receives one text field.
export function SkoolImport() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  const rows = text.trim() ? text.trim().split(/\r?\n/).length : 0;

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "group flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-foreground/15 bg-muted/40 px-4 py-7 text-center transition-colors hover:border-primary/50 hover:bg-accent/50",
          over && "border-primary bg-accent",
          fileName && "border-success/50 border-solid bg-success-soft/50",
        )}
      >
        <span className={cn("grid size-11 place-items-center rounded-xl bg-card text-primary shadow-card ring-1 ring-foreground/[0.06]", fileName && "text-success")}>
          {fileName ? <FileCheck2Icon className="size-5" aria-hidden /> : <UploadIcon className="size-5" aria-hidden />}
        </span>
        {fileName ? (
          <>
            <span className="font-semibold">{fileName}</span>
            <span className="text-sm text-muted-foreground">
              {rows.toLocaleString()} line{rows === 1 ? "" : "s"} ready. Click to pick a different file.
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold">Upload your Skool export (.csv)</span>
            <span className="text-sm text-muted-foreground">Click to choose it, or drop the file right here.</span>
          </>
        )}
      </button>
      <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or paste the list <span className="h-px flex-1 bg-border" />
      </div>
      <Textarea
        name="members"
        value={text}
        onChange={(e) => setText(e.target.value)}
        required
        rows={4}
        className="max-h-64 font-mono text-xs"
        placeholder={"email,name,status\njane@example.com,Jane Doe,active\nsam@example.com,Sam Lee,trial\n\n…or just one email per line."}
        aria-label="Member list"
      />
    </div>
  );
}
