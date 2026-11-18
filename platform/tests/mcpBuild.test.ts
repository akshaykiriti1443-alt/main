import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { siteThemeSchema } from "@/lib/db/types";
import { handleMcpMessage } from "@/server/mcp";
import { getSequenceWithSteps, listSequences } from "@/server/email/sequences";
import { getSite, listPages, siteVars } from "@/server/sites";
import { PLAYBOOKS, playbookByName } from "@/server/playbooks";
import { glassStarter } from "@/server/siteTemplates";
import { makeWorkspace } from "./helpers";

// Day 1 through the connector: the member's own Claude builds the website, the free checklist and the emails.

const call = async (workspaceId: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await handleMcpMessage({ workspaceId }, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const result = res?.result as { content: { text: string }[]; isError: boolean };
  const text = result.content[0].text;
  return { isError: result.isError, text, json: () => JSON.parse(text) };
};

const hero = { type: "hero", eyebrow: "Free for busy dads", headline: "Lose the dad belly in 20 minutes a day", subheadline: "One small plan.", bullets: ["One", "Two", "Three"], ctaText: "Send me the checklist", formTitle: "Where should I send it?", showForm: true };

describe("connector: build the website", () => {
  it("lists the new tools, with theme styles read from the schema", async () => {
    const { ws } = await makeWorkspace();
    const res = await handleMcpMessage({ workspaceId: ws.id }, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    const tools = (res?.result as { tools: { name: string; inputSchema: { properties: Record<string, { enum?: string[]; properties?: Record<string, { enum?: string[] }> }> } }[] }).tools;
    const names = tools.map((t) => t.name);
    for (const n of ["create_site", "create_page", "set_site_theme", "set_lead_magnet", "list_email_sequences", "get_email_sequence", "upsert_email_sequence"]) expect(names).toContain(n);
    const styles = siteThemeSchema.shape.style.removeDefault().options;
    expect(tools.find((t) => t.name === "set_site_theme")!.inputSchema.properties.style.enum).toEqual([...styles]);
    expect(tools.find((t) => t.name === "create_site")!.inputSchema.properties.theme.properties!.style.enum).toEqual([...styles]);
  });

  it("creates a website with a theme and written sections, and keeps to the plan's website limit", async () => {
    const { ws } = await makeWorkspace();
    const made = await call(ws.id, "create_site", {
      name: "Fit Dads funnel",
      theme: { style: "luxe", brandColor: "#112233", font: "serif" },
      sections: [hero, { type: "faq", title: "Questions", items: [{ q: "Is it free?", a: "Yes." }] }, { type: "form", title: "Get it", buttonText: "Send it" }],
      thankYouSections: [{ type: "cta", headline: "It's in your inbox", body: "Come and join us.", buttonText: "Join the group", buttonUrl: "{{skool_url}}" }],
    });
    expect(made.isError).toBe(false);
    const out = made.json();
    expect(out).toMatchObject({ ok: true, name: "Fit Dads funnel", published: false, theme: { style: "luxe", brandColor: "#112233", font: "serif" } });
    expect(out.slug).toBeTruthy();
    expect(out.preview).toContain(`/app/w/${ws.id}/sites/${out.siteId}/pages/`);
    expect(out.pages.map((p: { path: string; kind: string }) => [p.path, p.kind])).toEqual([
      ["/", "optin"],
      ["/thank-you", "thankyou"],
    ]);

    const site = (await getSite(ws.id, out.siteId))!;
    // The account's Skool link goes on, the same as the New funnel button.
    expect(site.skoolUrl).toBe("https://www.skool.com/fit-dads");
    const pages = await listPages(site.id);
    const optin = pages.find((p) => p.kind === "optin")!;
    expect(optin.content.sections.map((s) => s.type)).toEqual(["hero", "faq", "form"]);
    expect(optin.content.sections.every((s) => s.id.length > 0)).toBe(true);
    expect(optin.publishedContent).toBeNull();

    // A style the schema doesn't know is refused, and nothing is made.
    const bad = await call(ws.id, "create_site", { name: "Nope", theme: { style: "sparkly" } });
    expect(bad.isError).toBe(true);
    expect(bad.text).toMatch(/style/);
    // A broken section is refused before anything is saved.
    const broken = await call(ws.id, "create_site", { name: "Nope", sections: [{ type: "hero", headline: "x".repeat(500) }] });
    expect(broken.isError).toBe(true);

    // Starter holds 2 websites.
    expect((await call(ws.id, "create_site", { name: "Second" })).isError).toBe(false);
    const third = await call(ws.id, "create_site", { name: "Third" });
    expect(third.isError).toBe(true);
    expect(third.text).toMatch(/holds 2 websites/);
  });

  it("starts from the premium template by default: the Glass look and its starter words, or a blank page when asked", async () => {
    const { ws } = await makeWorkspace();
    const tools = ((await handleMcpMessage({ workspaceId: ws.id }, { jsonrpc: "2.0", id: 1, method: "tools/list" }))?.result as { tools: { name: string; description: string; inputSchema: { properties: Record<string, { enum?: string[] }> } }[] }).tools;
    const tool = tools.find((t) => t.name === "create_site")!;
    expect(tool.inputSchema.properties.template.enum).toEqual(["premium", "blank"]);
    expect(tool.description).toMatch(/premium template/);

    // No sections: the same starter as the Funnels page's "Start from the premium template".
    const starter = glassStarter({ name: "x" });
    const made = (await call(ws.id, "create_site", { name: "Fit Dads funnel", theme: { brandColor: "#0F766E" } })).json();
    expect(made.theme).toEqual({ style: "glass", brandColor: "#0F766E", font: "sans" });
    let site = (await getSite(ws.id, made.siteId))!;
    expect(site.leadMagnetName).toBe(starter.leadMagnetName);
    let pages = await listPages(site.id);
    expect(pages.find((p) => p.kind === "optin")!.content.sections.map((s) => s.type)).toEqual(starter.sections.map((s) => s.type));
    expect(pages.find((p) => p.kind === "thankyou")!.content.sections).toMatchObject([{ type: "cta", buttonUrl: "{{skool_url}}" }]);

    // Written sections keep the premium look; a style the owner asked for wins.
    const db = await getDb();
    await db.update(workspaces).set({ plan: "growth" }).where(eq(workspaces.id, ws.id));
    const written = (await call(ws.id, "create_site", { name: "Written", template: "premium", sections: [hero] })).json();
    expect(written.theme.style).toBe("glass");
    pages = await listPages(written.siteId);
    expect(pages.find((p) => p.kind === "optin")!.content.sections.map((s) => s.type)).toEqual(["hero"]);
    expect((await call(ws.id, "create_site", { name: "Luxe", theme: { style: "luxe" } })).json().theme.style).toBe("luxe");

    // blank: the plain starter page in the default look.
    const blank = (await call(ws.id, "create_site", { name: "Plain", template: "blank" })).json();
    expect(blank.theme.style).toBe(siteThemeSchema.parse({}).style);
    site = (await getSite(ws.id, blank.siteId))!;
    expect(site.leadMagnetName).toBe("");
    expect((await call(ws.id, "create_site", { name: "Nope", template: "fancy" })).isError).toBe(true);
  });

  it("adds pages, changes the look, and never reaches another workspace's website", async () => {
    const { ws } = await makeWorkspace();
    const { siteId } = (await call(ws.id, "create_site", { name: "Funnel" })).json();
    const about = await call(ws.id, "create_page", { siteId, path: "/about", title: "About", sections: [{ type: "text", title: "Hi, I'm Sam", body: "I help busy dads." }] });
    expect(about.isError).toBe(false);
    expect(about.json()).toMatchObject({ path: "/about", kind: "custom", title: "About" });
    const page = (await listPages(siteId)).find((p) => p.slug === "about")!;
    expect(page.content.sections).toMatchObject([{ type: "text", title: "Hi, I'm Sam" }]);
    const again = await call(ws.id, "create_page", { siteId, path: "about", title: "About again" });
    expect(again.isError).toBe(true);
    expect(again.text).toMatch(/already has a page at \/about/);
    expect((await call(ws.id, "create_page", { siteId, path: "/", title: "Home" })).isError).toBe(true);

    const themed = await call(ws.id, "set_site_theme", { siteId, brandColor: "#FF0066" });
    // The website started on the premium template, so only the colour changes.
    expect(themed.json().theme).toMatchObject({ style: "glass", brandColor: "#FF0066", font: "sans" });
    expect((await call(ws.id, "set_site_theme", { siteId, font: "comic" })).isError).toBe(true);
    expect((await getSite(ws.id, siteId))!.theme.brandColor).toBe("#FF0066");

    const other = await makeWorkspace();
    for (const [tool, args] of [
      ["create_page", { siteId, path: "x", title: "X" }],
      ["set_site_theme", { siteId, style: "clean" }],
      ["set_lead_magnet", { siteId, name: "Guide", url: "https://example.com/guide" }],
    ] as const) {
      const r = await call(other.ws.id, tool, args);
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/Website not found/);
    }
  });

  it("stops when the workspace is paused", async () => {
    const { ws } = await makeWorkspace();
    const db = await getDb();
    await db.update(workspaces).set({ status: "paused" }).where(eq(workspaces.id, ws.id));
    const r = await call(ws.id, "create_site", { name: "Funnel" });
    expect(r).toMatchObject({ isError: true });
    expect(r.text).toMatch(/paused/);
  });
});

describe("connector: the free checklist", () => {
  it("writes the checklist onto /guide and wires it like the launch kit, or links one that exists", async () => {
    const { ws } = await makeWorkspace();
    const { siteId } = (await call(ws.id, "create_site", { name: "Funnel" })).json();
    const set = await call(ws.id, "set_lead_magnet", { siteId, name: "7-Day Dad Reset", content: "**7-Day Dad Reset**\n\n- Day 1: Walk 10 minutes." });
    expect(set.isError).toBe(false);
    const out = set.json();
    expect(out.leadMagnet).toMatchObject({ name: "7-Day Dad Reset", link: "/guide" });
    expect(out.leadMagnet.url).toMatch(/\/guide$/);
    // Every new workspace's welcome email 1 links {{lead_magnet_url}} and is on.
    expect(out.delivery).toMatch(/gets it/);
    let site = (await getSite(ws.id, siteId))!;
    expect(site).toMatchObject({ leadMagnetName: "7-Day Dad Reset", leadMagnetUrl: "/guide" });
    expect(siteVars(site).lead_magnet_url).toMatch(/\/guide$/);
    const guide = (await listPages(siteId)).find((p) => p.slug === "guide")!;
    expect(guide.title).toBe("7-Day Dad Reset");
    expect(guide.content.sections).toMatchObject([{ type: "text", title: "7-Day Dad Reset", body: expect.stringContaining("Day 1") }]);

    // Writing it again replaces the same page, never a second one.
    await call(ws.id, "set_lead_magnet", { siteId, name: "Dad Reset v2", content: "New list" });
    const guides = (await listPages(siteId)).filter((p) => p.slug === "guide");
    expect(guides).toHaveLength(1);
    expect(guides[0].content.sections[0]).toMatchObject({ title: "Dad Reset v2", body: "New list" });

    // (a) A lead magnet the owner already has.
    const linked = await call(ws.id, "set_lead_magnet", { siteId, name: "My PDF", url: "https://example.com/pdf" });
    expect(linked.json().leadMagnet.url).toBe("https://example.com/pdf");
    site = (await getSite(ws.id, siteId))!;
    expect(site).toMatchObject({ leadMagnetName: "My PDF", leadMagnetUrl: "https://example.com/pdf" });

    expect((await call(ws.id, "set_lead_magnet", { siteId, name: "X", url: "javascript:alert(1)" })).isError).toBe(true);
    expect((await call(ws.id, "set_lead_magnet", { siteId, name: "X", url: "/nowhere" })).text).toMatch(/no page at \/nowhere/);
    expect((await call(ws.id, "set_lead_magnet", { siteId, name: "X" })).text).toMatch(/either url .* or content/);
    expect((await call(ws.id, "set_lead_magnet", { siteId, name: "X", url: "/guide", content: "x" })).isError).toBe(true);
    expect((await call(ws.id, "set_lead_magnet", { siteId, name: "Back", url: "/guide/" })).json().leadMagnet.link).toBe("/guide");
  });

  it("never overwrites another page (thank-you, About) unless replace: true is sent", async () => {
    const { ws } = await makeWorkspace();
    const { siteId } = (await call(ws.id, "create_site", { name: "Funnel" })).json();
    await call(ws.id, "create_page", { siteId, path: "about", title: "About", sections: [{ type: "text", title: "Hi, I'm Sam", body: "I help busy dads." }] });
    const thanksBefore = (await listPages(siteId)).find((p) => p.slug === "thank-you")!;

    for (const path of ["thank-you", "about"]) {
      const r = await call(ws.id, "set_lead_magnet", { siteId, name: "Reset", content: "- Walk", path });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(new RegExp(`already has a page at /${path}.*replace: true`));
    }
    let pages = await listPages(siteId);
    expect(pages.find((p) => p.slug === "thank-you")!.content).toEqual(thanksBefore.content);
    expect(pages.find((p) => p.slug === "about")!.content.sections).toMatchObject([{ title: "Hi, I'm Sam" }]);
    expect((await getSite(ws.id, siteId))!.leadMagnetUrl).toBe("");

    // A custom page that isn't the linked checklist is left alone too.
    await call(ws.id, "create_page", { siteId, path: "guide", title: "Old guide", sections: [{ type: "text", title: "Old", body: "Old" }] });
    expect((await call(ws.id, "set_lead_magnet", { siteId, name: "Reset", content: "- Walk" })).isError).toBe(true);

    // The owner asked: replace it.
    const replaced = await call(ws.id, "set_lead_magnet", { siteId, name: "Reset", content: "- Walk", path: "about", replace: true });
    expect(replaced.isError).toBe(false);
    pages = await listPages(siteId);
    expect(pages.find((p) => p.slug === "about")!.content.sections).toMatchObject([{ title: "Reset", body: "- Walk" }]);
    // Now it's the checklist page, so writing it again needs no replace.
    expect((await call(ws.id, "set_lead_magnet", { siteId, name: "Reset 2", content: "- Run", path: "about" })).isError).toBe(false);
  });
});

describe("connector: email sequences", () => {
  it("rewrites the welcome emails in place and keeps them on, like the launch kit", async () => {
    const { ws } = await makeWorkspace();
    const list = (await call(ws.id, "list_email_sequences")).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ trigger: "lead_created", on: true, startsWhen: "someone becomes a lead" });
    expect(list[0].emails.map((e: { day: number }) => e.day)).toEqual([0, 1, 3]);
    const { sequenceId } = list[0];

    const emails = [
      { day: 3, subject: "Still thinking about it?", body: "Hey {{first_name}},\n\nCome and look: {{skool_url}}\n\nSam" },
      { day: 0, subject: "Here's your 7-Day Dad Reset", body: "Hey {{first_name}},\n\nHere it is: [7-Day Dad Reset]({{lead_magnet_url}})\n\nSam" },
      { day: 1, subject: "The #1 mistake", body: "Hey {{first_name}},\n\nOne thing at a time.\n\nSam" },
    ];
    const saved = await call(ws.id, "upsert_email_sequence", { sequenceId, emails });
    expect(saved.isError).toBe(false);
    expect(saved.json()).toMatchObject({ created: false, on: true, sequenceId });
    expect(saved.json().warning).toBeUndefined();

    const full = (await getSequenceWithSteps(ws.id, sequenceId))!;
    expect(full.active).toBe(true);
    // In the order they send, days stored as minutes like the Emails screen.
    expect(full.steps.map((s) => [s.position, s.delayMinutes, s.subject])).toEqual([
      [0, 0, "Here's your 7-Day Dad Reset"],
      [1, 1440, "The #1 mistake"],
      [2, 4320, "Still thinking about it?"],
    ]);
    const got = (await call(ws.id, "get_email_sequence", { sequenceId })).json();
    expect(got.emails[0]).toMatchObject({ day: 0, body: expect.stringContaining("{{lead_magnet_url}}") });
  });

  it("makes new sequences switched off unless asked, and checks the trigger", async () => {
    const { ws } = await makeWorkspace();
    const one = [{ day: 0, subject: "Hi", body: "Hello {{first_name}}" }];
    const draft = await call(ws.id, "upsert_email_sequence", { name: "Webinar follow-up", trigger: "tag_added", triggerValue: "Webinar", emails: one });
    expect(draft.json()).toMatchObject({ created: true, on: false, trigger: "tag_added", triggerValue: "webinar", name: "Webinar follow-up" });
    expect(draft.json().review).toContain("/emails/sequences/");

    expect((await call(ws.id, "upsert_email_sequence", { trigger: "tag_added", emails: one })).text).toMatch(/needs its tag/);
    expect((await call(ws.id, "upsert_email_sequence", { trigger: "lead_created", triggerValue: "not-a-site", emails: one })).isError).toBe(true);
    expect((await call(ws.id, "upsert_email_sequence", { emails: [] })).isError).toBe(true);
    expect((await call(ws.id, "upsert_email_sequence", { sequenceId: "00000000-0000-4000-8000-000000000000", emails: one })).text).toMatch(/Sequence not found/);

    // Switched on at the owner's word: a second welcome sequence warns that leads would get both.
    const on = await call(ws.id, "upsert_email_sequence", { emails: one, active: true });
    expect(on.json()).toMatchObject({ created: true, on: true, trigger: "lead_created", name: "Lead magnet follow-up" });
    expect(on.json().warning).toMatch(/get both/);
    expect((await listSequences(ws.id)).length).toBe(3);

    // A rewrite keeps the owner's off switch.
    const again = await call(ws.id, "upsert_email_sequence", { sequenceId: draft.json().sequenceId, emails: [...one, { day: 2, subject: "Two", body: "Second" }] });
    expect(again.json()).toMatchObject({ on: false, trigger: "tag_added", triggerValue: "webinar" });

    // Another workspace can't read or write it.
    const other = await makeWorkspace();
    expect((await call(other.ws.id, "get_email_sequence", { sequenceId: draft.json().sequenceId })).isError).toBe(true);
    expect((await call(other.ws.id, "upsert_email_sequence", { sequenceId: draft.json().sequenceId, emails: one })).isError).toBe(true);
  });
});

describe("Day 1 with Claude playbook", () => {
  it("walks through the website, checklist, emails and About page with the new tools", () => {
    const p = playbookByName("day_1_with_claude")!;
    expect(p.title).toBe("Day 1 with Claude");
    for (const tool of ["create_site", "update_page", "set_lead_magnet", "upsert_email_sequence", "list_email_sequences", "publish_site"]) expect(p.steps).toContain(tool);
    expect(p.steps).toMatch(/About page/);
    // Built from the premium template, and the line the member says asks for it.
    expect(p.say).toMatch(/^Build my website from the premium template/);
    expect(p.steps).toContain('template "premium"');
    // The free checklist is built on one of the owner's two frameworks, the domino by default.
    expect(p.steps).toMatch(/The domino \(the default\): solve one insanely valuable problem/);
    expect(p.steps).toMatch(/Go wide: speak to the widest group of people/);
    expect(PLAYBOOKS.slice(0, 2).map((x) => x.name)).toEqual(["monday_check_in", "make_my_5_statics"]);
  });
});
