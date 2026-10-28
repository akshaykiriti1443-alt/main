import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { channelConnections, socialPosts, workspaces } from "@/lib/db/schema";
import { safeUrl } from "@/lib/html";
import { enqueue } from "./jobs/queue";
import { publishToFacebookPage, publishToInstagram } from "./meta/send";

export async function listPosts(workspaceId: string) {
  const db = await getDb();
  return db.select().from(socialPosts).where(eq(socialPosts.workspaceId, workspaceId)).orderBy(desc(socialPosts.createdAt)).limit(100);
}

export async function schedulePost(
  workspaceId: string,
  input: { caption: string; mediaUrl: string; connectionIds: string[]; scheduledAt: Date | null },
) {
  const caption = input.caption.trim();
  if (!caption && !input.mediaUrl) throw new Error("Add a caption or an image.");
  if (input.connectionIds.length === 0) throw new Error("Pick at least one account.");
  const mediaUrl = input.mediaUrl ? safeUrl(input.mediaUrl) : "";
  if (input.mediaUrl && !mediaUrl) throw new Error("The image link must start with https://");
  const db = await getDb();
  const owned = await db
    .select({ id: channelConnections.id, kind: channelConnections.kind })
    .from(channelConnections)
    .where(and(eq(channelConnections.workspaceId, workspaceId), inArray(channelConnections.id, input.connectionIds)));
  if (owned.some((c) => c.kind === "instagram") && !mediaUrl) throw new Error("Instagram posts need an image link.");
  const when = input.scheduledAt && input.scheduledAt > new Date() ? input.scheduledAt : new Date();
  const [post] = await db
    .insert(socialPosts)
    .values({ workspaceId, caption, mediaUrl, connectionIds: owned.map((o) => o.id), scheduledAt: when, status: "scheduled" })
    .returning({ id: socialPosts.id });
  await enqueue("social.publish", { postId: post.id }, { runAt: when, dedupeKey: `social:${post.id}`, maxAttempts: 3 });
  return post.id;
}

export async function cancelPost(workspaceId: string, postId: string) {
  const db = await getDb();
  await db
    .update(socialPosts)
    .set({ status: "draft" })
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.workspaceId, workspaceId), eq(socialPosts.status, "scheduled")));
}

export async function publishPostJob(postId: string) {
  const db = await getDb();
  const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, postId)).limit(1);
  if (!post || post.status !== "scheduled") return;
  const [ws] = await db.select({ status: workspaces.status }).from(workspaces).where(eq(workspaces.id, post.workspaceId)).limit(1);
  if (!ws || ws.status === "paused") return;
  await db.update(socialPosts).set({ status: "publishing" }).where(eq(socialPosts.id, postId));
  const conns = post.connectionIds.length
    ? await db.select().from(channelConnections).where(inArray(channelConnections.id, post.connectionIds))
    : [];
  const results: Record<string, { ok: boolean; id?: string; error?: string }> = { ...post.results };
  for (const c of conns) {
    if (results[c.id]?.ok) continue;
    try {
      const id =
        c.kind === "instagram"
          ? await publishToInstagram(c, { caption: post.caption, imageUrl: post.mediaUrl })
          : c.kind === "facebook_page"
            ? await publishToFacebookPage(c, { caption: post.caption, imageUrl: post.mediaUrl })
            : null;
      results[c.id] = id ? { ok: true, id } : { ok: false, error: "This account type can't post." };
    } catch (err) {
      results[c.id] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  const allOk = conns.length > 0 && conns.every((c) => results[c.id]?.ok);
  await db
    .update(socialPosts)
    .set({ status: allOk ? "published" : "failed", results })
    .where(eq(socialPosts.id, postId));
}
