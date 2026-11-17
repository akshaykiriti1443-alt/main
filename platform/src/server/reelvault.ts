// Server only. ReelVault's findings for one member (the hooks and formats that beat normal views for their
// competitors), read from GET REELVAULT_URL/api/onex/v1/findings with a signed request. Never runs in a browser.
import { z } from "zod";
import { env } from "@/lib/env";
import { FINDINGS_PATH, findingsEmail, reelVaultConfigured, signFindingsRequest } from "@/lib/reelvault";

const clip = (max: number) => z.string().transform((s) => s.slice(0, max));
const optClip = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((s) => (s ? s.slice(0, max) : null));

const hookSchema = z.object({
  id: z.string().regex(/^[a-z]{2,5}_[a-z2-7]{16}$/),
  text: clip(300).refine((s) => s.trim().length > 0),
  on_screen_text: optClip(200).transform((s) => s ?? ""),
  hook_type: optClip(40),
  hook_label: optClip(40),
  formula: optClip(200),
  why: optClip(300),
  handle: clip(60).transform((s) => s.replace(/^@+/, "")),
  score: z.number().finite().min(0).max(1000),
  level: z.enum(["deep", "quick"]).catch("quick"),
  reel_url: z
    .string()
    .nullable()
    .optional()
    .transform((u) => (u && u.startsWith("https://www.instagram.com/") && u.length <= 300 ? u : null)),
});

const formatSchema = z.object({
  id: z.string().max(40),
  name: clip(120),
  visual_format: optClip(20),
  visual_format_label: optClip(60),
  line: clip(200).catch(""),
  lift: z.number().finite().min(0).max(1000),
  evidence: z.enum(["strong", "promising", "thin"]).catch("thin"),
  can_make: z.boolean().catch(false),
  reels: z.number().int().min(0).catch(0),
  competitors: z.number().int().min(0).catch(0),
});

const findingsSchema = z.object({
  v: z.literal(1),
  status: z.enum(["ready", "empty", "no_account", "off"]),
  email: z.string(),
  computed_at: z.string().max(40).nullable().optional(),
  competitors: z.number().int().min(0).catch(0),
  hooks: z.array(z.unknown()).catch([]),
  formats: z.array(z.unknown()).catch([]),
});

export type RvHook = z.infer<typeof hookSchema>;
export type RvFormat = z.infer<typeof formatSchema>;
export type RvFindings = {
  status: "ready" | "empty" | "no_account" | "off" | "unavailable";
  computedAt: string | null;
  competitors: number;
  hooks: RvHook[];
  formats: RvFormat[];
};

const UNAVAILABLE: RvFindings = { status: "unavailable", computedAt: null, competitors: 0, hooks: [], formats: [] };

/** Pure: ReelVault's JSON for `email` -> findings. A bad row is dropped; a bad body or someone else's email is "unavailable". */
export function parseFindings(json: unknown, email: string): RvFindings {
  const top = findingsSchema.safeParse(json);
  if (!top.success || top.data.email.trim().toLowerCase() !== email) return { ...UNAVAILABLE };
  const d = top.data;
  if (d.status === "no_account" || d.status === "off") return { status: d.status, computedAt: null, competitors: 0, hooks: [], formats: [] };
  const hooks = d.hooks
    .map((h) => hookSchema.safeParse(h))
    .flatMap((r) => (r.success ? [r.data] : []))
    .slice(0, 12);
  const formats = d.formats
    .map((f) => formatSchema.safeParse(f))
    .flatMap((r) => (r.success ? [r.data] : []))
    .slice(0, 6);
  return {
    status: hooks.length || formats.length ? "ready" : "empty",
    computedAt: d.computed_at ?? null,
    competitors: d.competitors,
    hooks,
    formats,
  };
}

/** Who the findings are for: the signed-in OneX user. Only a confirmed email is ever vouched for. */
export type RvViewer = { id: string; email: string };

/**
 * The member's findings, or status "unavailable" when ReelVault isn't set up, the email isn't confirmed,
 * ReelVault can't be reached in 3.5 s, or it answers with anything but a good 200. It never throws, so a
 * page can always await it. Like the sign-in ticket, the signed request vouches for the email, so an
 * unconfirmed address (a teammate or agency invite that hasn't been confirmed) never gets anyone's data.
 */
export async function reelVaultFindings(user: RvViewer): Promise<RvFindings> {
  try {
    const e = findingsEmail(user.email);
    if (!e || !reelVaultConfigured()) return { ...UNAVAILABLE };
    const { isEmailVerified } = await import("@/server/emailVerify");
    if (!(await isEmailVerified(user.id))) return { ...UNAVAILABLE };
    const res = await fetch(`${env.reelVaultUrl}${FINDINGS_PATH}`, {
      method: "GET",
      headers: { ...signFindingsRequest(e), Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(3500),
    });
    if (res.status !== 200) return { ...UNAVAILABLE };
    return parseFindings(await res.json(), e);
  } catch {
    return { ...UNAVAILABLE };
  }
}

/**
 * Can this OneX host frame ReelVault? The frame's session cookie only works when both are the same site:
 * - the app's own host (APP_URL), whose ReelVault is a sibling subdomain in production;
 * - in development, localhost (or 127.0.0.1) when REELVAULT_URL uses that same name.
 * "dev-mismatch": localhost vs 127.0.0.1 (cross-site, the cookie would be dropped).
 * "elsewhere": an agency's white-label host, which gets an "Open ReelVault" button instead.
 */
export function embedHostState(host: string, o: { appUrl: string; reelVaultUrl: string; isProd: boolean }): { kind: "ok" } | { kind: "dev-mismatch"; reelVaultHostname: string; port: string } | { kind: "elsewhere" } {
  const h = host.trim().toLowerCase();
  let hostname = "";
  let port = "";
  try {
    const u = new URL(`http://${h}`);
    hostname = u.hostname;
    port = u.port;
  } catch {
    return { kind: "elsewhere" };
  }
  let rvHost = "";
  try {
    rvHost = new URL(o.reelVaultUrl).hostname;
  } catch {
    return { kind: "elsewhere" };
  }
  const local = (n: string) => n === "localhost" || n === "127.0.0.1";
  // Same site: the same local name, or the same last two labels (app. and reelvault.scaleitads.com).
  const site = (n: string) => (local(n) ? n : n.split(".").slice(-2).join("."));
  try {
    if (h && h === new URL(o.appUrl).host.toLowerCase() && site(hostname) === site(rvHost)) return { kind: "ok" };
  } catch {
    // A broken APP_URL never matches.
  }
  if (!o.isProd && local(hostname)) {
    if (hostname === rvHost) return { kind: "ok" };
    // A hosted ReelVault seen from a laptop is cross-site whatever the name: the new-tab button still works.
    if (local(rvHost)) return { kind: "dev-mismatch", reelVaultHostname: rvHost, port };
  }
  return { kind: "elsewhere" };
}

/** Hook ids as Ad studio's form sends them (name="rvHook"): ReelVault reel ids only, at most 5. */
export function pickedHookIds(values: FormDataEntryValue[]): string[] {
  const ids = values.filter((v): v is string => typeof v === "string" && /^[a-z]{2,5}_[a-z2-7]{16}$/.test(v));
  return [...new Set(ids)].slice(0, 5);
}

export type ProvenHook = { text: string; handle: string; score: number; hookType: string };

/**
 * For Ad studio's action: the hooks the member ticked, re-read from ReelVault (never trusted from the form).
 * Returns [] when nothing was ticked or ReelVault is unavailable.
 */
export async function provenHooksFromForm(fd: FormData, user: RvViewer): Promise<ProvenHook[]> {
  const ids = pickedHookIds(fd.getAll("rvHook"));
  if (!ids.length) return [];
  const findings = await reelVaultFindings(user);
  if (findings.status !== "ready") return [];
  return ids
    .map((id) => findings.hooks.find((h) => h.id === id))
    .filter((h): h is RvHook => Boolean(h))
    .map((h) => ({ text: h.text.slice(0, 300), handle: h.handle.slice(0, 60), score: Math.min(1000, Math.max(0, h.score)), hookType: (h.hook_label ?? "").slice(0, 40) }));
}

// ---- Who may get a ReelVault ticket (the frame's /api/reelvault/open) ----

const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;

/** The same gates as requireWorkspace, as a yes or no: never paused, never before the entry ticket. Pure. */
export function workspaceGateOpen(o: {
  effectiveStatus: string;
  viewAs: string | null;
  isPlatformAdmin: boolean;
  accessSource: string;
  entryPending: boolean;
}): boolean {
  if (o.effectiveStatus === "paused") return false;
  if (o.viewAs === "entry") return false;
  if (!o.isPlatformAdmin && o.accessSource === "member" && o.entryPending) return false;
  return true;
}

/**
 * May this signed-in user get a ReelVault ticket right now? The layout's requireWorkspace only guards the
 * OneX page; the frame loads /api/reelvault/open directly, so the route asks again here. It never redirects
 * (a redirect would draw /paused inside the frame): it answers yes or no.
 * - With a workspace id: that workspace must be one the user may open, not paused and past the entry ticket.
 * - Without one (the old new-tab link): a platform admin, or at least one of the user's own workspaces passes.
 */
export async function reelVaultAccessOk(user: { id: string; isPlatformAdmin: boolean }, workspaceId: string | null): Promise<boolean> {
  try {
    const tenancy = await import("@/server/tenancy");
    const unlocks = await import("@/server/unlocks");
    let ticket: Awaited<ReturnType<typeof unlocks.getEntryTicket>> | undefined;
    const pending = async (ws: Parameters<typeof unlocks.entryTicketPending>[1], accessSource: string) => {
      if (user.isPlatformAdmin || accessSource !== "member") return false;
      if (ticket === undefined) ticket = await unlocks.getEntryTicket();
      return unlocks.entryTicketPending(ticket, ws);
    };
    if (workspaceId !== null) {
      if (!WORKSPACE_ID_RE.test(workspaceId)) return false;
      // getWorkspaceContext throws (notFound) for a workspace this user can't open: that's a no.
      const ctx = await tenancy.getWorkspaceContext(workspaceId);
      if (ctx.user.id !== user.id) return false;
      return workspaceGateOpen({
        effectiveStatus: ctx.effectiveStatus,
        viewAs: ctx.viewAs,
        isPlatformAdmin: ctx.user.isPlatformAdmin,
        accessSource: ctx.workspace.accessSource,
        entryPending: await pending(ctx.workspace, ctx.workspace.accessSource),
      });
    }
    if (user.isPlatformAdmin) return true;
    for (const row of await tenancy.listUserWorkspaces(user.id)) {
      const effectiveStatus = row.agency.status === "paused" ? "paused" : row.workspace.status;
      if (effectiveStatus === "paused") continue;
      if (await pending(row.workspace, row.workspace.accessSource)) continue;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Is the viewer one of this workspace's own members (not a platform admin or agency staff looking in)? */
export async function viewerIsWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  try {
    const { listUserWorkspaces } = await import("@/server/tenancy");
    return (await listUserWorkspaces(userId)).some((r) => r.workspace.id === workspaceId);
  } catch {
    return false;
  }
}
