// End-to-end smoke test: boots the production build on a fresh database and
// clicks through signup, the AI launch kit, publishing, lead capture, member
// codes, the Skool webhook, the editor, tracking, automations and unsubscribe.
// Usage: npm run build && npm run e2e
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Playwright is pre-installed globally in CI images; fall back to a local install.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const DATA = path.resolve(".data/e2e");
const SHOTS = path.resolve(process.env.E2E_SHOTS ?? "e2e-artifacts");
rmSync(DATA, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  APP_URL: BASE,
  PGLITE_DIR: DATA,
  JOBS_INLINE: "1",
  EMAIL_PROVIDER: "console",
  META_APP_SECRET: "e2e-meta-secret",
  META_VERIFY_TOKEN: "e2e-verify",
  SKOOL_WEBHOOK_SECRET: "e2e-skool",
  CRON_SECRET: "e2e-cron",
  ANTHROPIC_API_KEY: "",
  NEXT_TELEMETRY_DISABLED: "1",
};
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try {
    await fn();
    console.log("ok");
  } catch (err) {
    console.log("FAILED");
    throw err;
  }
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start:\n${serverLog}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  let wid = "";
  let siteUrl = "";

  await step("first signup becomes platform owner (no code needed)", async () => {
    await page.goto(`${BASE}/signup`);
    await page.getByText("Set up your platform").waitFor();
    await page.fill("#name", "Akshay Owner");
    await page.fill("#businessName", "0 to 1x Academy");
    await page.fill("#email", "owner@example.com");
    await page.fill("#password", "supersecret1");
    await page.click("button:has-text('Create my account')");
    await page.waitForURL(/\/app\/w\/[0-9a-f-]+\/launch/);
    wid = page.url().match(/\/app\/w\/([0-9a-f-]+)/)[1];
  });

  await step("AI launch kit builds a funnel (template mode)", async () => {
    await page.fill("#niche", "growing Skool communities with Meta ads");
    await page.fill("#audience", "Skool owners and coaches");
    await page.fill("#outcome", "get 50 new members in 30 days");
    await page.fill("#skoolUrl", "https://www.skool.com/0to1x/about");
    await page.click("button:has-text('Build my launch kit')");
    await page.waitForURL(/\/launch\?kit=/);
    await page.getByRole("heading", { name: "Your launch kit" }).waitFor();
    await page.getByText("10 hooks for Reels and ads").waitFor();
    await page.screenshot({ path: `${SHOTS}/02-launch-kit.png`, fullPage: false });
  });

  await step("publish the funnel", async () => {
    await page.click("a:has-text('Review & publish funnel')");
    await page.waitForURL(/\/sites\/[0-9a-f-]+$/);
    await page.click("button:has-text('Publish')");
    await page.getByText("Published. Your pages are live.").waitFor();
    const link = await page.locator("a[href*='/s/']").first().getAttribute("href");
    siteUrl = link;
    expect(siteUrl.startsWith(`${BASE}/s/`), `unexpected site url ${siteUrl}`);
  });

  await step("edit the hero headline in the page editor and republish", async () => {
    await page.click("a:has-text('Opt-in page')");
    await page.waitForURL(/\/pages\/[0-9a-f-]+$/);
    const headline = page.locator(".section-body textarea").first();
    await headline.fill("Get 50 new Skool members in 30 days");
    await page.locator(".editor-preview h1").getByText("Get 50 new Skool members in 30 days").waitFor();
    await page.click("button:has-text('Save')");
    await page.getByText("Saved. Publish the funnel").waitFor();
    await page.screenshot({ path: `${SHOTS}/03-editor.png` });
    await page.goBack();
    await page.reload();
    await page.click("button:has-text('Publish changes')");
    await page.getByText("Published. Your pages are live.").waitFor();
  });

  await step("add Meta Pixel; public page loads it", async () => {
    await page.goto(`${BASE}/app/w/${wid}/settings`);
    await page.fill("#metaPixelId", "123456789012345");
    await page.locator("#tracking button:has-text('Save')").click();
    await page.getByText("Tracking saved.").waitFor();
    const html = await (await fetch(siteUrl)).text();
    expect(html.includes("fbq('init',\"123456789012345\")"), "pixel snippet missing");
  });

  await step("visitor opts in on the public page and lands on thank-you", async () => {
    const visitor = await browser.newPage();
    await visitor.goto(siteUrl);
    await visitor.getByRole("heading", { name: "Get 50 new Skool members in 30 days" }).waitFor();
    await visitor.screenshot({ path: `${SHOTS}/04-landing-page.png` });
    const form = visitor.locator("form.lp-form").first();
    await form.locator("input[name=name]").fill("Riya Lead");
    await form.locator("input[name=email]").fill("riya@example.com");
    await form.locator("button[type=submit]").click();
    await visitor.waitForURL(/\/thank-you\?eid=/);
    await visitor.getByText("It's in your inbox").waitFor();
    const html = await visitor.content();
    expect(html.includes("fbq('track','Lead'"), "Lead pixel event missing on thank-you page");
    await visitor.screenshot({ path: `${SHOTS}/05-thank-you.png` });
    await visitor.close();
  });

  await step("lead shows up, gets the first email", async () => {
    await page.goto(`${BASE}/app/w/${wid}/leads`);
    await page.getByText("Riya Lead").waitFor();
    // Inline jobs send the email right after the response; poll for it.
    let sent = false;
    for (let i = 0; i < 20 && !sent; i++) {
      await page.goto(`${BASE}/app/w/${wid}/emails`);
      const row = page.locator("tr", { hasText: "riya@example.com" }).first();
      sent = (await row.count()) > 0 && (await row.innerText()).toLowerCase().includes("sent");
      if (!sent) await new Promise((r) => setTimeout(r, 500));
    }
    expect(sent, "first email not sent");
  });

  await step("dashboard counts the lead", async () => {
    await page.goto(`${BASE}/app/w/${wid}`);
    await page.getByText("Riya Lead").waitFor();
    await page.screenshot({ path: `${SHOTS}/01-dashboard.png` });
  });

  await step("admin creates a monthly member code", async () => {
    await page.goto(`${BASE}/app/admin/codes`);
    await page.fill("#code", "E2E-NOV");
    await page.fill("#label", "E2E month");
    await page.click("button:has-text('Create code')");
    await page.getByText("Code E2E-NOV is live").waitFor();
  });

  await step("second member: wrong code is refused, right code works", async () => {
    const m = await browser.newContext();
    const p = await m.newPage();
    await p.goto(`${BASE}/signup`);
    await p.fill("#name", "Second Member");
    await p.fill("#email", "member2@example.com");
    await p.fill("#password", "supersecret2");
    await p.fill("#code", "WRONG");
    await p.click("button:has-text('Create my account')");
    await p.getByText("member code isn't valid").waitFor();
    // Typed values survive the error; only the password needs retyping.
    expect((await p.inputValue("#email")) === "member2@example.com", "email was cleared after an error");
    await p.fill("#password", "supersecret2");
    await p.fill("#code", "e2e-nov");
    await p.click("button:has-text('Create my account')");
    await p.waitForURL(/\/launch/);
    await m.close();
  });

  await step("Skool -> Zapier webhook pre-approves an email", async () => {
    const bad = await fetch(`${BASE}/api/webhooks/skool?secret=nope`, { method: "POST", body: "{}" });
    expect(bad.status === 401, "webhook accepted a bad secret");
    const ok = await fetch(`${BASE}/api/webhooks/skool?secret=e2e-skool`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "zapier@example.com", name: "Zap Member" }),
    });
    expect(ok.ok, `skool webhook failed ${ok.status}`);
    const m = await browser.newContext();
    const p = await m.newPage();
    await p.goto(`${BASE}/signup`);
    await p.fill("#name", "Zap Member");
    await p.fill("#email", "zapier@example.com");
    await p.fill("#password", "supersecret3");
    await p.click("button:has-text('Create my account')");
    await p.waitForURL(/\/launch/);
    await m.close();
  });

  await step("Meta webhook: verify handshake and reject bad signatures", async () => {
    const verify = await fetch(`${BASE}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=e2e-verify&hub.challenge=42`);
    expect((await verify.text()) === "42", "handshake failed");
    const body = JSON.stringify({ object: "page", entry: [] });
    const bad = await fetch(`${BASE}/api/webhooks/meta`, { method: "POST", body, headers: { "x-hub-signature-256": "sha256=bad" } });
    expect(bad.status === 401, "bad signature accepted");
    const sig = `sha256=${createHmac("sha256", "e2e-meta-secret").update(body).digest("hex")}`;
    const good = await fetch(`${BASE}/api/webhooks/meta`, { method: "POST", body, headers: { "x-hub-signature-256": sig } });
    expect(good.ok, "good signature rejected");
  });

  await step("Growth plan unlocks inbox and automations", async () => {
    await page.goto(`${BASE}/app/w/${wid}/inbox`);
    await page.getByText("The unified inbox is on the Growth plan").waitFor();
    await page.goto(`${BASE}/app/admin/workspaces`);
    const row = page.locator("tr", { hasText: "0 to 1x Academy" }).first();
    await row.locator("select[name=plan]").selectOption("growth");
    await row.locator("button:has-text('Save')").click();
    await page.getByText("Workspace updated.").waitFor();
    await page.goto(`${BASE}/app/w/${wid}/inbox`);
    await page.getByText("No conversations yet").waitFor();
    await page.goto(`${BASE}/app/w/${wid}/automations/new?preset=nurture`);
    await page.click("button:has-text('Save automation')");
    await page.waitForURL(/\/automations\/[0-9a-f-]+$/);
    await page.getByText("Recent runs").waitFor();
    await page.screenshot({ path: `${SHOTS}/06-automation.png` });
  });

  await step("cron endpoint requires the secret", async () => {
    const no = await fetch(`${BASE}/api/cron/tick`);
    expect(no.status === 401, "cron ran without secret");
    const yes = await fetch(`${BASE}/api/cron/tick`, { headers: { authorization: "Bearer e2e-cron" } });
    expect(yes.ok, "cron failed with secret");
  });

  await step("agency: create, activate, add a client from a template", async () => {
    await page.goto(`${BASE}/app/w/${wid}/settings`);
    await page.fill("#tname", "Skool lead magnet funnel");
    await page.click("button:has-text('Save template')");
    await page.waitForURL(/\/app\/admin\/templates/);
    await page.getByText("Skool lead magnet funnel").first().waitFor();
    await page.goto(`${BASE}/app/agency/new`);
    await page.fill("#name", "Growth Lab");
    await page.click("button:has-text('Create agency')");
    await page.waitForURL(/\/app\/agency\/[0-9a-f-]+\/billing/);
    const aid = page.url().match(/agency\/([0-9a-f-]+)/)[1];
    await page.goto(`${BASE}/app/admin/agencies`);
    const row = page.locator("tr", { hasText: "Growth Lab" }).first();
    await row.locator("select[name=plan]").selectOption("agency");
    await row.locator("button:has-text('Save')").click();
    await page.getByText("Agency updated.").waitFor();
    await page.goto(`${BASE}/app/agency/${aid}`);
    await page.fill("#name", "Coach Maria Fitness");
    await page.selectOption("#templateId", { label: "Skool lead magnet funnel (platform)" });
    await page.fill("#ownerEmail", "maria@example.com");
    await page.click("button:has-text('Create client account')");
    await page.getByText("Coach Maria Fitness is ready").waitFor();
    await page.locator("td", { hasText: "maria@example.com" }).waitFor();
    await page.screenshot({ path: `${SHOTS}/07-agency.png` });
  });

  await step("unsubscribe link rejects tampering", async () => {
    const r = await fetch(`${BASE}/api/public/unsubscribe?c=00000000-0000-4000-8000-000000000000&s=bad`);
    expect(r.status === 400, "tampered unsubscribe accepted");
  });

  console.log(`\nAll E2E steps passed. Screenshots in ${SHOTS}`);
} catch (err) {
  console.error("\nE2E failed:", err);
  console.error("--- server log (tail) ---\n" + serverLog.split("\n").slice(-60).join("\n"));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
  process.exit(process.exitCode ?? 0);
}
