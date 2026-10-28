import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AutomationAction,
  AutomationTrigger,
  BrandSettings,
  CampaignAudience,
  PageContent,
  SiteTheme,
  WorkspaceSettings,
} from "./types";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const emptyTextArray = sql`'{}'::text[]`;

// ---------------------------------------------------------------------------
// Tenancy: platform -> agency -> workspace (sub-account)
// ---------------------------------------------------------------------------

export type AgencyPlan = "platform" | "none" | "agency";
export type DomainStatus = "none" | "pending" | "verified" | "error";
export type AgencyStatus = "active" | "paused";

export const agencies = pgTable("agencies", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isPlatform: boolean("is_platform").notNull().default(false),
  plan: text("plan").$type<AgencyPlan>().notNull().default("none"),
  status: text("status").$type<AgencyStatus>().notNull().default("active"),
  brand: jsonb("brand").$type<BrandSettings>().notNull().default({}),
  appDomain: text("app_domain").unique(),
  appDomainStatus: text("app_domain_status").$type<DomainStatus>().notNull().default("none"),
  markupPercent: integer("markup_percent").notNull().default(30),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the cookie token
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export type AgencyRole = "owner" | "admin";
export const agencyMembers = pgTable(
  "agency_members",
  {
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<AgencyRole>().notNull().default("admin"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.agencyId, t.userId] })],
);

export type WorkspacePlan = "starter" | "growth";
export type WorkspaceStatus = "active" | "grace" | "paused";
export type AccessSource = "skool_code" | "skool_zapier" | "stripe" | "agency" | "admin";

export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    plan: text("plan").$type<WorkspacePlan>().notNull().default("starter"),
    status: text("status").$type<WorkspaceStatus>().notNull().default("active"),
    accessSource: text("access_source").$type<AccessSource>().notNull().default("skool_code"),
    accessVerifiedUntil: ts("access_verified_until"),
    graceEndsAt: ts("grace_ends_at"),
    pausedAt: ts("paused_at"),
    // Why a workspace is paused: only "access" pauses lift when a member code is entered.
    pauseReason: text("pause_reason").$type<"access" | "admin" | "agency">(),
    settings: jsonb("settings").$type<WorkspaceSettings>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("workspaces_agency_idx").on(t.agencyId)],
);

export type WorkspaceRole = "owner" | "admin" | "user";
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull().default("user"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("workspace_members_user_idx").on(t.userId)],
);

// Monthly member codes posted inside the Skool classroom.
export const accessCodes = pgTable("access_codes", {
  id: id(),
  code: text("code").notNull().unique(),
  label: text("label").notNull().default(""),
  validFrom: ts("valid_from").notNull(),
  validUntil: ts("valid_until").notNull(),
  createdAt: createdAt(),
});

// Emails pre-approved by the Skool -> Zapier "New Paid Member" webhook.
export const skoolApprovals = pgTable("skool_approvals", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  approvedUntil: ts("approved_until").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Sites and pages
// ---------------------------------------------------------------------------

export const sites = pgTable(
  "sites",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    customDomain: text("custom_domain").unique(),
    domainStatus: text("domain_status").$type<DomainStatus>().notNull().default("none"),
    theme: jsonb("theme").$type<SiteTheme>().notNull(),
    skoolUrl: text("skool_url").notNull().default(""),
    leadMagnetName: text("lead_magnet_name").notNull().default(""),
    leadMagnetUrl: text("lead_magnet_url").notNull().default(""),
    published: boolean("published").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sites_workspace_idx").on(t.workspaceId)],
);

export type PageKind = "optin" | "thankyou" | "sales" | "custom";

export const pages = pgTable(
  "pages",
  {
    id: id(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().default(""),
    title: text("title").notNull(),
    kind: text("kind").$type<PageKind>().notNull().default("custom"),
    content: jsonb("content").$type<PageContent>().notNull(),
    publishedContent: jsonb("published_content").$type<PageContent>(),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("pages_site_slug_uq").on(t.siteId, t.slug)],
);

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export type ContactSource = "landing_page" | "facebook" | "instagram" | "whatsapp" | "sms" | "email" | "import" | "manual";
export type Temperature = "hot" | "warm" | "cold";
export type Stage = "new" | "engaged" | "trial" | "member" | "lost";

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email"),
    phone: text("phone"),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    source: text("source").$type<ContactSource>().notNull().default("manual"),
    sourceRef: text("source_ref"),
    tags: text("tags").array().notNull().default(emptyTextArray),
    score: integer("score").notNull().default(0),
    temperature: text("temperature").$type<Temperature>().notNull().default("cold"),
    scoreReason: text("score_reason").notNull().default(""),
    stage: text("stage").$type<Stage>().notNull().default("new"),
    unsubscribed: boolean("unsubscribed").notNull().default(false),
    notes: text("notes").notNull().default(""),
    channelIds: jsonb("channel_ids").$type<{ facebook?: string; instagram?: string; whatsapp?: string }>().notNull().default({}),
    lastActivityAt: ts("last_activity_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("contacts_workspace_idx").on(t.workspaceId, t.createdAt),
    uniqueIndex("contacts_workspace_email_uq").on(t.workspaceId, t.email).where(sql`${t.email} is not null`),
  ],
);

// Timeline + analytics events (page views, leads, emails, messages...).
export const activities = pgTable(
  "activities",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    refId: text("ref_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("activities_workspace_type_idx").on(t.workspaceId, t.type, t.createdAt),
    index("activities_contact_idx").on(t.contactId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Email: sequences, campaigns, outbox
// ---------------------------------------------------------------------------

export type SequenceTrigger = "lead_created" | "tag_added" | "manual";

export const emailSequences = pgTable("email_sequences", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trigger: text("trigger").$type<SequenceTrigger>().notNull().default("lead_created"),
  triggerValue: text("trigger_value").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const emailSequenceSteps = pgTable(
  "email_sequence_steps",
  {
    id: id(),
    sequenceId: uuid("sequence_id").notNull().references(() => emailSequences.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    delayMinutes: integer("delay_minutes").notNull().default(0),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sequence_steps_seq_idx").on(t.sequenceId, t.position)],
);

export type EnrollmentStatus = "active" | "completed" | "stopped";
export const emailEnrollments = pgTable(
  "email_enrollments",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id").notNull().references(() => emailSequences.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    nextPosition: integer("next_position").notNull().default(0),
    status: text("status").$type<EnrollmentStatus>().notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("enrollments_seq_contact_uq").on(t.sequenceId, t.contactId)],
);

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent";
export const emailCampaigns = pgTable("email_campaigns", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  audience: jsonb("audience").$type<CampaignAudience>().notNull().default({}),
  status: text("status").$type<CampaignStatus>().notNull().default("draft"),
  scheduledAt: ts("scheduled_at"),
  sentAt: ts("sent_at"),
  recipients: integer("recipients").notNull().default(0),
  createdAt: createdAt(),
});

export type EmailStatus = "queued" | "sent" | "failed" | "skipped";
export const emailMessages = pgTable(
  "email_messages",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    provider: text("provider").notNull().default("console"),
    providerMessageId: text("provider_message_id"),
    // null = not billed yet; 0 = covered by the plan allowance; >0 = charged to the wallet
    billedMicros: bigint("billed_micros", { mode: "number" }),
    status: text("status").$type<EmailStatus>().notNull().default("queued"),
    error: text("error"),
    campaignId: uuid("campaign_id"),
    sequenceStepId: uuid("sequence_step_id"),
    sentAt: ts("sent_at"),
    createdAt: createdAt(),
  },
  (t) => [index("email_messages_workspace_idx").on(t.workspaceId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Inbox: channels, conversations, messages
// ---------------------------------------------------------------------------

export type ChannelKind = "facebook_page" | "instagram" | "whatsapp" | "sms";
export type ConversationChannel = "facebook" | "instagram" | "whatsapp" | "sms" | "email";

export const channelConnections = pgTable(
  "channel_connections",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ChannelKind>().notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull().default(""),
    accessTokenEnc: text("access_token_enc"),
    meta: jsonb("meta").$type<Record<string, string>>().notNull().default({}),
    status: text("status").$type<"active" | "error" | "disconnected">().notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("channel_kind_external_uq").on(t.kind, t.externalId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    channel: text("channel").$type<ConversationChannel>().notNull(),
    connectionId: uuid("connection_id").references(() => channelConnections.id, { onDelete: "set null" }),
    externalThreadId: text("external_thread_id").notNull(),
    status: text("status").$type<"open" | "closed">().notNull().default("open"),
    unread: integer("unread").notNull().default(0),
    lastMessageAt: ts("last_message_at"),
    lastInboundAt: ts("last_inbound_at"),
    lastMessagePreview: text("last_message_preview").notNull().default(""),
    suggestedReply: text("suggested_reply"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("conversations_thread_uq").on(t.workspaceId, t.channel, t.externalThreadId),
    index("conversations_workspace_idx").on(t.workspaceId, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"in" | "out">().notNull(),
    body: text("body").notNull(),
    externalId: text("external_id"),
    status: text("status").$type<"received" | "sent" | "delivered" | "read" | "failed">().notNull(),
    error: text("error"),
    sentByUserId: uuid("sent_by_user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("messages_external_uq").on(t.workspaceId, t.externalId).where(sql`${t.externalId} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

export const automations = pgTable("automations", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trigger: jsonb("trigger").$type<AutomationTrigger>().notNull(),
  actions: jsonb("actions").$type<AutomationAction[]>().notNull().default([]),
  active: boolean("active").notNull().default(false),
  runsCount: integer("runs_count").notNull().default(0),
  createdAt: createdAt(),
});

export type RunStatus = "running" | "waiting" | "completed" | "failed";
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    stepIndex: integer("step_index").notNull().default(0),
    status: text("status").$type<RunStatus>().notNull().default("running"),
    log: jsonb("log").$type<{ at: string; step: number; message: string }[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("automation_runs_automation_idx").on(t.automationId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Social planner
// ---------------------------------------------------------------------------

export type SocialStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";
export const socialPosts = pgTable("social_posts", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  connectionIds: text("connection_ids").array().notNull().default(emptyTextArray),
  caption: text("caption").notNull().default(""),
  mediaUrl: text("media_url").notNull().default(""),
  scheduledAt: ts("scheduled_at"),
  status: text("status").$type<SocialStatus>().notNull().default("draft"),
  results: jsonb("results").$type<Record<string, { ok: boolean; id?: string; error?: string }>>().notNull().default({}),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// AI generations (launch kits, scores, replies, ad reviews)
// ---------------------------------------------------------------------------

export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"launch_kit" | "lead_score" | "reply_draft" | "ad_review">().notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_generations_workspace_idx").on(t.workspaceId, t.kind, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Wallet, usage and subscriptions
// ---------------------------------------------------------------------------

export type WalletOwner = "workspace" | "agency";
export const wallets = pgTable(
  "wallets",
  {
    id: id(),
    ownerType: text("owner_type").$type<WalletOwner>().notNull(),
    ownerId: uuid("owner_id").notNull(),
    balanceMicros: bigint("balance_micros", { mode: "number" }).notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("wallets_owner_uq").on(t.ownerType, t.ownerId)],
);

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: id(),
    walletId: uuid("wallet_id").notNull().references(() => wallets.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id"),
    type: text("type").$type<"topup" | "usage" | "adjustment" | "refund">().notNull(),
    unit: text("unit"),
    quantity: integer("quantity").notNull().default(1),
    amountMicros: bigint("amount_micros", { mode: "number" }).notNull(),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    description: text("description").notNull().default(""),
    externalRef: text("external_ref").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("wallet_tx_wallet_idx").on(t.walletId, t.createdAt)],
);

// Monthly included usage per workspace (AI generations, emails...).
export const usageCounters = pgTable(
  "usage_counters",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    unit: text("unit").notNull(),
    period: text("period").notNull(), // YYYY-MM
    used: integer("used").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.unit, t.period] })],
);

export const subscriptions = pgTable("subscriptions", {
  id: id(),
  ownerType: text("owner_type").$type<WalletOwner>().notNull(),
  ownerId: uuid("owner_id").notNull(),
  plan: text("plan").$type<"growth" | "agency">().notNull(),
  provider: text("provider").notNull().default("stripe"),
  externalId: text("external_id").notNull().unique(),
  customerId: text("customer_id"),
  status: text("status").notNull(),
  currentPeriodEnd: ts("current_period_end"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Templates (snapshots)
// ---------------------------------------------------------------------------

export const templates = pgTable("templates", {
  id: id(),
  agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  data: jsonb("data").$type<import("./types").TemplateData>().notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Background jobs + webhook log
// ---------------------------------------------------------------------------

export type JobStatus = "pending" | "running" | "done" | "failed";
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    runAt: ts("run_at").notNull().defaultNow(),
    status: text("status").$type<JobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lastError: text("last_error"),
    lockedAt: ts("locked_at"),
    dedupeKey: text("dedupe_key").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_due_idx").on(t.status, t.runAt)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    source: text("source").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    processedAt: ts("processed_at"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_events_source_idx").on(t.source, t.createdAt)],
);
