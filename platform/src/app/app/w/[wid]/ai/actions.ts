"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/server/tenancy";
import { AI_PROVIDERS, aiCredsFor, verifyAiKey } from "@/server/ai/client";

// The query goes before the #key: after it, the browser keeps it in the hash and the page never sees it.
const back = (wid: string, msg: { ok?: string; error?: string }) => `/app/w/${wid}/ai?${new URLSearchParams(msg).toString()}#key`;

/** "Check my key": asks the provider about the saved key again, without spending anything. */
export async function checkAiKeyAction(wid: string) {
  await requireWorkspace(wid);
  const creds = await aiCredsFor(wid);
  if (!creds) redirect(back(wid, { error: "There's no key saved yet. Paste your free Gemini key below and press Save key." }));
  const label = AI_PROVIDERS[creds.provider].label;
  const check = await verifyAiKey(creds.provider, creds.apiKey, creds.baseUrl, creds.model);
  redirect(back(wid, check.ok ? { ok: `Your key works. ${label} said yes just now.` } : { error: `${check.error ?? "That key didn't work."} Make a new key and save it below.` }));
}
