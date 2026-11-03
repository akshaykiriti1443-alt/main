"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { isPublicHttpsUrl } from "@/lib/html";
import { requireWorkspace } from "@/server/tenancy";
import { AI_PROVIDERS, isAiProvider, verifyAiKey } from "@/server/ai/client";
import { createConnectorToken, revokeConnectorToken } from "@/server/connectors";
import { completeAiTask, skipAiTask } from "@/server/aiTasks";
import { errMsg, field, go } from "./helpers";

const back = (wid: string, hash = "key") => `/app/w/${wid}/ai#${hash}`;

/** Save the workspace's own AI key (Claude, OpenAI, or a free tier like Gemini). Checked first, stored encrypted. */
export async function saveAiKeyAction(wid: string, fd: FormData) {
  const { workspace } = await requireWorkspace(wid, "admin");
  const s = workspace.settings;
  const providerField = field(fd, "aiProvider");
  const provider = isAiProvider(providerField) ? providerField : "gemini";
  const key = field(fd, "aiKey", 400);
  const modelField = field(fd, "aiModel", 120);
  const baseUrl = field(fd, "aiBaseUrl", 300).replace(/\/+$/, "");
  const label = AI_PROVIDERS[provider].label;

  if (provider === "custom" && !isPublicHttpsUrl(baseUrl)) go(back(wid), { error: "For Other (OpenAI-compatible), add a public https:// base URL, like https://api.mistral.ai/v1." });
  const sameProvider = s.aiKeyEnc && s.aiProvider === provider && (provider !== "custom" || s.aiBaseUrl === baseUrl);
  if (!key && !sameProvider) go(back(wid), { error: `Paste your ${label} API key.` });

  let model = modelField;
  if (key) {
    const check = await verifyAiKey(provider, key, baseUrl);
    if (!check.ok) go(back(wid), { error: check.error ?? "That key didn't work. Check you copied all of it." });
    if (!model) model = check.model ?? "";
  }
  if (!model && provider !== "anthropic" && provider !== "openai" && !(sameProvider && s.aiModel)) {
    go(back(wid), { error: `We couldn't find a model on ${label}. Type a model name in "Model".` });
  }

  const db = await getDb();
  await db
    .update(workspaces)
    .set({
      settings: {
        ...s,
        aiProvider: provider,
        aiModel: model || (sameProvider ? s.aiModel : "") || "",
        aiBaseUrl: provider === "custom" ? baseUrl : "",
        ...(key ? { aiKeyEnc: encrypt(key), aiKeyHint: `…${key.slice(-4)}` } : {}),
      },
    })
    .where(eq(workspaces.id, wid));
  go(back(wid), { ok: `Your ${label} key is on${model ? ` (model: ${model})` : ""}. AI features and "Ask my AI" steps now run on it, never your wallet.` });
}

export async function removeAiKeyAction(wid: string) {
  const { workspace } = await requireWorkspace(wid, "admin");
  const { aiKeyEnc: _k, aiKeyHint: _h, aiProvider: _p, aiModel: _m, aiBaseUrl: _b, ...rest } = workspace.settings;
  const db = await getDb();
  await db.update(workspaces).set({ settings: rest }).where(eq(workspaces.id, wid));
  go(back(wid), { ok: "Key removed. AI features use your plan allowance and wallet again." });
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
  go(back(wid, "connect"), { ok: "Connector removed. That URL stops working now." });
}

/** Paste an AI task result by hand (e.g. from a free chat AI that can't connect over MCP). */
export async function completeAiTaskAction(wid: string, taskId: string, fd: FormData) {
  await requireWorkspace(wid);
  const result = field(fd, "result", 8000);
  if (!result) go(back(wid, "tasks"), { error: "Paste what your AI wrote first." });
  const done = await completeAiTask(wid, taskId, result, "pasted by hand");
  go(back(wid, "tasks"), done ? { ok: "Saved on the contact." } : { error: "That task is already done." });
}

export async function skipAiTaskAction(wid: string, taskId: string) {
  await requireWorkspace(wid);
  await skipAiTask(wid, taskId);
  go(back(wid, "tasks"), { ok: "Task skipped." });
}
