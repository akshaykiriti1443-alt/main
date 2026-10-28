// Create this month's member code (and next month's) so you can post it in Skool.
// Stop the dev server first when using the local PGlite database.
import { randomBytes } from "node:crypto";

async function main() {
  const { createAccessCode, listCodes } = await import("../src/server/access");
  const { getPlatformAgency } = await import("../src/server/tenancy");
  const { closeDb } = await import("../src/lib/db");
  await getPlatformAgency();
  const now = new Date();
  for (const offset of [0, 1]) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 7, 23, 59));
    const label = start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const existing = (await listCodes()).find((c) => c.label === label);
    if (existing) {
      console.log(`${label}: ${existing.code} (already exists)`);
      continue;
    }
    const code = `${start.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    await createAccessCode({ code, label, validFrom: start, validUntil: end });
    console.log(`${label}: ${code}`);
  }
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
