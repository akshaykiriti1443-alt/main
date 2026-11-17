import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
let rv: typeof import("@/lib/reelvault");

beforeAll(async () => {
  process.env.ONEX_SSO_SECRET = SECRET;
  process.env.REELVAULT_URL = "http://localhost:8800/";
  rv = await import("@/lib/reelvault");
});

describe("ReelVault sign-in ticket", () => {
  it("is v1.<payload>.<HMAC-SHA256 of 'v1.<payload>'>, with the email lowercased and a 2-minute expiry", () => {
    const before = Math.floor(Date.now() / 1000);
    const [v, payload, sig, ...rest] = rv.makeReelVaultTicket({ email: "  Jay@ClimbRanked.test ", name: "Jay Mercer" }).split(".");
    expect(v).toBe("v1");
    expect(rest).toEqual([]);
    expect(sig).toBe(crypto.createHmac("sha256", SECRET).update(`v1.${payload}`).digest("base64url"));
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(body.email).toBe("jay@climbranked.test");
    expect(body.name).toBe("Jay Mercer");
    expect(body.exp).toBeGreaterThanOrEqual(before + 120);
    expect(body.exp).toBeLessThanOrEqual(before + 122);
    expect(body.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("makes a fresh ticket every time, and a missing name becomes an empty one", () => {
    const a = rv.makeReelVaultTicket({ email: "a@b.test", name: null });
    const b = rv.makeReelVaultTicket({ email: "a@b.test", name: null });
    expect(a).not.toBe(b);
    expect(JSON.parse(Buffer.from(a.split(".")[1], "base64url").toString("utf8")).name).toBe("");
  });

  it("points at REELVAULT_URL/sso/onex with the ticket, without a doubled slash", () => {
    const url = new URL(rv.reelVaultSignInUrl({ email: "a@b.test" }));
    expect(url.origin + url.pathname).toBe("http://localhost:8800/sso/onex");
    expect(url.searchParams.get("t")).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(rv.reelVaultConfigured()).toBe(true);
  });
});

describe("ReelVault inside OneX: the embed sign-in", () => {
  it("adds embed=1, parent, theme and to after the unchanged ticket", () => {
    const url = new URL(rv.reelVaultSignInUrl({ email: "a@b.test" }, { parent: "http://localhost:3000", theme: "dark", to: "reel/rl_abcdefghijklmnop" }));
    expect(url.origin + url.pathname).toBe("http://localhost:8800/sso/onex");
    expect([...url.searchParams.keys()]).toEqual(["t", "embed", "parent", "theme", "to"]);
    expect(url.searchParams.get("t")).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(url.searchParams.get("embed")).toBe("1");
    expect(url.searchParams.get("parent")).toBe("http://localhost:3000");
    expect(url.searchParams.get("theme")).toBe("dark");
    expect(url.searchParams.get("to")).toBe("reel/rl_abcdefghijklmnop");
    expect(url.search).toContain("parent=http%3A%2F%2Flocalhost%3A3000");
  });

  it("leaves theme out when OneX doesn't know it yet", () => {
    const url = new URL(rv.reelVaultSignInUrl({ email: "a@b.test" }, { parent: "https://app.scaleitads.com", to: "home" }));
    expect(url.searchParams.has("theme")).toBe(false);
    expect(url.searchParams.get("to")).toBe("home");
  });

  it("names ReelVault's origin only (no path, no trailing slash)", () => {
    expect(rv.reelVaultOrigin()).toBe("http://localhost:8800");
  });
});

describe("ReelVault findings API signature", () => {
  it("matches the shared test vector exactly", () => {
    const h = rv.signFindingsRequest("jay@climbranked.test", 1763380800 * 1000, "0123456789abcdef0123456789abcdef");
    expect(h).toEqual({
      "X-OneX-Email": "jay@climbranked.test",
      "X-OneX-Timestamp": "1763380800",
      "X-OneX-Nonce": "0123456789abcdef0123456789abcdef",
      "X-OneX-Signature": "v1=iuSXICirPXL1Sa8kel2VgzZQKDH52Yv2Lspnm-nvep8",
    });
    expect(rv.FINDINGS_PATH).toBe("/api/onex/v1/findings");
  });

  it("signs exactly the 6 lines of the recipe", () => {
    const h = rv.signFindingsRequest("  Jay@ClimbRanked.test ", 1763380800 * 1000 + 999, "0123456789abcdef0123456789abcdef");
    expect(h["X-OneX-Email"]).toBe("jay@climbranked.test");
    expect(h["X-OneX-Timestamp"]).toBe("1763380800");
    const msg = "onex-api-v1\nGET\n/api/onex/v1/findings\njay@climbranked.test\n1763380800\n0123456789abcdef0123456789abcdef";
    expect(h["X-OneX-Signature"]).toBe(`v1=${crypto.createHmac("sha256", SECRET).update(msg, "utf8").digest("base64url")}`);
    expect(h["X-OneX-Signature"]).toMatch(/^v1=[A-Za-z0-9_-]{43}$/);
  });

  it("uses a fresh 16-byte hex nonce and the current second by default", () => {
    const a = rv.signFindingsRequest("a@b.test");
    const b = rv.signFindingsRequest("a@b.test");
    expect(a["X-OneX-Nonce"]).toMatch(/^[0-9a-f]{32}$/);
    expect(a["X-OneX-Nonce"]).not.toBe(b["X-OneX-Nonce"]);
    expect(Math.abs(Number(a["X-OneX-Timestamp"]) - Date.now() / 1000)).toBeLessThan(5);
  });

  it("refuses an email that isn't printable ASCII", () => {
    expect(() => rv.signFindingsRequest("jäy@example.test")).toThrow();
    expect(() => rv.signFindingsRequest("a b@example.test")).toThrow();
    expect(rv.findingsEmail(" A@B.test ")).toBe("a@b.test");
  });
});
