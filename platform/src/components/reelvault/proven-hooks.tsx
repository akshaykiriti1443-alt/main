import Link from "next/link";
import { ClapperboardIcon, LayersIcon } from "lucide-react";
import { reelVaultFindings, viewerIsWorkspaceMember, type RvFindings, type RvHook, type RvViewer } from "@/server/reelvault";
import { MoreOptions } from "@/components/ui";
import { CopyButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";

const HOOKS_SHOWN = 8;
const CHECKED_BY_DEFAULT = 2;

const times = (n: number) => `${Number(n.toFixed(1))}x`;

/** Shown when the viewer isn't this workspace's member (a platform admin, agency staff, or "View as"). */
export const NOT_THIS_MEMBERS = "This is your own ReelVault, not this member's.";

/**
 * The Ad studio block as an async server component: it fetches the viewer's findings itself, so the page
 * can wrap it in <Suspense fallback={null}> and stream the rest at once when ReelVault is slow.
 * The findings are always the signed-in viewer's own (never signed as the workspace's member).
 */
export async function ReelVaultProvenHooks({ user, workspaceId, base, viewAs = null }: { user: RvViewer; workspaceId: string; base: string; viewAs?: string | null }) {
  const [findings, member] = await Promise.all([reelVaultFindings(user), viewAs ? Promise.resolve(false) : viewerIsWorkspaceMember(workspaceId, user.id)]);
  return <ProvenHooks findings={findings} base={base} note={member ? undefined : NOT_THIS_MEMBERS} />;
}

/**
 * "Proven hooks from ReelVault": the opening lines that beat normal views on the member's competitors'
 * reels, ready to place inside Ad studio's form. Each hook is a checkbox (name="rvHook", value = its id)
 * with a Copy button; the action re-reads the ticked ones from ReelVault, so nothing here is trusted.
 * Pass `pickable={false}` to show the list without checkboxes (anywhere outside a form).
 * Renders nothing when ReelVault is off or can't be reached.
 */
export function ProvenHooks({ findings, base, pickable = true, defaultOpen, note }: { findings: RvFindings; base: string; pickable?: boolean; defaultOpen?: boolean; note?: string }) {
  if (findings.status === "off" || findings.status === "unavailable") return null;
  const hooks = findings.hooks.slice(0, HOOKS_SHOWN);
  const preChecked = new Set(
    hooks
      .filter((h) => h.level === "deep")
      .slice(0, CHECKED_BY_DEFAULT)
      .map((h) => h.id),
  );
  const ready = findings.status === "ready" && (hooks.length > 0 || findings.formats.length > 0);

  return (
    <MoreOptions
      icon={ClapperboardIcon}
      title="Proven hooks from ReelVault (optional)"
      sub="Hooks that beat normal views for your competitors' reels. We borrow the pattern, never the words."
      defaultOpen={defaultOpen}
    >
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      {ready ? (
        <>
          {hooks.length ? (
            <fieldset className="flex flex-col gap-2.5">
              <legend className="mb-2 text-[13.5px] font-medium">{pickable ? "Tick the ones to borrow from" : "Your competitors' best openings"}</legend>
              <ul className="grid gap-2">
                {hooks.map((h) => (
                  <HookRow key={h.id} h={h} pickable={pickable} checked={preChecked.has(h.id)} />
                ))}
              </ul>
            </fieldset>
          ) : null}
          {findings.formats.length ? (
            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-2 text-[13.5px] font-medium">
                <LayersIcon className="size-4 text-primary dark:text-violet-300" aria-hidden />
                Formats that work for them
              </span>
              <ul className="grid gap-1.5 text-sm">
                {findings.formats.map((f) => (
                  <li key={f.id} className="flex items-baseline gap-2.5">
                    <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-success-soft px-2.5 text-[11.5px] font-semibold text-success tabular-nums">{times(f.lift)}</span>
                    <span className="min-w-0">
                      <span className="font-medium">{f.name}</span>
                      {f.visual_format_label ? <span className="text-muted-foreground"> · {f.visual_format_label}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-sm">
            <Link href={`${base}/reelvault/banks/hooks`}>See all in ReelVault</Link>
          </p>
        </>
      ) : findings.status === "empty" && findings.competitors > 0 ? (
        <p className="text-sm text-muted-foreground">ReelVault is still studying your competitors&apos; reels. Check back after the first pull.</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          <Link href={`${base}/reelvault/competitors`}>Add 1 to 3 accounts in your niche in ReelVault</Link> and their best hooks show up here.
        </p>
      )}
    </MoreOptions>
  );
}

function HookRow({ h, pickable, checked }: { h: RvHook; pickable: boolean; checked: boolean }) {
  const body = (
    <span className="grid min-w-0 flex-1 gap-1">
      <span className="leading-relaxed text-foreground">“{h.text}”</span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {h.hook_label ? <Badge variant="soft">{h.hook_label}</Badge> : null}
        <span className="tabular-nums">
          @{h.handle} · {times(h.score)} normal views
        </span>
      </span>
    </span>
  );
  return (
    <li className="flex items-start gap-2 rounded-xl bg-background/60 p-3 text-sm ring-1 ring-ink/[0.06] ring-inset has-checked:bg-accent has-checked:ring-violet-200 dark:bg-white/[0.02] dark:ring-white/[0.07] dark:has-checked:bg-accent dark:has-checked:ring-violet-400/40">
      {pickable ? (
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
          <input type="checkbox" name="rvHook" value={h.id} defaultChecked={checked} className="mt-1 size-4 shrink-0" />
          {body}
        </label>
      ) : (
        body
      )}
      <CopyButton text={h.text} className="h-7 shrink-0 px-2.5 text-xs" />
    </li>
  );
}
