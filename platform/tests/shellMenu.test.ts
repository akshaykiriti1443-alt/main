import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { matchNavItem } from "@/components/nav-match";
import { workspaceNav, type WorkspaceNavInput } from "@/app/app/w/[wid]/nav";

// The menu a beginner sees: short, in the course's order, the same every day, and nothing locked.

const base = "/app/w/ws1";
const pathname = vi.hoisted(() => ({ current: "/app/w/ws1" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {}, prefetch: () => {} }),
}));
const source = (file: string) => readFileSync(path.join(process.cwd(), "src", file), "utf8");
const NO_PRESSURE = /\b(hurry|last chance|don't miss|you'd lose|you will lose|act now|lock it in|goes up soon)\b|\d+ days? left|\bcountdown\b/i;
const nav = (o: Partial<WorkspaceNavInput> = {}) =>
  workspaceNav({ base, plan: "starter", unread: 0, reelVault: false, member: true, mode: "week", nextHref: null, ...o });
const labels = (groups: ReturnType<typeof nav>) => groups.map((g) => [g.title ?? "", g.items.map((i) => i.label)]);

describe("which menu item an address belongs to", () => {
  const items = nav({ reelVault: true }).flatMap((g) => g.items);
  it("ignores ?query and #hash", () => {
    expect(matchNavItem(items, `${base}/settings#tracking`)?.label).toBe("Settings");
    expect(matchNavItem(items, `${base}/ads/studio?ok=Saved#plan`)?.label).toBe("Ad studio");
  });
  it("picks the longest match, so Ad studio is not Ad review", () => {
    expect(matchNavItem(items, `${base}/ads/studio`)?.label).toBe("Ad studio");
    expect(matchNavItem(items, `${base}/ads`)?.label).toBe("Ad review");
    expect(matchNavItem(items, `${base}/ads/123`)?.label).toBe("Ad review");
  });
  it("only matches the Dashboard on the Dashboard itself", () => {
    expect(matchNavItem(items, base)?.label).toBe("Dashboard");
    expect(matchNavItem(items, `${base}/hello`)).toBeUndefined();
  });
  it("matches nothing for no address or a page outside the app", () => {
    expect(matchNavItem(items, null)).toBeUndefined();
    expect(matchNavItem(items, "https://www.skool.com/group")).toBeUndefined();
  });
});

describe("the Member menu", () => {
  it("is 12 rows in the course's order, then a closed More", () => {
    const groups = nav();
    expect(labels(groups)).toEqual([
      ["", ["Dashboard", "Your path"]],
      ["Your week", ["Your AI", "Make my carousel", "AI launch kit", "Funnels & pages", "Ad research", "Ad studio", "Leads", "Growth ladder", "Unlocks", "Ad review"]],
      ["More", ["Emails", "Settings", "Plan & wallet"]],
    ]);
    expect(groups[0].items.length + groups[1].items.length).toBe(12);
    expect(groups[1].items[1]).toMatchObject({ href: `${base}/carousel`, icon: "carousel" });
    expect(groups[2]).toMatchObject({ id: "more", collapsible: true, defaultOpen: false });
  });

  it("never shows a Growth-plan tool or a padlock", () => {
    const items = nav({ reelVault: true }).flatMap((g) => g.items);
    expect(items.some((i) => i.locked)).toBe(false);
    for (const hidden of ["Pipeline", "Automations", "Inbox", "Social planner", "Calendar"]) {
      expect(items.map((i) => i.label)).not.toContain(hidden);
    }
  });

  it("calls the tools group 'Your tools' once the week is done", () => {
    expect(nav({ mode: "after" })[1].title).toBe("Your tools");
  });

  it("opens More on the server only when the next step lives there", () => {
    expect(nav({ nextHref: `${base}/settings` })[2].defaultOpen).toBe(true);
    expect(nav({ nextHref: `${base}/emails` })[2].defaultOpen).toBe(true);
    expect(nav({ nextHref: `${base}/ads/studio` })[2].defaultOpen).toBe(false);
    expect(nav({ nextHref: base })[2].defaultOpen).toBe(false);
    expect(nav({ nextHref: null })[2].defaultOpen).toBe(false);
  });

  it("puts ReelVault in Your week right before Make my carousel (Day 1 step 2), inside the app, only when it's set up", () => {
    expect(nav().flatMap((g) => g.items).map((i) => i.label)).not.toContain("ReelVault");
    const groups = nav({ reelVault: true });
    expect(labels(groups)).toEqual([
      ["", ["Dashboard", "Your path"]],
      ["Your week", ["Your AI", "ReelVault", "Make my carousel", "AI launch kit", "Funnels & pages", "Ad research", "Ad studio", "Leads", "Growth ladder", "Unlocks", "Ad review"]],
      ["More", ["Emails", "Settings", "Plan & wallet"]],
    ]);
    const reel = groups[1].items[1];
    expect(reel).toMatchObject({ href: `${base}/reelvault`, label: "ReelVault", icon: "reel" });
    expect(reel.external).toBeUndefined();
    expect(reel.children?.map((c) => c.label)).toEqual(["Competitors", "Reels", "What works", "Create", "Outputs", "Settings"]);
    expect(reel.hint).toBeTruthy();
    // Its pages don't open More: it lives in Your week now.
    expect(nav({ reelVault: true, nextHref: `${base}/reelvault` })[2].defaultOpen).toBe(false);
  });
});

describe("every other account keeps today's menu", () => {
  const today = (reel: boolean) => [
    ["", ["Dashboard", "Your path"]],
    ["Start here", ["Your AI", "AI launch kit", "Funnels & pages"]],
    ["Get members", ["Ad research", ...(reel ? ["ReelVault"] : []), "Make my carousel", "Ad studio", "Ad review", "Growth ladder", "Leads", "Pipeline"]],
    ["Keep members", ["Automations", "Unlocks", "Emails"]],
    ["Talk", ["Inbox", "Social planner", "Calendar"]],
    ["Account", ["Plan & wallet", "Settings"]],
  ];

  it("for a Growth-plan workspace, with nothing locked", () => {
    const groups = nav({ plan: "growth", member: false, reelVault: true, unread: 3 });
    expect(labels(groups)).toEqual(today(true));
    expect(groups.some((g) => g.collapsible)).toBe(false);
    expect(groups.flatMap((g) => g.items).find((i) => i.label === "Inbox")?.badge).toBe(3);
  });

  it("for a starter workspace under an agency's brand, locks and all", () => {
    const groups = nav({ member: false });
    expect(labels(groups)).toEqual(today(false));
    const locked = groups.flatMap((g) => g.items).filter((i) => i.locked).map((i) => i.label);
    expect(locked).toEqual(["Pipeline", "Automations", "Inbox", "Social planner", "Calendar"]);
  });
});

describe("the folding More group", () => {
  const sidebar = async (groups: ReturnType<typeof nav>) => {
    const { AppSidebar } = await import("@/components/shell");
    const { SidebarProvider } = await import("@/components/ui/sidebar");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const bar = createElement(AppSidebar, { brand: { name: "OneX" }, groups, places: [], user: { email: "a@b.co" } });
    return renderToStaticMarkup(createElement(TooltipProvider, null, createElement(SidebarProvider, null, bar)));
  };
  const moreBlock = (html: string) => {
    const id = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    const start = html.indexOf(`<div id="${id}"`);
    expect(start).toBeGreaterThan(-1);
    return html.slice(start, html.indexOf("</ul>", start));
  };

  it("keeps its links in the page while closed, hidden only by CSS", async () => {
    pathname.current = `${base}/ads/studio`;
    const html = await sidebar(nav({ reelVault: true }));
    expect(html).toContain('aria-expanded="false"');
    const more = moreBlock(html);
    expect(more).toMatch(/^<div id="[^"]+" data-state="closed"/);
    expect(more).not.toMatch(/^<div[^>]*\shidden[\s=>]/);
    expect(more).toContain("group-data-[collapsible=icon]:block!");
    for (const href of [`${base}/emails`, `${base}/settings`, `${base}/billing`]) {
      expect(more).toContain(`data-nav="${href}"`);
    }
    expect(more).not.toContain(`data-nav="${base}/reelvault"`);
    expect(html).toContain(`data-nav="${base}/reelvault"`);
  });

  it("starts open when the next step lives there or you're on one of its pages", async () => {
    pathname.current = base;
    expect(moreBlock(await sidebar(nav({ nextHref: `${base}/settings` })))).toMatch(/^<div id="[^"]+" data-state="open"/);
    pathname.current = `${base}/settings`;
    const html = await sidebar(nav());
    expect(html).toContain('aria-expanded="true"');
    expect(moreBlock(html)).toMatch(/^<div id="[^"]+" data-state="open"/);
  });

  it("listens for Penny's next step", () => {
    expect(source("components/shell.tsx")).toContain('"onx:guide-next"');
  });
});

describe("the layout's notes", () => {
  it("puts info notes under the page and keeps the membership warning calm", () => {
    const layout = source("app/app/w/[wid]/layout.tsx");
    expect(layout).toContain("footnote={footnote}");
    expect(layout).toContain("We haven't matched ${ownerEmail} to a Skool membership yet");
    // Someone still in their first welcome days is being matched, not lapsed: calm words, no warning.
    expect(layout).toContain('gap === "matching"');
    expect(layout).toContain("We&apos;re still matching you to your Skool membership.");
    expect(layout).not.toContain("Contact support");
    expect(layout).not.toContain("We can't see an active membership");
    expect(layout).toContain("Your card renews this plan on {until}.");
    expect(layout).not.toMatch(NO_PRESSURE);
    expect(source("app/app/w/[wid]/nav.ts")).not.toMatch(NO_PRESSURE);
  });
});
