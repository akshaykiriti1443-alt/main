// Turning a contacts or opportunities CSV (GoHighLevel's exports, or anything from Excel/Sheets)
// into clean records. Pure and client-safe: the import page uses it for the preview, and the
// server runs the same functions again on what it receives, so the preview never lies.

export type ImportKind = "contacts" | "opportunities";

export type ContactField =
  | "first_name"
  | "last_name"
  | "full_name"
  | "email"
  | "phone"
  | "tags"
  | "source"
  | "created_at"
  | "unsubscribed"
  | "notes"
  | "skip";

export type OpportunityField =
  | "title"
  | "contact_name"
  | "email"
  | "phone"
  | "pipeline"
  | "stage"
  | "value"
  | "status"
  | "source"
  | "created_at"
  | "updated_at"
  | "external_id"
  | "days_in_stage"
  | "tags"
  | "notes"
  | "skip";

export const CONTACT_FIELDS: { value: ContactField; label: string }[] = [
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "full_name", label: "Full name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "tags", label: "Tags" },
  { value: "source", label: "Source" },
  { value: "created_at", label: "Date added" },
  { value: "unsubscribed", label: "Do not email (DND)" },
  { value: "notes", label: "Add to notes" },
  { value: "skip", label: "Don't import" },
];

export const OPPORTUNITY_FIELDS: { value: OpportunityField; label: string }[] = [
  { value: "title", label: "Deal name" },
  { value: "contact_name", label: "Contact name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "pipeline", label: "Pipeline" },
  { value: "stage", label: "Stage" },
  { value: "value", label: "Value" },
  { value: "status", label: "Status" },
  { value: "source", label: "Source" },
  { value: "created_at", label: "Date created" },
  { value: "updated_at", label: "Last updated" },
  { value: "external_id", label: "Deal ID (for re-imports)" },
  { value: "days_in_stage", label: "Days in current stage" },
  { value: "tags", label: "Tags" },
  { value: "notes", label: "Add to notes" },
  { value: "skip", label: "Don't import" },
];

/** Header text -> a comparable key: "First Name" / "first_name" / "FirstName" -> "firstname". */
export const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

// Known header spellings (GHL, HubSpot, Mailchimp, Skool, Calendly, Google contacts, Excel).
const CONTACT_SYNONYMS: Record<Exclude<ContactField, "notes" | "skip">, string[]> = {
  first_name: ["firstname", "first", "givenname", "fname", "contactfirstname"],
  last_name: ["lastname", "last", "surname", "familyname", "lname", "contactlastname"],
  full_name: ["name", "fullname", "contactname", "contact", "displayname", "yourname"],
  email: ["email", "emailaddress", "email1", "primaryemail", "mail", "e-mail", "emailid", "contactemail"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "mobilenumber", "cell", "cellphone", "telephone", "tel", "whatsapp", "primaryphone", "phone1", "contactphone"],
  tags: ["tags", "tag", "labels", "label", "lists"],
  source: ["source", "leadsource", "contactsource", "origin", "utmsource"],
  created_at: ["created", "createdat", "createdon", "datecreated", "dateadded", "added", "createddate", "signupdate", "subscribedat", "joined", "joinedat", "optintime"],
  unsubscribed: ["dnd", "donotdisturb", "donotcontact", "donotemail", "unsubscribed", "emailoptout", "optout", "dndemail"],
};

const OPPORTUNITY_SYNONYMS: Record<Exclude<OpportunityField, "notes" | "skip">, string[]> = {
  title: ["opportunityname", "opportunity", "dealname", "deal", "name", "title", "opportunitytitle"],
  contact_name: ["contactname", "contact", "fullname", "customer", "customername", "leadname"],
  email: ["email", "emailaddress", "contactemail"],
  phone: ["phone", "phonenumber", "mobile", "contactphone"],
  pipeline: ["pipeline", "pipelinename"],
  stage: ["stage", "pipelinestage", "stagename", "dealstage"],
  value: ["leadvalue", "value", "amount", "dealvalue", "monetaryvalue", "opportunityvalue", "price"],
  status: ["status", "opportunitystatus", "dealstatus"],
  source: ["source", "leadsource", "opportunitysource"],
  created_at: ["createdon", "created", "createdat", "datecreated", "dateadded"],
  updated_at: ["updatedon", "updated", "updatedat", "lastupdated", "datemodified", "closedate", "closedon"],
  external_id: ["opportunityid", "dealid", "id"],
  days_in_stage: ["dayssincelaststagechange", "daysinstage", "daysincurrentstage"],
  tags: ["tags", "tag"],
};

function guessFrom<F extends string>(headers: string[], synonyms: Record<string, string[]>, fallback: F): F[] {
  const used = new Set<string>();
  return headers.map((h) => {
    const k = headerKey(h);
    for (const [field, keys] of Object.entries(synonyms)) {
      if (used.has(field)) continue;
      if (keys.includes(k)) {
        used.add(field);
        return field as F;
      }
    }
    return fallback;
  });
}

/** Opportunities exports have a pipeline or stage column; contacts exports don't. */
export function guessKind(headers: string[]): ImportKind {
  const keys = new Set(headers.map(headerKey));
  const hits = ["opportunityname", "pipeline", "stage", "pipelinestage", "leadvalue", "opportunityid", "dealname"].filter((k) => keys.has(k));
  return hits.length >= 2 ? "opportunities" : "contacts";
}

/** One field per column. Columns we don't recognise go into notes, so nothing is lost. */
export function guessContactMapping(headers: string[]): ContactField[] {
  // A "Name" column next to First/Last stays mapped: it's only used when first and last are empty.
  return guessFrom<ContactField>(headers, CONTACT_SYNONYMS, "notes");
}

export function guessOpportunityMapping(headers: string[]): OpportunityField[] {
  const out = guessFrom<OpportunityField>(headers, OPPORTUNITY_SYNONYMS, "notes");
  // Housekeeping columns from GHL that only add noise to notes.
  headers.forEach((h, i) => {
    if (out[i] !== "notes") return;
    const k = headerKey(h);
    if (/^(contactid|pipelineid|pipelinestageid|followers|engagementscore|lostreasonid)$/.test(k) || k.startsWith("dayssince")) out[i] = "skip";
  });
  return out;
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

export function splitTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,;|]/)
        .map((t) => t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60))
        .filter(Boolean),
    ),
  ).slice(0, 30);
}

export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export const isImportEmail = (v: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(v.trim());

/** Keeps digits and a leading +. "(555) 123-4567" -> "5551234567"; "+44 7700 900123" -> "+447700900123". */
export function cleanPhone(v: string): string {
  const digits = v.replace(/[^\d+]/g, "");
  const out = digits.startsWith("+") ? `+${digits.slice(1).replace(/\+/g, "")}` : digits.replace(/\+/g, "");
  return out.replace(/\D/g, "").length >= 6 ? out : "";
}

/** The part of a phone number used to spot the same person: its last 10 digits. */
export const phoneKey = (v: string) => v.replace(/\D/g, "").slice(-10);

const TRUTHY = new Set(["1", "true", "yes", "y", "x", "dnd", "on", "unsubscribed", "opted out", "opt out"]);
export const isTruthyCell = (v: string) => TRUTHY.has(v.trim().toLowerCase());

/**
 * Money to cents. "$1,500.50" -> 150050, "1.500,50 €" -> 150050, "1500" -> 150000, "" -> 0.
 * The last "." or "," followed by 1-2 digits is the decimal point; the rest are thousands marks.
 */
export function parseMoneyToCents(raw: string): number {
  const s = raw.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return 0;
  const negative = s.startsWith("-");
  const body = s.replace(/-/g, "");
  const m = body.match(/^(.*?)[.,](\d{1,2})$/);
  const whole = (m ? m[1] : body).replace(/[.,]/g, "");
  const frac = m ? m[2].padEnd(2, "0") : "00";
  const cents = Number(whole || "0") * 100 + Number(frac);
  if (!Number.isFinite(cents)) return 0;
  return Math.min(Math.round(cents), 1e13) * (negative ? -1 : 1);
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const monthOf = (word: string): number | undefined => MONTHS[word.slice(0, 4).toLowerCase()] ?? MONTHS[word.slice(0, 3).toLowerCase()];

/**
 * A date from an export, as an ISO string (or null when it can't be read or is implausible).
 * Handles ISO, "YYYY-MM-DD HH:mm:ss", US "MM/DD/YYYY hh:mm AM" (GHL, Excel US), "DD/MM/YYYY" when
 * the day can't be a month, and "Mar 15 2024 10:22 AM" / "15 Mar 2024". Times without a zone are UTC.
 */
export function parseImportDate(raw: string, now = new Date()): string | null {
  const v = raw.trim();
  if (!v) return null;
  let d: Date | null = null;
  let m: RegExpMatchArray | null;
  const time = (rest: string | undefined) => {
    const t = (rest ?? "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i);
    if (!t) return [0, 0, 0];
    let h = Number(t[1]);
    const ap = t[4]?.toLowerCase().replace(/\./g, "");
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return [h, Number(t[2]), Number(t[3] ?? 0)];
  };
  if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](.*))?$/))) {
    if (m[4] && /[zZ]|[+-]\d{2}:?\d{2}$/.test(m[4])) d = new Date(v.replace(" ", "T"));
    else {
      const [h, mi, s] = time(m[4]);
      d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], h, mi, s));
    }
  } else if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(.*))?$/))) {
    let a = +m[1];
    let b = +m[2];
    // US order (month first) unless the first number can't be a month.
    if (a > 12 && b <= 12) [a, b] = [b, a];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const [h, mi, s] = time(m[4]);
    d = new Date(Date.UTC(y, a - 1, b, h, mi, s));
  } else if ((m = v.match(/^(?:[a-z]{3,9},?\s+)?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(.*)$/i)) && monthOf(m[1]) !== undefined) {
    const [h, mi, s] = time(m[4]);
    d = new Date(Date.UTC(+m[3], monthOf(m[1])!, +m[2], h, mi, s));
  } else if ((m = v.match(/^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})(.*)$/i)) && monthOf(m[2]) !== undefined) {
    const [h, mi, s] = time(m[4]);
    d = new Date(Date.UTC(+m[3], monthOf(m[2])!, +m[1], h, mi, s));
  } else if (/^\d{10,13}$/.test(v)) {
    d = new Date(v.length === 13 ? +v : +v * 1000);
  } else {
    const t = Date.parse(v);
    d = Number.isNaN(t) ? null : new Date(t);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  // Nothing before 1990 and nothing in the future (a day of slack for time zones).
  if (d.getTime() < Date.UTC(1990, 0, 1) || d.getTime() > now.getTime() + 86_400_000) return null;
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** One CSV row after mapping: the mapped fields, plus [header, value] pairs bound for notes. */
export type RawRecord<F extends string> = { row: number; fields: Partial<Record<F, string>>; extras: [string, string][] };

export function buildRecords<F extends string>(headers: string[], rows: string[][], mapping: F[], firstRowNumber = 2): RawRecord<F>[] {
  return rows.map((cells, r) => {
    const fields: Partial<Record<F, string>> = {};
    const extras: [string, string][] = [];
    mapping.forEach((field, i) => {
      const value = (cells[i] ?? "").trim();
      if (!value || field === "skip") return;
      if (field === "notes") extras.push([headers[i], value]);
      // Two columns mapped to the same field (Tags + Tags 2): join them.
      else fields[field] = fields[field] ? `${fields[field]}, ${value}` : value;
    });
    return { row: firstRowNumber + r, fields, extras };
  });
}

export type ContactSourceGuess = "facebook" | "instagram" | "whatsapp" | "sms" | "email" | "skool" | "landing_page" | "import";

/** Free-text sources ("Facebook Lead Form", "IG DM") to the CRM's source list. */
export function mapSource(raw: string): ContactSourceGuess {
  const s = raw.toLowerCase();
  if (/facebook|\bfb\b|meta/.test(s)) return "facebook";
  if (/instagram|\big\b/.test(s)) return "instagram";
  if (/whats ?app/.test(s)) return "whatsapp";
  if (/\bsms\b|text message/.test(s)) return "sms";
  if (/skool/.test(s)) return "skool";
  if (/funnel|landing|form|website|opt.?in/.test(s)) return "landing_page";
  if (/\bemail\b|newsletter/.test(s)) return "email";
  return "import";
}

export type CleanContact = {
  row: number;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  tags: string[];
  source: ContactSourceGuess;
  createdAt: string | null;
  unsubscribed: boolean;
  /** "Header: value" lines for the contact's notes. */
  noteLines: string[];
};

export type Skipped = { row: number; reason: string };

export function normalizeContact(rec: RawRecord<ContactField>, opts: { tag?: string; now?: Date } = {}): CleanContact | Skipped {
  const f = rec.fields;
  const noteLines = rec.extras.map(([h, v]) => `${h.slice(0, 80)}: ${v.slice(0, 1000)}`);
  // An email cell can hold several addresses ("a@x.com, b@x.com"): keep the first, note the rest.
  const emails = (f.email ?? "").split(/[,;\s]+/).filter(Boolean);
  const email = emails.find(isImportEmail)?.toLowerCase() ?? null;
  if (emails.length && !email) noteLines.push(`Email (not valid): ${(f.email ?? "").slice(0, 200)}`);
  for (const extra of emails.filter((e) => e.toLowerCase() !== email && isImportEmail(e))) noteLines.push(`Other email: ${extra}`);
  const phone = f.phone ? cleanPhone(f.phone.split(/[,;/]/)[0]) || null : null;
  let firstName = (f.first_name ?? "").slice(0, 80);
  let lastName = (f.last_name ?? "").slice(0, 80);
  if (!firstName && !lastName && f.full_name) {
    const n = splitFullName(f.full_name);
    firstName = n.firstName.slice(0, 80);
    lastName = n.lastName.slice(0, 80);
  }
  if (!email && !phone) return { row: rec.row, reason: emails.length ? "Email isn't valid and there's no phone" : "No email or phone" };
  const tags = splitTags([f.tags ?? "", opts.tag ?? ""].join(","));
  const sourceRaw = (f.source ?? "").trim();
  const source = sourceRaw ? mapSource(sourceRaw) : "import";
  if (sourceRaw && source === "import") noteLines.unshift(`Source: ${sourceRaw.slice(0, 200)}`);
  return {
    row: rec.row,
    email,
    phone,
    firstName,
    lastName,
    tags,
    source,
    createdAt: f.created_at ? parseImportDate(f.created_at, opts.now) : null,
    unsubscribed: f.unsubscribed ? isTruthyCell(f.unsubscribed) : false,
    noteLines: noteLines.slice(0, 40),
  };
}

export type CleanOpportunity = {
  row: number;
  title: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  pipeline: string;
  stage: string;
  valueCents: number;
  status: "open" | "won" | "lost" | "abandoned" | null;
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
  externalId: string | null;
  /** From GHL's "Days Since Last Stage Change": how long it has sat where it is. */
  daysInStage: number | null;
  tags: string[];
  noteLines: string[];
};

export function mapStatus(raw: string): CleanOpportunity["status"] {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/won|closed.?won|^win/.test(s)) return "won";
  if (/lost|closed.?lost/.test(s)) return "lost";
  if (/abandon/.test(s)) return "abandoned";
  if (/open|active|new|progress/.test(s)) return "open";
  return null;
}

export function normalizeOpportunity(rec: RawRecord<OpportunityField>, opts: { tag?: string; now?: Date } = {}): CleanOpportunity | Skipped {
  const f = rec.fields;
  const email = (f.email ?? "").split(/[,;\s]+/).find(isImportEmail)?.toLowerCase() ?? null;
  const phone = f.phone ? cleanPhone(f.phone) || null : null;
  const contactName = (f.contact_name ?? "").slice(0, 160);
  const title = (f.title || contactName || email || "").slice(0, 200);
  if (!title) return { row: rec.row, reason: "No deal name or contact" };
  const noteLines = rec.extras.map(([h, v]) => `${h.slice(0, 80)}: ${v.slice(0, 1000)}`);
  return {
    row: rec.row,
    title,
    contactName,
    email,
    phone,
    pipeline: (f.pipeline ?? "").trim().slice(0, 80),
    stage: (f.stage ?? "").trim().slice(0, 60),
    valueCents: f.value ? Math.max(0, parseMoneyToCents(f.value)) : 0,
    status: f.status ? mapStatus(f.status) : null,
    source: (f.source ?? "").slice(0, 200),
    createdAt: f.created_at ? parseImportDate(f.created_at, opts.now) : null,
    updatedAt: f.updated_at ? parseImportDate(f.updated_at, opts.now) : null,
    externalId: f.external_id ? f.external_id.trim().slice(0, 120) : null,
    daysInStage: f.days_in_stage && /^\d{1,5}$/.test(f.days_in_stage.trim()) ? Number(f.days_in_stage.trim()) : null,
    tags: splitTags([f.tags ?? "", opts.tag ?? ""].join(",")),
    noteLines: noteLines.slice(0, 40),
  };
}

export const isSkipped = (r: object): r is Skipped => "reason" in r;
