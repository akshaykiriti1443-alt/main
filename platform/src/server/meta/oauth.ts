import { encrypt, openState, sealState } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { channelConnections } from "@/lib/db/schema";
import { graph } from "./graph";

// Facebook Login (for Business). One platform app serves every customer:
// each customer clicks "Connect", picks their Pages + Instagram accounts and
// approves. Their DMs then flow to our single webhook.

export const META_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_content_publish",
  "business_management",
];

export const metaRedirectUri = () => `${env.appUrl}/api/integrations/meta/callback`;

export function metaLoginUrl(workspaceId: string, userId: string) {
  const state = sealState({ w: workspaceId, u: userId });
  const url = new URL(`https://www.facebook.com/${env.metaGraphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", env.metaAppId);
  url.searchParams.set("redirect_uri", metaRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  if (env.metaLoginConfigId) url.searchParams.set("config_id", env.metaLoginConfigId);
  else url.searchParams.set("scope", META_SCOPES.join(","));
  return url.toString();
}

export function readMetaState(state: string) {
  return openState<{ w: string; u: string }>(state);
}

type PagesResponse = {
  data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string; name?: string } }[];
};

export async function completeMetaLogin(workspaceId: string, code: string) {
  const short = await graph<{ access_token: string }>("oauth/access_token", {
    params: { client_id: env.metaAppId, client_secret: env.metaAppSecret, redirect_uri: metaRedirectUri(), code },
  });
  const long = await graph<{ access_token: string }>("oauth/access_token", {
    params: { grant_type: "fb_exchange_token", client_id: env.metaAppId, client_secret: env.metaAppSecret, fb_exchange_token: short.access_token },
  });
  const pages = await graph<PagesResponse>("me/accounts", {
    token: long.access_token,
    params: { fields: "id,name,access_token,instagram_business_account{id,username,name}", limit: "100" },
  });

  const db = await getDb();
  const connected: string[] = [];
  for (const page of pages.data) {
    // Page tokens derived from a long-lived user token do not expire.
    await graph(`${page.id}/subscribed_apps`, {
      method: "POST",
      token: page.access_token,
      params: { subscribed_fields: "messages,messaging_postbacks,message_echoes" },
    });
    await db
      .insert(channelConnections)
      .values({ workspaceId, kind: "facebook_page", externalId: page.id, name: page.name, accessTokenEnc: encrypt(page.access_token), meta: {} })
      .onConflictDoUpdate({
        target: [channelConnections.kind, channelConnections.externalId],
        set: { workspaceId, name: page.name, accessTokenEnc: encrypt(page.access_token), status: "active" },
      });
    connected.push(page.name);
    const ig = page.instagram_business_account;
    if (ig) {
      const label = ig.username ? `@${ig.username}` : (ig.name ?? "Instagram");
      await db
        .insert(channelConnections)
        .values({ workspaceId, kind: "instagram", externalId: ig.id, name: label, accessTokenEnc: encrypt(page.access_token), meta: { pageId: page.id } })
        .onConflictDoUpdate({
          target: [channelConnections.kind, channelConnections.externalId],
          set: { workspaceId, name: label, accessTokenEnc: encrypt(page.access_token), meta: { pageId: page.id }, status: "active" },
        });
      connected.push(label);
    }
  }
  return connected;
}
