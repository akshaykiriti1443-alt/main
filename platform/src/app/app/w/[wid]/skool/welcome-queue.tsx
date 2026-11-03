import { CheckIcon, HandIcon } from "lucide-react";
import { markWelcomedAction } from "@/actions/skoolHobby";
import { relativeTime } from "@/lib/util";
import { Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { SkoolAssist } from "@/components/skool-assist";
import type { welcomeQueue } from "@/server/skoolHobby";

type Row = Awaited<ReturnType<typeof welcomeQueue>>[number];

/** Skool Pro's "Auto DM new members", the Hobby way: AI writes each hello, you send it in Skool. */
export function WelcomeQueue({ wid, rows, skoolUrl }: { wid: string; rows: Row[]; skoolUrl?: string }) {
  return (
    <Panel
      id="welcome-queue"
      icon={HandIcon}
      tone="gold"
      className="scroll-mt-24"
      title={
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          Today&apos;s hellos <Badge variant="secondary">instead of Auto DM</Badge>
        </span>
      }
      sub="Everyone new from your recent syncs who hasn't had a hello yet. Your AI writes each one from their membership answers. Copy it, paste it into their Skool DMs, tick it off. Ten seconds each, and it sounds like you, not a bot."
    >
      <ul className="-my-1 flex flex-col divide-y">
        {rows.map((r) => {
          const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "New member";
          return (
            <li key={r.id} className="py-2.5">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-1 py-1 hover:bg-muted/60">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-soft text-xs font-bold text-gold-foreground">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {r.stage === "trial" ? "On trial" : "Paying"} · joined {relativeTime(r.createdAt)}
                      {r.answers[0]?.a ? ` · “${r.answers[0].a.slice(0, 60)}”` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-primary group-open:hidden">Write my hello</span>
                </summary>
                <div className="mt-3 flex flex-col gap-3 sm:pl-11">
                  {r.answers.length ? (
                    <dl className="grid gap-1.5 rounded-xl bg-muted/50 p-3 text-sm">
                      {r.answers.slice(0, 4).map((x) => (
                        <div key={x.q}>
                          <dt className="text-xs text-muted-foreground">{x.q}</dt>
                          <dd>{x.a}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <SkoolAssist wid={wid} contactId={r.id} defaultIntent="welcome" skoolUrl={skoolUrl} />
                  <form action={markWelcomedAction.bind(null, wid, r.id)}>
                    <SubmitButton size="sm" variant="outline" pendingText="Ticking…">
                      <CheckIcon data-icon="inline-start" /> Sent it in Skool
                    </SubmitButton>
                  </form>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
