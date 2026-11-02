"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { requireWorkspace } from "@/server/tenancy";
import { verifyAiKey } from "@/server/ai/client";
import { createConnectorToken, revokeConnectorToken } from "@/server/connectors";
import { errMsg, field, go } from "./helpers";

const back = (wid: string) => `/app/w/${wid}/settings#ai`;

/** Save the workspace's own Claude or OpenAI key. Checked first, stored encrypted. */
export async function saveAiKeyAction(wid: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "admin");
  const provider = field(fd, "aiProvider") === "openai" ? "openai" : "anthropic";
  const key = field(fd, "aiKey", 400);
  const model = field(fd, "aiModel", 80);
  if (!key && !workspace.settings.aiKeyEnc) go(back(wid), { error: "Paste your API key." });
  if (key) {
    let valid = false;
    try {
      valid = await verifyAiKey(provider, key);
    } catch (err) {
      go(back(wid), { error: `Couldn't reach ${provider === "openai" ? "OpenAI" : "Anthropic"}: ${errMsg(err)}` });
    }
    if (!valid) go(back(wid), { error: "That key didn't work. Check you copied all of it." });
  }
  const db = await getDb();
  await db
    .update(workspaces)
    .set({
      settings: {
        ...workspace.settings,
        aiProvider: provider,
        aiModel: model,
        ...(key ? { aiKeyEnc: encrypt(key), aiKeyHint: `…${key.slice(-4)}` } : {}),
      },
    })
    .where(eq(workspaces.id, wid));
  go(back(wid), { ok: `Your ${provider === "openai" ? "OpenAI" : "Claude"} key is on. AI features now run on it and never use your wallet.` });
}

export async function removeAiKeyAction(wid: string) {
  const { workspace } = await requireWorkspace(wid, "admin");
  const { aiKeyEnc: _k, aiKeyHint: _h, aiProvider: _p, aiModel: _m, ...rest } = workspace.settings;
  const db = await getDb();
  await db.update(workspaces).set({ settings: rest }).where(eq(workspaces.id, wid));
  go(back(wid), { ok: "Key removed. AI features use the plan allowance and wallet again." });
}

export type ConnectorState = { url?: string; error?: string };

/** Create a private connector URL. Returned once; only its hash is stored. */
export async function createConnectorAction(wid: string, _prev: ConnectorState, fd: FormData): Promise<ConnectorState> {
  const { user } = await requireWorkspace(wid, "admin");
  try {
    const { url } = await createConnectorToken(wid, user.id, field(fd, "name", 60) || "My AI");
    return { url };
  } catch (err) {
    return { error: errMsg(err) };
  }
}

export async function revokeConnectorAction(wid: string, id: string) {
  await requireWorkspace(wid, "admin");
  await revokeConnectorToken(wid, id);
  go(back(wid), { ok: "Connector removed. That URL stops working now." });
}
