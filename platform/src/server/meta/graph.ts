import { env } from "@/lib/env";

export class GraphApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public subcode?: number,
  ) {
    super(message);
  }
  // Expired / revoked tokens and permission errors won't fix themselves on retry.
  get permanent() {
    return this.code === 190 || this.code === 10 || this.code === 200 || (this.status >= 400 && this.status < 500 && this.status !== 429);
  }
}

const base = () => `https://graph.facebook.com/${env.metaGraphVersion}`;

export async function graph<T = Record<string, unknown>>(
  path: string,
  opts: { method?: "GET" | "POST" | "DELETE"; token?: string; params?: Record<string, string | undefined>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`${base()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  if (opts.token) url.searchParams.set("access_token", opts.token);
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message: string; code?: number; error_subcode?: number } };
  if (!res.ok || data.error) {
    const e = data.error;
    throw new GraphApiError(`Meta API: ${e?.message ?? res.statusText}`, res.status, e?.code, e?.error_subcode);
  }
  return data;
}

export const metaConfigured = () => Boolean(env.metaAppId && env.metaAppSecret);
