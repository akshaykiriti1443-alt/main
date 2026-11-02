"use client";

import { useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Lets the owner either drop in their Skool export file or paste the list. The file is read in the
// browser into the textarea, so the plain server action still receives one text field.
export function SkoolImport() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <UploadIcon data-icon="inline-start" />
          Upload Skool export (.csv)
        </Button>
        {fileName ? <span className="text-sm text-muted-foreground">{fileName}</span> : <span className="text-sm text-muted-foreground">or paste below</span>}
      </div>
      <Textarea
        name="members"
        value={text}
        onChange={(e) => setText(e.target.value)}
        required
        rows={8}
        className="font-mono text-xs"
        placeholder={"email,name,status\njane@example.com,Jane Doe,active\nsam@example.com,Sam Lee,trial\n\n…or just one email per line."}
        aria-label="Member list"
      />
    </div>
  );
}
