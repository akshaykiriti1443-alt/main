import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, automationRuns, contacts, opportunities, pipelines, pipelineStages } from "@/lib/db/schema";
import { parseCsv } from "@/lib/csv";
import {
  buildRecords,
  guessContactMapping,
  guessKind,
  guessOpportunityMapping,
  normalizeContact,
  parseImportDate,
  parseMoneyToCents,
  splitTags,
  type ContactField,
  type OpportunityField,
} from "@/lib/crmImport";
import { importContactRecords, importOpportunityRecords } from "@/server/crmImport";
import { makeWorkspace } from "./helpers";

// Shaped like GoHighLevel's Contacts export (Contacts › Export).
const GHL_CONTACTS = [
  "﻿Contact Id,First Name,Last Name,Name,Phone,Email,Business Name,Created,Last Activity,Tags,Source,DND",
  'abc123,Jamie,Doyle,Jamie Doyle,+1 (555) 201-3344,Jamie@Example.com,"Doyle Fitness, LLC",2024-03-15T10:22:33Z,2024-05-01T08:00:00Z,"lead, facebook ad, VIP",Facebook Lead Form,false',
  'def456,Priya,Nair,Priya Nair,555-201-9988,,,Mar 2 2024 9:15 AM,,"skool, webinar",Webinar signup,false',
  "ghi789,,,Sofia Alvarez,,sofia@example.com,,03/04/2024,,,,true",
  "jkl000,Bad,Row,,,,,,,,,",
  "dup111,Jamie,D,,,jamie@example.com,,,,returning,,",
  "phone222,Pri,N,,+15552019988,priya@example.com,,,,,,",
  "",
].join("\r\n");

// Shaped like GoHighLevel's Opportunities export.
const GHL_OPPS = [
  "Opportunity Name,Contact Name,phone,email,pipeline,stage,Lead Value,source,assigned,Created on,Updated on,lost reason ID,lost reason name,Followers,Notes,tags,Engagement Score,status,Opportunity ID,Contact ID,Pipeline Stage ID,Pipeline ID,Days Since Last Stage Change,Days Since Last Status Change,Days Since Last Updated",
  'Jamie - Coaching,Jamie Doyle,+15552013344,jamie@example.com,Coaching Funnel,Discovery Call,"$1,500.00",Facebook,Sam,2024-04-01 10:00:00,2024-04-10 12:00:00,,,,Wants 1:1 help,vip,12,open,opp_1,abc123,st1,p1,3,3,3',
  "New Person,New Person,,new@example.com,Coaching Funnel,Closed Won,2000,Referral,,2024-04-02,2024-04-20,,,,,,,won,opp_2,xyz,st2,p1,1,1,1",
  "Sales deal,Priya Nair,555-201-9988,,,,750,,,,,,,,,,,open,opp_3,,,,,,",
].join("\n");

describe("CSV reading", () => {
  it("handles quotes, commas and line breaks inside cells, BOM and CRLF", () => {
    const { headers, rows } = parseCsv('﻿Name,Notes\r\n"Doe, Jane","Line one\nline ""two"""\r\n\r\nBob,\r\n');
    expect(headers).toEqual(["Name", "Notes"]);
    expect(rows).toEqual([
      ["Doe, Jane", 'Line one\nline "two"'],
      ["Bob", ""],
    ]);
  });
  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("Email;Phone\na@b.co;123").rows[0]).toEqual(["a@b.co", "123"]);
    expect(parseCsv("Email\tPhone\na@b.co\t123").rows[0]).toEqual(["a@b.co", "123"]);
  });
});

describe("import mapping", () => {
  it("maps a GHL contacts export and sends unknown columns to notes", () => {
    const { headers } = parseCsv(GHL_CONTACTS);
    expect(guessKind(headers)).toBe("contacts");
    const m = guessContactMapping(headers);
    expect(Object.fromEntries(headers.map((h, i) => [h, m[i]]))).toEqual({
      "Contact Id": "notes",
      "First Name": "first_name",
      "Last Name": "last_name",
      Name: "full_name",
      Phone: "phone",
      Email: "email",
      "Business Name": "notes",
      Created: "created_at",
      "Last Activity": "notes",
      Tags: "tags",
      Source: "source",
      DND: "unsubscribed",
    });
  });
  it("maps a GHL opportunities export and drops GHL housekeeping columns", () => {
    const { headers } = parseCsv(GHL_OPPS);
    expect(guessKind(headers)).toBe("opportunities");
    const guess = guessOpportunityMapping(headers);
    const m = Object.fromEntries(headers.map((h, i) => [h, guess[i]]));
    expect(m).toMatchObject({
      "Opportunity Name": "title",
      "Contact Name": "contact_name",
      phone: "phone",
      email: "email",
      pipeline: "pipeline",
      stage: "stage",
      "Lead Value": "value",
      status: "status",
      "Opportunity ID": "external_id",
      "Created on": "created_at",
      "Updated on": "updated_at",
      tags: "tags",
      Notes: "notes",
      "Contact ID": "skip",
      "Pipeline ID": "skip",
      "Days Since Last Stage Change": "days_in_stage",
      "Days Since Last Updated": "skip",
    });
  });
  it("parses money, dates and tags the way exports write them", () => {
    expect(parseMoneyToCents("$1,500.00")).toBe(150000);
    expect(parseMoneyToCents("1.500,50 €")).toBe(150050);
    expect(parseMoneyToCents("750")).toBe(75000);
    expect(parseMoneyToCents("")).toBe(0);
    expect(parseImportDate("2024-03-15T10:22:33Z")).toBe("2024-03-15T10:22:33.000Z");
    expect(parseImportDate("Mar 2 2024 9:15 AM")).toBe("2024-03-02T09:15:00.000Z");
    expect(parseImportDate("03/04/2024")).toBe("2024-03-04T00:00:00.000Z");
    expect(parseImportDate("25/12/2023")).toBe("2023-12-25T00:00:00.000Z");
    expect(parseImportDate("15 Jan 2025")).toBe("2025-01-15T00:00:00.000Z");
    expect(parseImportDate("not a date")).toBeNull();
    expect(parseImportDate("2099-01-01")).toBeNull();
    expect(splitTags("lead, Facebook Ad;VIP|vip")).toEqual(["lead", "facebook ad", "vip"]);
  });
  it("cleans a row: first email kept, the rest noted, full name split, DND read", () => {
    const c = normalizeContact({ row: 2, fields: { full_name: "Ana Maria Lopez", email: "ana@x.com, ana2@x.com", unsubscribed: "Yes" }, extras: [["Company", "Acme"]] }, { tag: "imported" });
    expect(c).toMatchObject({ email: "ana@x.com", firstName: "Ana", lastName: "Maria Lopez", unsubscribed: true, tags: ["imported"] });
    expect("noteLines" in c && c.noteLines).toEqual(["Company: Acme", "Other email: ana2@x.com"]);
    expect(normalizeContact({ row: 3, fields: { first_name: "No", email: "nope" }, extras: [] })).toEqual({ row: 3, reason: "Email isn't valid and there's no phone" });
  });
});

describe("importing contacts", () => {
  it("imports a GHL export, dedupes by email then phone, and never fires automations", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const db = await getDb();
    const { headers, rows } = parseCsv(GHL_CONTACTS);
    const records = buildRecords<ContactField>(headers, rows, guessContactMapping(headers));
    const first = await importContactRecords(ws.id, records, { tag: "ghl-import", fileName: "contacts.csv" });
    expect(first.created).toBe(3);
    expect(first.updated).toBe(0);
    expect(first.merged).toBe(2);
    expect(first.skipped).toEqual([{ row: 5, reason: "No email or phone" }]);

    const all = await db.select().from(contacts).where(eq(contacts.workspaceId, ws.id));
    expect(all).toHaveLength(3);
    const jamie = all.find((c) => c.email === "jamie@example.com")!;
    expect(jamie).toMatchObject({ firstName: "Jamie", lastName: "Doyle", phone: "+15552013344", source: "facebook" });
    expect(jamie.tags.sort()).toEqual(["facebook ad", "ghl-import", "lead", "returning", "vip"]);
    expect(jamie.createdAt.toISOString()).toBe("2024-03-15T10:22:33.000Z");
    expect(jamie.notes).toContain("Business Name: Doyle Fitness, LLC");
    expect(jamie.notes).toContain("Contact Id: abc123");
    // Priya came in with a phone only, then the same phone with an email: one contact.
    const priya = all.find((c) => c.firstName === "Priya")!;
    expect(priya).toMatchObject({ email: "priya@example.com", phone: "5552019988", lastName: "Nair" });
    expect(priya.notes).toContain("Source: Webinar signup");
    const sofia = all.find((c) => c.email === "sofia@example.com")!;
    expect(sofia).toMatchObject({ firstName: "Sofia", lastName: "Alvarez", unsubscribed: true });
    const timeline = await db.select().from(activities).where(and(eq(activities.contactId, jamie.id), eq(activities.type, "imported")));
    expect(timeline).toHaveLength(1);
    expect(await db.select().from(automationRuns).where(eq(automationRuns.workspaceId, ws.id))).toHaveLength(0);

    // The same file again: nothing new, and notes aren't repeated.
    const again = await importContactRecords(ws.id, records, { tag: "ghl-import", fileName: "contacts.csv" });
    expect(again.created).toBe(0);
    expect(again.updated).toBe(3);
    expect(again.merged).toBe(2);
    const [j2] = await db.select().from(contacts).where(eq(contacts.id, jamie.id));
    expect(j2.notes.match(/Business Name/g)).toHaveLength(1);
  });

  it("doesn't merge two people who share a phone but have different emails", async () => {
    const { ws } = await makeWorkspace();
    const r = await importContactRecords(ws.id, [
      { row: 2, fields: { email: "mum@example.com", phone: "+44 7700 900123" }, extras: [] },
      { row: 3, fields: { email: "kid@example.com", phone: "07700900123" }, extras: [] },
    ]);
    expect(r.created).toBe(2);
  });
});

describe("importing opportunities", () => {
  it("creates missing pipelines and stages from a GHL export and links contacts", async () => {
    const { ws } = await makeWorkspace({ plan: "growth" });
    const db = await getDb();
    const c = parseCsv(GHL_CONTACTS);
    await importContactRecords(ws.id, buildRecords<ContactField>(c.headers, c.rows, guessContactMapping(c.headers)));
    const { headers, rows } = parseCsv(GHL_OPPS);
    const records = buildRecords<OpportunityField>(headers, rows, guessOpportunityMapping(headers));
    const r = await importOpportunityRecords(ws.id, records, { currency: "USD", fileName: "opportunities.csv" });
    expect(r).toMatchObject({ created: 3, updated: 0, contactsCreated: 1, pipelinesCreated: ["Coaching Funnel"] });
    expect(r.stagesCreated).toEqual(["Coaching Funnel › Discovery Call", "Coaching Funnel › Closed Won"]);

    const ps = await db.select().from(pipelines).where(eq(pipelines.workspaceId, ws.id));
    expect(ps.map((p) => p.name).sort()).toEqual(["Coaching Funnel", "Sales"]);
    const coaching = ps.find((p) => p.name === "Coaching Funnel")!;
    const stages = await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, coaching.id));
    expect(stages.sort((a, b) => a.position - b.position).map((s) => [s.name, s.kind])).toEqual([
      ["Discovery Call", "open"],
      ["Closed Won", "won"],
    ]);
    const deals = await db.select().from(opportunities).where(eq(opportunities.workspaceId, ws.id));
    const jamieDeal = deals.find((d) => d.externalId === "opp_1")!;
    expect(jamieDeal).toMatchObject({ title: "Jamie - Coaching", valueCents: 150000, status: "open", source: "Facebook" });
    expect(jamieDeal.notes).toContain("Notes: Wants 1:1 help");
    expect(jamieDeal.notes).toContain("assigned: Sam");
    expect(Math.round((Date.now() - jamieDeal.stageChangedAt.getTime()) / 86_400_000)).toBe(3);
    const [jamie] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, ws.id), eq(contacts.email, "jamie@example.com")));
    expect(jamieDeal.contactId).toBe(jamie.id);
    const won = deals.find((d) => d.externalId === "opp_2")!;
    expect(won.status).toBe("won");
    expect(won.closedAt?.toISOString()).toBe("2024-04-20T00:00:00.000Z");
    // No pipeline in the row: the default pipeline's first stage, and Priya matched by phone.
    const sales = ps.find((p) => p.name === "Sales")!;
    const priyaDeal = deals.find((d) => d.externalId === "opp_3")!;
    expect(priyaDeal.pipelineId).toBe(sales.id);
    const [priya] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, ws.id), eq(contacts.email, "priya@example.com")));
    expect(priyaDeal.contactId).toBe(priya.id);

    const again = await importOpportunityRecords(ws.id, records, { currency: "USD" });
    expect(again).toMatchObject({ created: 0, updated: 3, contactsCreated: 0, pipelinesCreated: [], stagesCreated: [] });
  });
});
