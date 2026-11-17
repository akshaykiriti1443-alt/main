import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sites, workspaces } from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { encrypt } from "@/lib/crypto";
import {
  accountSkoolUrl,
  createSite,
  defaultSection,
  domainTools,
  getSite,
  joinLinkMissing,
  lastPublishedAt,
  listPages,
  setAccountSkoolUrl,
  siteVars,
  usesSkoolLink,
  type Site,
} from "@/server/sites";
import { LandingSections } from "@/components/landing/LandingSections";
import { holdingPage } from "@/app/go/holding";
import { GET as goRoute } from "@/app/go/[slug]/route";
import { GraphApiError } from "@/server/meta/graph";
import { checkPixel, cleanPixelId, explainMetaError, pixelStatus, sendPixelTest, type TrackingSettings } from "@/server/meta/capi";
import { makeWorkspace } from "./helpers";

// next/font only works inside Next's build.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: {} });
  return { Geist: font, Instrument_Serif: font, Nunito: font };
});

const GROUP = "https://www.skool.com/fit-dads";

async function setSettings(workspaceId: string, settings: TrackingSettings) {
  const db = await getDb();
  await db.update(workspaces).set({ settings }).where(eq(workspaces.id, workspaceId));
}

async function readSettings(workspaceId: string): Promise<TrackingSettings> {
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return ws.settings as TrackingSettings;
}

function funnel(workspaceId: string, skoolUrl = "") {
  return createSite({
    workspaceId,
    name: "Fit Dads funnel",
    skoolUrl,
    pages: [
      { slug: "", title: "Opt-in", kind: "optin", content: { sections: [defaultSection("hero"), defaultSection("form")] } },
      { slug: "thank-you", title: "Thank you", kind: "thankyou", content: { sections: [defaultSection("cta")] } },
    ],
  });
}

function render(vars: Record<string, string>, preview = false) {
  return renderToStaticMarkup(
    createElement(LandingSections, {
      sections: [defaultSection("cta")],
      theme: { style: "bold", brandColor: "#2A44EE", font: "sans" },
      vars,
      businessName: "Fit Dads Club",
      form: { action: "/api/public/lead", pageId: "p1", eventId: "e1", ...(preview ? { preview: true } : {}) },
    }),
  );
}

const metaAnswer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("one Skool link per account", () => {
  it("prefers the account's link, falls back to the website's copy, and is empty with neither", () => {
    const site = { skoolUrl: "https://www.skool.com/old-group", leadMagnetUrl: "", leadMagnetName: "", slug: "fit", customDomain: null, domainStatus: "pending" } as unknown as Site;
    expect(siteVars(site, GROUP).skool_url).toBe(GROUP);
    expect(siteVars(site, "").skool_url).toBe("https://www.skool.com/old-group");
    expect(siteVars({ ...site, skoolUrl: "" }, null).skool_url).toBe("");
    // Anything that isn't a web address never becomes a button link.
    expect(siteVars({ ...site, skoolUrl: "" }, "javascript:alert(1)").skool_url).toBe("");
  });

  it("saving the link puts it on every website in the account, and only that account", async () => {
    const { ws } = await makeWorkspace();
    const { ws: other } = await makeWorkspace();
    const a = await funnel(ws.id);
    const b = await funnel(ws.id, "https://www.skool.com/stale");
    const theirs = await funnel(other.id, "https://www.skool.com/theirs");

    await setAccountSkoolUrl(ws.id, "https://www.skool.com/new-group");
    expect((await getSite(ws.id, a.id))?.skoolUrl).toBe("https://www.skool.com/new-group");
    expect((await getSite(ws.id, b.id))?.skoolUrl).toBe("https://www.skool.com/new-group");
    expect((await getSite(other.id, theirs.id))?.skoolUrl).toBe("https://www.skool.com/theirs");
    expect((await readSettings(ws.id)).skoolUrl).toBe("https://www.skool.com/new-group");
  });

  it("older accounts that kept the link only on a website still have one", async () => {
    const { ws } = await makeWorkspace();
    await setSettings(ws.id, { businessName: "Fit Dads Club" });
    expect(await accountSkoolUrl(ws.id, "")).toBe("");
    await funnel(ws.id, GROUP);
    expect(await accountSkoolUrl(ws.id, "")).toBe(GROUP);
    expect(await accountSkoolUrl(ws.id, "https://www.skool.com/saved")).toBe("https://www.skool.com/saved");
  });

  it("knows when a website has a Join button with nowhere to send it", async () => {
    const { ws } = await makeWorkspace();
    const site = await funnel(ws.id);
    const pages = await listPages(site.id);
    expect(usesSkoolLink(pages)).toBe(true);
    expect(joinLinkMissing(site, pages, "")).toBe(true);
    expect(joinLinkMissing(site, pages, GROUP)).toBe(false);
    // A page with no Join button has nothing missing.
    const optinOnly = pages.filter((p) => p.kind === "optin");
    expect(joinLinkMissing(site, optinOnly, "")).toBe(false);
  });

  it("says when the website last went live, or null for a draft", () => {
    expect(lastPublishedAt([{ publishedAt: null }])).toBeNull();
    const later = new Date("2026-11-10T10:00:00Z");
    expect(lastPublishedAt([{ publishedAt: new Date("2026-11-09T10:00:00Z") }, { publishedAt: later }, { publishedAt: null }])?.getTime()).toBe(later.getTime());
  });
});

describe("the Join button on a page", () => {
  it("goes to the Skool group when there is a link", () => {
    const html = render({ skool_url: GROUP });
    expect(html).toContain(`href="${GROUP}"`);
    expect(html).toContain("Join the group");
  });

  it("is left off the live page when there is no link, never a dead button", () => {
    const html = render({ skool_url: "" });
    expect(html).not.toContain('href="#"');
    expect(html).not.toContain('class="lp-btn');
    // The headline and words around it still show.
    expect(html).toContain("Ready for the full system?");
  });

  it("shows greyed in the editor's preview, with what is missing", () => {
    const html = render({ skool_url: "" }, true);
    expect(html).toContain("is-waiting");
    expect(html).toContain("Join the group");
    expect(html).toContain("once your Skool group link is saved in Settings");
    expect(html).not.toContain('href="#"');
  });
});

describe("a Skool link with nowhere to go yet", () => {
  it("shows a calm holding page, escaping the business name", () => {
    const html = holdingPage("Sam <b>& Co</b>");
    expect(html).toContain("Sam &lt;b&gt;&amp; Co&lt;/b&gt; isn't open just yet");
    expect(html).not.toContain("<b>");
    expect(holdingPage(null)).toContain("This link isn't ready yet");
  });

  it("the ad link shows the holding page instead of sending visitors to the app", async () => {
    const { ws } = await makeWorkspace();
    await setSettings(ws.id, { businessName: "Fit Dads Club" });
    const res = await goRoute(new NextRequest(`http://localhost/go/${ws.slug}?src=ads`, { headers: { "user-agent": "Mozilla/5.0 (iPhone)" } }), { params: Promise.resolve({ slug: ws.slug }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    const html = await res.text();
    expect(html).toContain("Fit Dads Club isn't open just yet");
    expect(html).not.toContain("login");

    const missing = await goRoute(new NextRequest("http://localhost/go/no-such-account"), { params: Promise.resolve({ slug: "no-such-account" }) });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("This link isn't ready yet");
  });

  it("still redirects to the group once the link is saved", async () => {
    const { ws } = await makeWorkspace();
    const res = await goRoute(new NextRequest(`http://localhost/go/${ws.slug}`, { headers: { "user-agent": "facebookexternalhit/1.1" } }), { params: Promise.resolve({ slug: ws.slug }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("skool.com/fit-dads");
  });
});

describe("Pixel ID check on save", () => {
  it("accepts a Dataset ID and tidies spaces and dashes", () => {
    expect(cleanPixelId("")).toEqual({ ok: true, id: "" });
    expect(cleanPixelId(" 1234 5678-9012 345 ")).toEqual({ ok: true, id: "123456789012345" });
    expect(cleanPixelId("1234567890123456")).toEqual({ ok: true, id: "1234567890123456" });
  });

  it("says in plain words what was pasted instead", () => {
    const adAccount = cleanPixelId("act_123456789012345");
    expect(adAccount.ok).toBe(false);
    if (!adAccount.ok) expect(adAccount.error).toContain("ad account number");
    const token = cleanPixelId("EAAGm0PX4ZCpsBAKxyz123");
    expect(token.ok).toBe(false);
    if (!token.ok) expect(token.error).toContain("access token");
    const short = cleanPixelId("12345");
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toContain("You pasted 5");
    expect(cleanPixelId("my pixel").ok).toBe(false);
  });
});

describe("Pixel status never claims more than Meta said", () => {
  const base: WorkspaceSettings = { businessName: "Fit Dads Club" };
  it("is only accepted when Meta took a test with this exact ID", () => {
    expect(pixelStatus(base).state).toBe("none");
    expect(pixelStatus({ ...base, metaPixelId: "123456789012345" }).state).toBe("saved");
    const withToken: TrackingSettings = { ...base, metaPixelId: "123456789012345", metaCapiTokenEnc: "x" };
    expect(pixelStatus(withToken).state).toBe("untested");
    const at = new Date().toISOString();
    expect(pixelStatus({ ...withToken, metaPixelCheck: { ok: true, at, pixelId: "123456789012345" } }).state).toBe("accepted");
    // An answer about a different ID says nothing about this one.
    expect(pixelStatus({ ...withToken, metaPixelCheck: { ok: true, at, pixelId: "999999999999999" } }).state).toBe("untested");
    expect(pixelStatus({ ...withToken, metaPixelCheck: { ok: false, at, pixelId: "123456789012345", reason: "Bad token." } })).toMatchObject({ state: "rejected", reason: "Bad token." });
  });

  it("puts Meta's errors in words a beginner can act on", () => {
    expect(explainMetaError(new GraphApiError("Meta API: Invalid OAuth access token", 400, 190))).toMatchObject({ answered: true });
    expect(explainMetaError(new GraphApiError("Meta API: x", 400, 100, 33)).reason).toContain("can't find a Pixel");
    expect(explainMetaError(new GraphApiError("Meta API: x", 403, 200)).reason).toContain("isn't allowed");
    // Meta being slow or down is "ask again", never "Meta said no".
    expect(explainMetaError(new GraphApiError("Meta API: x", 500, 2))).toMatchObject({ answered: false });
    expect(explainMetaError(new GraphApiError("Meta API: x", 400, 17))).toMatchObject({ answered: false });
    expect(explainMetaError(new Error("offline"))).toMatchObject({ answered: false });
    expect(explainMetaError(new GraphApiError("Meta API: Something odd", 400, 999)).reason).toBe('Meta said: "Something odd"');
  });

  it("sends Meta one named test event and reports its answer", async () => {
    const ok = metaAnswer(200, { events_received: 1 });
    vi.stubGlobal("fetch", ok);
    expect(await sendPixelTest({ pixelId: "123456789012345", token: "tok", testEventCode: "TEST1" })).toEqual({ outcome: "accepted" });
    const [url, init] = ok.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain("/123456789012345/events");
    const sent = JSON.parse(String(init.body));
    expect(sent.data[0].event_name).toBe("ConnectionTest");
    expect(sent.test_event_code).toBe("TEST1");

    vi.stubGlobal("fetch", metaAnswer(400, { error: { message: "Invalid OAuth access token", code: 190 } }));
    const no = await sendPixelTest({ pixelId: "123456789012345", token: "bad" });
    expect(no.outcome).toBe("rejected");

    vi.stubGlobal("fetch", metaAnswer(200, { events_received: 0 }));
    expect((await sendPixelTest({ pixelId: "123456789012345", token: "tok" })).outcome).toBe("no-answer");

    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    expect(await sendPixelTest({ pixelId: "123456789012345", token: "tok", timeoutMs: 20 })).toMatchObject({ outcome: "no-answer", reason: expect.stringContaining("too long") });
  });

  it("remembers Meta's real answers and leaves them alone when Meta doesn't answer", async () => {
    const { ws } = await makeWorkspace();
    expect(await checkPixel(ws.id)).toEqual({ outcome: "not-ready" });

    await setSettings(ws.id, { businessName: "Fit Dads Club", metaPixelId: "123456789012345", metaCapiTokenEnc: encrypt("tok") });
    vi.stubGlobal("fetch", metaAnswer(200, { events_received: 1 }));
    expect((await checkPixel(ws.id)).outcome).toBe("accepted");
    expect(pixelStatus(await readSettings(ws.id)).state).toBe("accepted");

    vi.stubGlobal("fetch", metaAnswer(503, {}));
    expect((await checkPixel(ws.id)).outcome).toBe("no-answer");
    expect(pixelStatus(await readSettings(ws.id)).state).toBe("accepted");

    vi.stubGlobal("fetch", metaAnswer(400, { error: { message: "Invalid OAuth access token", code: 190 } }));
    expect((await checkPixel(ws.id)).outcome).toBe("rejected");
    const after = pixelStatus(await readSettings(ws.id));
    expect(after.state).toBe("rejected");
    if (after.state === "rejected") expect(after.reason).toContain("access token");
    // The rest of the settings are untouched.
    expect((await readSettings(ws.id)).businessName).toBe("Fit Dads Club");
  });

  it("a token that can't be read is a no, with what to do", async () => {
    const { ws } = await makeWorkspace();
    await setSettings(ws.id, { metaPixelId: "123456789012345", metaCapiTokenEnc: "not-a-real-ciphertext" });
    const res = await checkPixel(ws.id);
    expect(res).toMatchObject({ outcome: "rejected", reason: expect.stringContaining("Paste it again") });
  });
});

describe("custom domain tools", () => {
  it("are hidden from accounts that can't connect a domain, with no offer to buy one", () => {
    expect(domainTools(false, { customDomain: null })).toEqual({ show: false, offerPurchase: false });
    expect(domainTools(true, { customDomain: null })).toEqual({ show: true, offerPurchase: true });
    // A domain connected earlier stays manageable, and nobody is offered a second one.
    expect(domainTools(false, { customDomain: "join.fitdads.com" })).toEqual({ show: true, offerPurchase: false });
    expect(domainTools(true, { customDomain: "join.fitdads.com" })).toEqual({ show: true, offerPurchase: false });
  });
});

describe("websites built before the link was saved", () => {
  it("pick up the account link the moment it is saved", async () => {
    const { ws } = await makeWorkspace();
    await setSettings(ws.id, { businessName: "Fit Dads Club" });
    const site = await funnel(ws.id);
    expect(joinLinkMissing(site, await listPages(site.id), "")).toBe(true);
    await setAccountSkoolUrl(ws.id, GROUP);
    const db = await getDb();
    const [fresh] = await db.select().from(sites).where(eq(sites.id, site.id));
    const settings = await readSettings(ws.id);
    expect(siteVars(fresh, settings.skoolUrl).skool_url).toBe(GROUP);
    expect(joinLinkMissing(fresh, await listPages(site.id), settings.skoolUrl)).toBe(false);
  });
});
