import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { listSites } from "@/server/sites";
import { runLaunchKit } from "@/server/ai/launchKit";
import { aiRunsFor } from "@/app/app/w/[wid]/ai/runs";
import { buildLaunchKitAction, buildStarterKitAction } from "@/app/app/w/[wid]/launch/actions";
import { makeWorkspace } from "./helpers";

// The action and the page run as the signed-in member; the AI call always breaks, like a cut-off reply on a free key.
const who = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock("@/server/tenancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tenancy")>()),
  requireWorkspace: async () => who.ctx,
}));
vi.mock("@/server/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/client")>()),
  generateStructured: async () => {
    throw new Error("The reply was cut off.");
  },
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw Object.assign(new Error("redirect"), { url });
  },
}));
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: () => {},
}));

const aiWas = env.aiEnabled;
afterEach(() => {
  env.aiEnabled = aiWas;
});

const ANSWERS = { businessName: "Fit Dads Club", ownerName: "Sam", niche: "fat loss for dads", audience: "busy dads", outcome: "lose 10 lbs", leadMagnetIdea: "Dad Reset", price: "$29", trialDays: "7", skoolUrl: "", tone: "friendly", brandColor: "#2A44EE" };

async function signIn() {
  const made = await makeWorkspace();
  const db = await getDb();
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, made.ws.id));
  who.ctx = { workspace, user: { ...made.user, isPlatformAdmin: false }, role: "owner" };
  return made;
}

/** Where the action sent the member, as the page's search params. */
async function press(action: (wid: string, fd: FormData) => Promise<void>, wid: string) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(ANSWERS)) fd.set(k, v);
  try {
    await action(wid, fd);
  } catch (err) {
    const url = (err as { url?: string }).url;
    if (!url) throw err;
    const u = new URL(url, "http://x");
    return { path: u.pathname, sp: Object.fromEntries(u.searchParams) };
  }
  throw new Error("expected a redirect");
}

type PageFn = (p: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) => Promise<unknown>;
async function markup(wid: string, sp: Record<string, string>) {
  const page = (await import("@/app/app/w/[wid]/launch/page")).default as PageFn;
  return renderToStaticMarkup((await page({ params: Promise.resolve({ wid }), searchParams: Promise.resolve(sp) })) as React.ReactElement);
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");
/** The form's buttons in order, as `type:label` (disabled ones marked). */
const buttons = (html: string) =>
  [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)]
    .filter(([, attrs]) => !/ aria-expanded="/.test(attrs))
    .map(([, attrs, inner]) => `${/type="(\w+)"/.exec(attrs)?.[1]}${/ disabled=""/.test(attrs) ? "(disabled)" : ""}:${text(inner).trim()}`);

describe("AI launch kit: when the AI breaks, Day 1 still ends with a website", () => {
  it("a failed AI build comes back offering the starter template, and it builds the website", async () => {
    env.aiEnabled = true;
    const { ws } = await signIn();
    const failed = await press(buildLaunchKitAction, ws.id);
    expect(failed.path).toBe(`/app/w/${ws.id}/launch`);
    expect(failed.sp.failed).toBe("1");
    expect(failed.sp.error).toContain("use the starter template");
    expect(failed.sp.price).toBe("$29");
    expect(await listSites(ws.id)).toHaveLength(0);
    // The run was given back, so the counter still reads the first run.
    expect(await aiRunsFor(ws)).toMatchObject({ kind: "free", next: 1 });

    const form = text(await markup(ws.id, failed.sp));
    expect(form).toContain("Use the starter template instead");
    expect(form).toContain("The AI didn't finish");
    expect(form).toContain("Build my launch kit");

    const built = await press(buildStarterKitAction, ws.id);
    expect(built.sp.kit).toBeTruthy();
    expect(built.sp.error).toBeUndefined();
    expect(await listSites(ws.id)).toHaveLength(1);
  });

  it("before any failure with runs left, only Build my launch kit shows", async () => {
    env.aiEnabled = true;
    const { ws } = await signIn();
    const form = text(await markup(ws.id, {}));
    expect(form).not.toContain("Use the starter template instead");
  });

  it("on a rebuild both buttons ask for a second press, and Enter in a text box builds nothing", async () => {
    env.aiEnabled = true;
    const { ws } = await signIn();
    const kit = await runLaunchKit(ws.id, { ...ANSWERS, trialDays: 7 }, { useAi: false });
    if (!kit.ok) throw new Error(kit.error);

    const list = buttons(await markup(ws.id, { new: "1", failed: "1" }));
    // The browser sends Enter to the first submit button, and that one is disabled. (Suggest buttons are type="button".)
    expect(list.find((b) => b.startsWith("submit"))).toBe("submit(disabled):");
    expect(list.filter((b) => !b.startsWith("submit")).every((b) => b.startsWith("button:"))).toBe(true);
    expect(list).toContain("button:Build my launch kit");
    expect(list).toContain("button:Use the starter template instead");
    expect(list.filter((b) => b.startsWith("submit")).every((b) => b.includes("(disabled)"))).toBe(true);
  });

  it("a first build also never fires from Enter", async () => {
    env.aiEnabled = true;
    const { ws } = await signIn();
    const list = buttons(await markup(ws.id, {}));
    expect(list.find((b) => b.startsWith("submit"))).toBe("submit(disabled):");
    expect(list).toContain("button:Suggest");
    expect(list).toContain("submit:Build my launch kit");
  });
});
