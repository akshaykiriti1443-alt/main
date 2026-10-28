import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db";
import {
  automations,
  emailSequences,
  emailSequenceSteps,
  workspaceMembers,
  workspaces,
  type AccessSource,
  type WorkspacePlan,
  type WorkspaceRole,
} from "@/lib/db/schema";
import type { WorkspaceSettings } from "@/lib/db/types";
import { shortId, slugify } from "@/lib/util";
import { DEFAULT_SEQUENCE, RESERVED_SLUGS } from "./defaults";
import { getOrCreateWallet } from "./wallet";

export async function uniqueWorkspaceSlug(name: string, db: DB) {
  const base = slugify(name, 30);
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 && !RESERVED_SLUGS.has(base) ? base : `${base}-${shortId(4)}`;
    const [hit] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, candidate)).limit(1);
    if (!hit) return candidate;
  }
  return `${base}-${shortId(8)}`;
}

export async function createWorkspace(input: {
  agencyId: string;
  name: string;
  ownerUserId?: string;
  ownerRole?: WorkspaceRole;
  plan?: WorkspacePlan;
  accessSource: AccessSource;
  accessVerifiedUntil?: Date | null;
  settings?: WorkspaceSettings;
  isPlatformAgency: boolean;
  withDefaults?: boolean;
}) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const slug = await uniqueWorkspaceSlug(input.name, tx);
    const [ws] = await tx
      .insert(workspaces)
      .values({
        agencyId: input.agencyId,
        name: input.name,
        slug,
        plan: input.plan ?? "starter",
        accessSource: input.accessSource,
        accessVerifiedUntil: input.accessVerifiedUntil ?? null,
        settings: input.settings ?? {},
      })
      .returning();
    if (input.ownerUserId) {
      await tx.insert(workspaceMembers).values({ workspaceId: ws.id, userId: input.ownerUserId, role: input.ownerRole ?? "owner" });
    }
    if (input.isPlatformAgency) await getOrCreateWallet("workspace", ws.id, tx);

    if (input.withDefaults !== false) {
      const [seq] = await tx
        .insert(emailSequences)
        .values({ workspaceId: ws.id, name: DEFAULT_SEQUENCE.name, trigger: "lead_created", active: true })
        .returning();
      await tx.insert(emailSequenceSteps).values(DEFAULT_SEQUENCE.steps.map((s) => ({ ...s, sequenceId: seq.id })));
      await tx.insert(automations).values({
        workspaceId: ws.id,
        name: "Hot lead alert",
        trigger: { type: "message_received", value: "" },
        actions: [
          { type: "ai_score" },
          { type: "only_if_temperature", temperature: "hot" },
          { type: "add_tag", tag: "hot-lead" },
          { type: "ai_draft_reply" },
          { type: "notify_owner", message: "A hot lead just messaged you. Your AI reply draft is ready in the inbox." },
        ],
        active: (input.plan ?? "starter") === "growth",
      });
    }
    return ws;
  });
}

export async function updateWorkspaceSettings(workspaceId: string, patch: Partial<WorkspaceSettings>) {
  const db = await getDb();
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const settings = { ...(ws?.settings ?? {}), ...patch };
  await db.update(workspaces).set({ settings }).where(eq(workspaces.id, workspaceId));
  return settings;
}
