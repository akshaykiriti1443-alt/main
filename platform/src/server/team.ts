import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, workspaceMembers, type WorkspaceRole } from "@/lib/db/schema";
import { randomToken } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/util";
import { createUser, findUserByEmail } from "./auth";
import { sendSystemEmail } from "./email/send";
import { passwordLinkFor } from "./passwords";
import { env } from "@/lib/env";

export async function listMembers(workspaceId: string) {
  const db = await getDb();
  return db
    .select({ userId: users.id, email: users.email, name: users.name, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId));
}

export async function inviteMember(input: { workspaceId: string; workspaceName: string; email: string; name: string; role: Exclude<WorkspaceRole, "owner">; brandName?: string }) {
  const email = normalizeEmail(input.email);
  let user = await findUserByEmail(email);
  const isNew = !user;
  if (!user) user = await createUser({ email, name: input.name, password: randomToken(24) });
  const db = await getDb();
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: input.workspaceId, userId: user.id, role: input.role })
    .onConflictDoUpdate({ target: [workspaceMembers.workspaceId, workspaceMembers.userId], set: { role: input.role } });
  const link = isNew ? await passwordLinkFor(user.id, 24 * 7) : `${env.appUrl}/login`;
  await sendSystemEmail({
    to: email,
    subject: `You've been added to ${input.workspaceName}`,
    body: `Hi ${input.name || "there"},\n\nYou now have access to ${input.workspaceName}.\n\n[${isNew ? "Set your password" : "Log in"}](${link})${isNew ? "\n\nThe link works for 7 days." : ""}`,
    brandName: input.brandName,
  }).catch((err) => console.error("[team] invite email failed", err));
  return { isNew };
}

export async function removeMember(workspaceId: string, userId: string) {
  const db = await getDb();
  // Owners can't be removed here; transfer ownership is a support task.
  await db
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId), ne(workspaceMembers.role, "owner")));
}
