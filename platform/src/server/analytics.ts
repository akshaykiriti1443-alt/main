import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, contacts, conversations } from "@/lib/db/schema";
import { addDays } from "@/lib/util";

export async function workspaceStats(workspaceId: string, days = 14) {
  const db = await getDb();
  const since = addDays(new Date(), -days);
  const daily = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${activities.createdAt}), 'YYYY-MM-DD')`,
      type: activities.type,
      n: sql<number>`count(*)::int`,
    })
    .from(activities)
    .where(and(eq(activities.workspaceId, workspaceId), gte(activities.createdAt, since), sql`${activities.type} in ('page_view','lead','email_sent','message_in')`))
    .groupBy(sql`1`, activities.type);

  const series: { day: string; views: number; leads: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(new Date(), -i).toISOString().slice(0, 10);
    series.push({
      day: d,
      views: daily.find((r) => r.day === d && r.type === "page_view")?.n ?? 0,
      leads: daily.find((r) => r.day === d && r.type === "lead")?.n ?? 0,
    });
  }
  const sum = (type: string) => daily.filter((r) => r.type === type).reduce((a, r) => a + r.n, 0);
  const views = sum("page_view");
  const leads = sum("lead");

  const [temps] = await db
    .select({
      total: sql<number>`count(*)::int`,
      hot: sql<number>`count(*) filter (where ${contacts.temperature} = 'hot')::int`,
      warm: sql<number>`count(*) filter (where ${contacts.temperature} = 'warm')::int`,
    })
    .from(contacts)
    .where(eq(contacts.workspaceId, workspaceId));
  const [inbox] = await db
    .select({ unread: sql<number>`coalesce(sum(${conversations.unread}), 0)::int` })
    .from(conversations)
    .where(eq(conversations.workspaceId, workspaceId));

  return {
    series,
    views,
    leads,
    conversion: views ? (leads / views) * 100 : 0,
    emailsSent: sum("email_sent"),
    messagesIn: sum("message_in"),
    contactsTotal: temps?.total ?? 0,
    hot: temps?.hot ?? 0,
    warm: temps?.warm ?? 0,
    unread: inbox?.unread ?? 0,
  };
}
