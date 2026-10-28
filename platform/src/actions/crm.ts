"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/tenancy";
import { addTag, getContact, removeTag, setStage, updateContactDetails, upsertContact } from "@/server/contacts";
import { draftReply } from "@/server/ai/replies";
import { scoreContact } from "@/server/ai/scoring";
import { getConversation, markRead, sendReply, setConversationStatus } from "@/server/inbox";
import { emitEvent } from "@/server/events";
import { hasFeature } from "@/server/plans";
import type { Stage } from "@/lib/db/schema";
import { isEmail } from "@/lib/util";
import { errMsg, field, go } from "./helpers";

const STAGES: Stage[] = ["new", "engaged", "trial", "member", "lost"];

export async function addContactAction(wid: string, fd: FormData) {
  await requireWorkspace(wid);
  const email = field(fd, "email", 200);
  const phone = field(fd, "phone", 40);
  if (!email && !phone) go(`/app/w/${wid}/leads`, { error: "Add an email or a phone number." });
  if (email && !isEmail(email)) go(`/app/w/${wid}/leads`, { error: "That email doesn't look right." });
  const { contact, created } = await upsertContact({
    workspaceId: wid,
    email: email || null,
    phone: phone || null,
    firstName: field(fd, "firstName", 80),
    lastName: field(fd, "lastName", 80),
    source: "manual",
    tags: field(fd, "tags", 300).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
  });
  if (created) await emitEvent({ type: "lead_created", workspaceId: wid, contactId: contact.id });
  go(`/app/w/${wid}/leads/${contact.id}`, { ok: created ? "Contact added." : "That contact already existed. We updated it." });
}

export async function addTagAction(wid: string, contactId: string, fd: FormData) {
  await requireWorkspace(wid);
  await addTag(wid, contactId, field(fd, "tag", 60));
  revalidatePath(`/app/w/${wid}/leads/${contactId}`);
}

export async function removeTagAction(wid: string, contactId: string, tag: string) {
  await requireWorkspace(wid);
  await removeTag(wid, contactId, tag);
  revalidatePath(`/app/w/${wid}/leads/${contactId}`);
}

export async function setStageAction(wid: string, contactId: string, fd: FormData) {
  await requireWorkspace(wid);
  const stage = field(fd, "stage") as Stage;
  if (STAGES.includes(stage)) await setStage(wid, contactId, stage);
  revalidatePath(`/app/w/${wid}/leads/${contactId}`);
}

export async function saveContactAction(wid: string, contactId: string, fd: FormData) {
  await requireWorkspace(wid);
  await updateContactDetails(wid, contactId, {
    firstName: field(fd, "firstName", 80),
    lastName: field(fd, "lastName", 80),
    phone: field(fd, "phone", 40),
    notes: field(fd, "notes", 5000),
  });
  go(`/app/w/${wid}/leads/${contactId}`, { ok: "Saved." });
}

export async function scoreContactAction(wid: string, contactId: string) {
  await requireWorkspace(wid);
  if (!(await getContact(wid, contactId))) go(`/app/w/${wid}/leads`, { error: "Contact not found." });
  await scoreContact(contactId);
  go(`/app/w/${wid}/leads/${contactId}`, { ok: "Lead re-scored." });
}

export async function sendReplyAction(wid: string, conversationId: string, fd: FormData) {
  const { workspace, user } = await requireWorkspace(wid);
  if (!hasFeature(workspace.plan, "inbox")) go(`/app/w/${wid}/inbox`, { error: "The inbox is on the Growth plan." });
  let msg: { ok?: string; error?: string } = {};
  try {
    await sendReply(wid, conversationId, field(fd, "body", 2000), user.id);
  } catch (err) {
    msg = { error: errMsg(err) };
  }
  go(`/app/w/${wid}/inbox?c=${conversationId}`, msg.error ? msg : undefined);
}

export async function draftReplyAction(wid: string, conversationId: string) {
  await requireWorkspace(wid);
  if (!(await getConversation(wid, conversationId))) go(`/app/w/${wid}/inbox`, { error: "Conversation not found." });
  await draftReply(conversationId);
  go(`/app/w/${wid}/inbox?c=${conversationId}`);
}

export async function setConversationStatusAction(wid: string, conversationId: string, status: "open" | "closed") {
  await requireWorkspace(wid);
  await setConversationStatus(wid, conversationId, status);
  go(`/app/w/${wid}/inbox${status === "open" ? `?c=${conversationId}` : ""}`);
}

export async function markReadAction(wid: string, conversationId: string) {
  await requireWorkspace(wid);
  await markRead(wid, conversationId);
}
