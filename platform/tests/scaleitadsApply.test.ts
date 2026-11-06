import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { activities, automationRuns, contacts, emailMessages, opportunities, workspaces } from "@/lib/db/schema";
import { APPLY_LEAD_PATH, applyCalendarPath, applyPageFor, GHL_CALENDAR_URL, GHL_LEAD_WEBHOOK_URL } from "@/app/(scaleitads)/_site/applyConfig";
import { html, js } from "@/app/(scaleitads)/_site/ported/apply";
import ApplyPage from "@/app/(scaleitads)/apply/page";
import PrivacyPage from "@/app/(scaleitads)/privacy/page";
import { POST } from "@/app/api/scaleitads/apply/route";
import { createCalendar, setCalendarActive } from "@/server/booking";
import { saveAutomation } from "@/server/automations";
import { upsertContact } from "@/server/contacts";
import { ensureDefaultPipeline, moveOpportunity, stageNamed } from "@/server/pipelines";
import { scaleitadsBooking, spendBand } from "@/server/scaleitads";
import { makeWorkspace } from "./helpers";

const ALL_DAY = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "00:00", end: "24:00" }));

/** Each test applies from its own domain (the per-email rate limit is global). */
let domain = "brand0.com";
let domainN = 0;
const mail = (local: string) => `${local}@${domain}`;

/** The owner's ScaleitAds workspace with an open calendar, wired up through the two variables. */
async function ownSite(opts: { plan?: "growth" | "starter"; wire?: boolean } = {}) {
  domain = `brand${++domainN}.com`;
  const made = await makeWorkspace({ plan: opts.plan ?? "growth" });
  const cal = await createCalendar(made.ws.id, { name: "Free ad account check", durationMinutes: 45, minNoticeMinutes: 0, maxDaysAhead: 14, timezone: "UTC", availability: ALL_DAY, locationType: "zoom", locationValue: "https://zoom.us/j/1" });
  if (opts.wire !== false) {
    vi.stubEnv("SCALEITADS_WORKSPACE", made.ws.slug);
    vi.stubEnv("SCALEITADS_CALENDAR", cal.slug);
  }
  return { ...made, cal };
}

const unset = () => {
  vi.stubEnv("SCALEITADS_WORKSPACE", "");
  vi.stubEnv("SCALEITADS_CALENDAR", "");
};

type PageEl = { props: { html: string; js: string } };
const renderApply = async () => ((await ApplyPage()) as unknown as PageEl).props;

/** Every string in a React element tree, without rendering any component. */
function textOf(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  const props = (node as { props?: Record<string, unknown> }).props;
  return props ? textOf(props.children) : "";
}

afterEach(() => vi.unstubAllEnvs());

describe("/apply: GoHighLevel until the switch", () => {
  it("serves the ported page untouched while the variables are unset", async () => {
    unset();
    expect(await scaleitadsBooking()).toBeNull();
    expect(applyPageFor({ html, js }, null)).toEqual({ html, js });
    const page = await renderApply();
    expect(page.js).toBe(js);
    expect(page.html).toBe(html);
    expect(page.js).toContain(GHL_LEAD_WEBHOOK_URL);
    expect(page.js).toContain(GHL_CALENDAR_URL);
    expect(page.js).toContain("link.msgsndr.com/js/form_embed.js");
    expect(textOf(await PrivacyPage())).toContain("HighLevel (LeadConnector): website, forms, calendar, CRM");
  });

  it("stays on GoHighLevel when the variables don't match an open calendar", async () => {
    const { ws, cal } = await ownSite({ wire: false });
    const tryWith = async (w: string, c: string) => {
      vi.stubEnv("SCALEITADS_WORKSPACE", w);
      vi.stubEnv("SCALEITADS_CALENDAR", c);
      return scaleitadsBooking();
    };
    expect(await tryWith("no-such-workspace", cal.slug)).toBeNull();
    expect(await tryWith(ws.slug, "no-such-calendar")).toBeNull();
    expect(await tryWith(ws.slug, "")).toBeNull();
    expect(await tryWith("../x", cal.slug)).toBeNull();
    expect(await tryWith(ws.slug, cal.slug)).toEqual({ workspaceSlug: ws.slug, calendarSlug: cal.slug });
    await setCalendarActive(ws.id, cal.id, false);
    expect(await tryWith(ws.slug, cal.slug)).toBeNull();
    expect((await renderApply()).js).toBe(js);
    await setCalendarActive(ws.id, cal.id, true);
    // A plan without calendars closes it too.
    const db = await getDb();
    await db.update(workspaces).set({ plan: "starter" }).where(eq(workspaces.id, ws.id));
    expect(await tryWith(ws.slug, cal.slug)).toBeNull();
  });
});

describe("/apply: on our own stack", () => {
  it("posts leads to us and embeds our booking page, nothing else changed", async () => {
    const { ws, cal } = await ownSite();
    const booking = await scaleitadsBooking();
    expect(booking).toEqual({ workspaceSlug: ws.slug, calendarSlug: cal.slug });
    const page = await renderApply();
    const calPath = applyCalendarPath(booking!);
    expect(calPath).toBe(`/b/${ws.slug}/${cal.slug}?embed=1&next=%2Fbooked`);
    expect(page.js).toContain(`LEAD_WEBHOOK_URL: "${APPLY_LEAD_PATH}"`);
    expect(page.js).toContain(`CALENDAR_URL: "${calPath}"`);
    for (const ghl of ["leadconnectorhq", "msgsndr", "link.scaleitads.com"]) {
      expect(page.js).not.toContain(ghl);
      expect(page.html).not.toContain(ghl);
    }
    // The rest of the script is the port, line for line: only the swapped lines differ.
    const before = js.split("\n");
    const after = page.js.split("\n");
    const changed = before.filter((l) => !after.includes(l));
    expect(changed).toHaveLength(6);
    expect(page.js).toContain('px("std", "Lead"');
    expect(page.js).toContain('px("custom", "CalendarShown"');
    expect(page.js).toContain('"std", "Schedule"');
    expect(page.html).toContain('data-f="hp"');
    expect(page.html).toContain(`href="/b/${ws.slug}/${cal.slug}?next=%2Fbooked"`);
    // Both scripts still parse.
    expect(() => new Function(js)).not.toThrow();
    expect(() => new Function(page.js)).not.toThrow();
    // isSet() now takes same-origin paths, still never protocol-relative or plain http URLs.
    const isSet = new Function(`${page.js.match(/function isSet\(v\) \{[^\n]*\}/)![0]}; return isSet;`)() as (v: unknown) => boolean;
    expect([isSet(APPLY_LEAD_PATH), isSet(calPath), isSet("https://x.com"), isSet("//evil.com"), isSet("http://x.com"), isSet("")]).toEqual([true, true, true, false, false, false]);
    expect(textOf(await PrivacyPage())).toContain("Our CRM and booking tools: website, forms, calendar, CRM");
    expect(textOf(await PrivacyPage())).not.toContain("HighLevel");
  });

  it("refuses to half-switch a port that was regenerated", () => {
    const b = { workspaceSlug: "scaleitads", calendarSlug: "call" };
    expect(() => applyPageFor({ html, js: js.replace("form_embed.js", "embed.js") }, b)).toThrow(/GoHighLevel embed script/);
    expect(() => applyPageFor({ html: html.replace('data-err hidden', "data-err"), js }, b)).toThrow(/form error line/);
    expect(() => applyPageFor({ html, js }, { workspaceSlug: "Bad Slug", calendarSlug: "x" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// POST /api/scaleitads/apply
// ---------------------------------------------------------------------------

const lead = (over: Record<string, unknown> = {}) => ({
  first_name: "Jane",
  last_name: "Smith",
  email: mail("jane"),
  phone: "+1 555 010 2030",
  website: "brand.com",
  ad_spend: "$50-$150/day ($1,500-$5,000/mo)",
  qualified: "yes",
  segment: "call",
  marketing_consent: "yes",
  stage: "qualified",
  source: "apply",
  page: "/apply",
  utm_source: "facebook",
  utm_campaign: "spring-sale",
  fbclid: "IwAR123",
  hp: "",
  ...over,
});

let ipN = 0;
async function post(body: unknown, opts: { ip?: string; raw?: string; type?: string } = {}) {
  const res = await POST(
    new NextRequest("https://scaleitads.com/api/scaleitads/apply", {
      method: "POST",
      body: opts.raw ?? JSON.stringify(body),
      headers: { "content-type": opts.type ?? "application/json", "x-real-ip": opts.ip ?? `10.20.0.${++ipN}` },
    }),
  );
  return { status: res.status, body: (await res.json()) as { ok: boolean; saved?: boolean; error?: string } };
}

async function contactsOf(workspaceId: string) {
  const db = await getDb();
  return db.select().from(contacts).where(eq(contacts.workspaceId, workspaceId));
}

describe("POST /api/scaleitads/apply", () => {
  it("answers 503 when no workspace is configured, or it doesn't exist (and /apply stays on GoHighLevel)", async () => {
    unset();
    expect((await post(lead())).status).toBe(503);
    vi.stubEnv("SCALEITADS_WORKSPACE", "nobody-has-this-slug");
    vi.stubEnv("SCALEITADS_CALENDAR", "call");
    const r = await post(lead());
    expect(r).toEqual({ status: 503, body: { ok: false, error: expect.any(String) } });
    expect(await scaleitadsBooking()).toBeNull();
    expect((await renderApply()).js).toBe(js);
  });

  it("validates the form", async () => {
    const { ws } = await ownSite();
    expect((await post(null, { raw: "not json" })).status).toBe(400);
    expect((await post(null, { raw: "[1,2]" })).status).toBe(400);
    for (const [bad, msg] of [
      [{ email: "nope" }, /email/],
      [{ first_name: "" }, /name/],
      [{ phone: "12" }, /phone/],
      [{ website: "brand" }, /website/],
      [{ email: 42 }, /./],
      [{ first_name: "x".repeat(81) }, /./],
    ] as const) {
      const r = await post(lead(bad));
      expect(r.status, JSON.stringify(bad)).toBe(422);
      expect(r.body.error).toMatch(msg);
    }
    expect(await contactsOf(ws.id)).toHaveLength(0);
  });

  it("adds the applicant: contact, tags, notes, a deal in the first stage, and the lead-created event", async () => {
    const { ws } = await ownSite();
    await saveAutomation(ws.id, null, { name: "New applicants", trigger: { type: "lead_created", value: "" }, actions: [{ type: "add_tag", tag: "welcome" }], active: true });
    const r = await post(lead({ email: mail("Jane").toUpperCase() }));
    expect(r).toEqual({ status: 200, body: { ok: true, saved: true } });

    const [c] = await contactsOf(ws.id);
    expect(c).toMatchObject({ email: mail("jane"), phone: "+15550102030", firstName: "Jane", lastName: "Smith", source: "landing_page", unsubscribed: false });
    expect(c.tags).toEqual(expect.arrayContaining(["apply", "spend-50-150"]));
    expect(c.notes).toContain("Applied on scaleitads.com/apply");
    expect(c.notes).toContain("Website: brand.com");
    expect(c.notes).toContain("Meta ad spend: $50-$150/day ($1,500-$5,000/mo)");
    expect(c.notes).toContain("Marketing emails: yes");
    expect(c.notes).toContain("utm_source=facebook · utm_campaign=spring-sale · fbclid=IwAR123");

    const db = await getDb();
    const acts = await db.select().from(activities).where(eq(activities.contactId, c.id));
    expect(acts.find((a) => a.type === "lead")?.data).toMatchObject({ page: "scaleitads.com/apply", website: "brand.com", marketingConsent: "yes", utm: { utm_source: "facebook" } });
    expect(acts.filter((a) => a.type === "tag_added").map((a) => a.data.tag)).toEqual(expect.arrayContaining(["apply", "spend-50-150"]));

    const p = await ensureDefaultPipeline(ws.id);
    const deals = await db.select().from(opportunities).where(eq(opportunities.contactId, c.id));
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({ pipelineId: p.id, stageId: p.stages[0].id, status: "open", source: "scaleitads.com/apply", title: "Ad account check: Jane Smith" });
    expect(deals[0].notes).toContain("Website: brand.com");

    const runs = await db.select().from(automationRuns).where(eq(automationRuns.workspaceId, ws.id));
    expect(runs.some((run) => (run.context as { type?: string }).type === "lead_created")).toBe(true);
    // It never emails anyone itself.
    expect(await db.select().from(emailMessages).where(eq(emailMessages.workspaceId, ws.id))).toHaveLength(0);
  });

  it("takes the page's no-cors fallback (a text/plain body) too", async () => {
    const { ws } = await ownSite();
    expect((await post(null, { raw: JSON.stringify(lead()), type: "text/plain;charset=UTF-8" })).status).toBe(200);
    expect(await contactsOf(ws.id)).toHaveLength(1);
  });

  it("dedupes by email, and never moves a deal backwards", async () => {
    const { ws } = await ownSite();
    await post(lead());
    const db = await getDb();
    const [c] = await contactsOf(ws.id);
    const p = await ensureDefaultPipeline(ws.id);
    const [deal] = await db.select().from(opportunities).where(eq(opportunities.contactId, c.id));
    await moveOpportunity(ws.id, deal.id, stageNamed(p, "Call booked")!.id);

    const again = await post(lead({ email: mail("JANE"), ad_spend: "$150-$500/day ($5,000-$15,000/mo)", utm_source: "instagram" }));
    expect(again.body).toEqual({ ok: true, saved: true });
    const all = await contactsOf(ws.id);
    expect(all).toHaveLength(1);
    expect(all[0].tags).toEqual(expect.arrayContaining(["apply", "spend-50-150", "spend-150-500"]));
    expect(all[0].notes).toContain("Meta ad spend: $150-$500/day");
    expect(all[0].notes.match(/Website: brand.com/g)).toHaveLength(1); // only new lines are added
    const deals = await db.select().from(opportunities).where(eq(opportunities.contactId, c.id));
    expect(deals).toHaveLength(1);
    expect(deals[0].stageId).toBe(stageNamed(p, "Call booked")!.id);
    expect(deals[0].notes).toContain("$150-$500/day");
  });

  it("matches by phone when the email is new, but never merges two different emails", async () => {
    const { ws } = await ownSite();
    // Someone who messaged on WhatsApp first: a phone, no email.
    const { contact: wa } = await upsertContact({ workspaceId: ws.id, phone: "+15550102030", firstName: "J", source: "whatsapp", channel: { kind: "whatsapp", id: "15550102030" } });
    await post(lead({ phone: "(555) 010-2030" }));
    let all = await contactsOf(ws.id);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: wa.id, email: mail("jane"), firstName: "J", lastName: "Smith" });

    // Same phone, a different email: a different person (or a colleague), so a new contact.
    await post(lead({ email: mail("ops"), first_name: "Sam", last_name: "" }));
    all = await contactsOf(ws.id);
    expect(all).toHaveLength(2);
    expect(all.find((x) => x.email === mail("ops"))?.firstName).toBe("Sam");
  });

  it("honours the email box: unticked means unsubscribed, and a later tick doesn't undo it", async () => {
    const { ws } = await ownSite();
    await post(lead({ marketing_consent: "no" }));
    const db = await getDb();
    let [c] = await contactsOf(ws.id);
    expect(c.unsubscribed).toBe(true);
    expect(c.notes).toContain("Marketing emails: no");
    expect(await db.select().from(activities).where(and(eq(activities.contactId, c.id), eq(activities.type, "unsubscribed")))).toHaveLength(1);
    await post(lead({ marketing_consent: "yes" }));
    [c] = await contactsOf(ws.id);
    expect(c.unsubscribed).toBe(true);
    // Anything but an explicit "yes" is a no.
    await post(lead({ email: mail("x"), marketing_consent: undefined }));
    expect((await contactsOf(ws.id)).find((x) => x.email === mail("x"))?.unsubscribed).toBe(true);
  });

  it("drops bots (honeypot) and under-$50-a-day answers without saving them", async () => {
    const { ws } = await ownSite();
    expect(await post(lead({ hp: "http://spam.example" }))).toEqual({ status: 200, body: { ok: true, saved: false } });
    expect(await post(lead({ ad_spend: "Under $50/day (under $1,500/mo)" }))).toEqual({ status: 200, body: { ok: true, saved: false } });
    expect(await post(lead({ ad_spend: "Not running Meta ads yet" }))).toEqual({ status: 200, body: { ok: true, saved: false } });
    expect(await contactsOf(ws.id)).toHaveLength(0);
  });

  it("rate-limits by IP and by email", async () => {
    const { ws } = await ownSite();
    const ip = "10.99.0.1";
    const results = [];
    for (let i = 0; i < 11; i++) results.push((await post(lead({ email: mail(`p${i}`) }), { ip })).status);
    expect(results.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(results[10]).toBe(429);
    expect(await contactsOf(ws.id)).toHaveLength(10);
    // One email, many IPs: five an hour.
    const byEmail = [];
    for (let i = 0; i < 6; i++) byEmail.push((await post(lead({ email: mail("same") }))).status);
    expect(byEmail).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("skips the deal (but keeps the lead) on a plan without pipelines", async () => {
    const { ws } = await ownSite({ plan: "starter" });
    expect((await post(lead())).body).toEqual({ ok: true, saved: true });
    const db = await getDb();
    expect(await contactsOf(ws.id)).toHaveLength(1);
    expect(await db.select().from(opportunities).where(eq(opportunities.workspaceId, ws.id))).toHaveLength(0);
  });
});

describe("spend bands", () => {
  it("reads the page's answers", () => {
    expect(spendBand("$50-$150/day ($1,500-$5,000/mo)")).toMatchObject({ tag: "spend-50-150", call: true });
    expect(spendBand("$150-$500/day ($5,000-$15,000/mo)")).toMatchObject({ tag: "spend-150-500", call: true });
    expect(spendBand("$500+/day ($15,000+/mo)")).toMatchObject({ tag: "spend-500-plus", call: true });
    expect(spendBand("Under $50/day (under $1,500/mo)")).toMatchObject({ call: false });
    expect(spendBand("Not running Meta ads yet")).toMatchObject({ call: false });
    expect(spendBand("")).toMatchObject({ tag: "spend-unknown", call: true });
  });
});
