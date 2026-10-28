import { redirect } from "next/navigation";

export function go(path: string, msg?: { ok?: string; error?: string; warn?: string }): never {
  if (!msg) redirect(path);
  const q = new URLSearchParams();
  if (msg.ok) q.set("ok", msg.ok);
  if (msg.error) q.set("error", msg.error);
  if (msg.warn) q.set("warn", msg.warn);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q.toString()}`);
}

export const field = (fd: FormData, k: string, max = 5000) => String(fd.get(k) ?? "").trim().slice(0, max);
export const errMsg = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");
