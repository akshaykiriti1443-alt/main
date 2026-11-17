import type { ReactNode } from "react";
import { ClapperboardIcon } from "lucide-react";
import { Panel } from "@/components/ui";

/** A calm OneX card for when ReelVault can't open here yet: one title, one sentence, at most one button. */
export function ReelVaultNotice({ title, body, adminNote, action }: { title: string; body: ReactNode; adminNote?: ReactNode; action?: ReactNode }) {
  return (
    <Panel icon={ClapperboardIcon} title={title} sub={body}>
      {adminNote ? <p className="rounded-xl bg-muted/60 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">{adminNote}</p> : null}
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </Panel>
  );
}
