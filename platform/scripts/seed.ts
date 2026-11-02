// Give a member access by email (for testing the member flow locally), e.g.
//   npm run db:seed -- jane@example.com
// Stop the dev server first when using the local PGlite database.

async function main() {
  const email = process.argv[2] || "member@example.com";
  const { grantAccess } = await import("../src/server/access");
  const { getPlatformAgency } = await import("../src/server/tenancy");
  const { closeDb } = await import("../src/lib/db");
  await getPlatformAgency();
  await grantAccess({ email, channel: "admin", until: null, name: "Seeded member" });
  console.log(`${email} is an active member. Sign up at /signup with that email.`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
