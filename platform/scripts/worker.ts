// Background worker for hosts without a cron service: calls the tick endpoint
// every 30 seconds. On Vercel, use the cron in vercel.json instead.
const url = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/cron/tick`;
const headers: Record<string, string> = process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {};

async function loop() {
  for (;;) {
    try {
      const res = await fetch(url, { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) console.error(`[worker] ${res.status}`, body);
      else if (body?.jobs?.processed) console.log(`[worker] processed ${body.jobs.processed} jobs`);
    } catch (err) {
      console.error("[worker] tick failed", err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

console.log(`[worker] ticking ${url} every 30s`);
void loop();
