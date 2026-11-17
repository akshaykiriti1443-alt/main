import { redirect } from "next/navigation";

export function go(path: string, msg?: { ok?: string; error?: string; warn?: string }): never {
  if (!msg) redirect(path);
  const q = new URLSearchParams();
  if (msg.ok) q.set("ok", msg.ok);
  if (msg.error) q.set("error", msg.error);
  if (msg.warn) q.set("warn", msg.warn);
  // The message goes before any #hash, or the page never sees it.
  const at = path.indexOf("#");
  const base = at === -1 ? path : path.slice(0, at);
  const hash = at === -1 ? "" : path.slice(at);
  redirect(`${base}${base.includes("?") ? "&" : "?"}${q.toString()}${hash}`);
}

export const field = (fd: FormData, k: string, max = 5000) => String(fd.get(k) ?? "").trim().slice(0, max);
export const errMsg = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");
