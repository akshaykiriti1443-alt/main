import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const verified = vi.hoisted(() => ({ ids: new Set<string>() }));
vi.mock("@/server/emailVerify", () => ({ isEmailVerified: async (id: string) => verified.ids.has(id) }));

const SECRET = "test-secret-that-is-at-least-32-characters-long";
let f: typeof import("@/server/reelvault");

beforeAll(async () => {
  process.env.ONEX_SSO_SECRET = SECRET;
  process.env.REELVAULT_URL = "http://localhost:8800";
  f = await import("@/server/reelvault");
});

beforeEach(() => {
  verified.ids = new Set(["u1"]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const jay = (email = "jay@climbranked.test") => ({ id: "u1", email });

const hook = (over: Record<string, unknown> = {}) => ({
  id: "rl_abcdefghijklmnop",
  text: "Stop doing cardio if you want to lose belly fat.",
  on_screen_text: "STOP DOING CARDIO",
  hook_type: "contrarian",
  hook_label: "Contrarian",
  formula: "Stop doing [habit] if you want [result].",
  why: "It picks a fight with a habit everyone has.",
  handle: "fitdadcoach",
  score: 4.2,
  level: "deep",
  reel_url: "https://www.instagram.com/reel/XYZ/",
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  v: 1,
  status: "ready",
  email: "jay@climbranked.test",
  computed_at: "2026-11-17T09:12:03Z",
  competitors: 4,
  hooks: [hook()],
  formats: [
    {
      id: "fmt_abcdefghijklmnop",
      name: "Green-screen myth bust",
      visual_format: "VF07",
      visual_format_label: "Green screen",
      line: "3.1x more likely to be an outlier · 12 reels from 3 competitors",
      lift: 3.1,
      evidence: "strong",
      can_make: true,
      reels: 12,
      competitors: 3,
    },
  ],
  ...over,
});

describe("reading ReelVault's findings JSON", () => {
  it("keeps the contract's fields", () => {
    const r = f.parseFindings(body(), "jay@climbranked.test");
    expect(r.status).toBe("ready");
    expect(r.computedAt).toBe("2026-11-17T09:12:03Z");
    expect(r.competitors).toBe(4);
    expect(r.hooks[0]).toMatchObject({ id: "rl_abcdefghijklmnop", hook_label: "Contrarian", handle: "fitdadcoach", score: 4.2, level: "deep" });
    expect(r.formats[0]).toMatchObject({ name: "Green-screen myth bust", lift: 3.1, evidence: "strong", can_make: true });
  });

  it("drops a bad row, not the whole answer, and ignores unknown keys", () => {
    const r = f.parseFindings(body({ hooks: [hook(), hook({ id: "nope" }), hook({ text: "" }), { junk: true }], extra: "x" }), "jay@climbranked.test");
    expect(r.hooks).toHaveLength(1);
    expect(r.status).toBe("ready");
  });

  it("only keeps Instagram reel links and strips a leading @", () => {
    const r = f.parseFindings(body({ hooks: [hook({ reel_url: "javascript:alert(1)", handle: "@@coach" })] }), "jay@climbranked.test");
    expect(r.hooks[0].reel_url).toBeNull();
    expect(r.hooks[0].handle).toBe("coach");
  });

  it("clips long text", () => {
    const r = f.parseFindings(body({ hooks: [hook({ text: "x".repeat(400), formula: "y".repeat(400) })] }), "jay@climbranked.test");
    expect(r.hooks[0].text).toHaveLength(300);
    expect(r.hooks[0].formula).toHaveLength(200);
  });

  it("passes the statuses through, with empty lists for off and no_account", () => {
    expect(f.parseFindings(body({ status: "off" }), "jay@climbranked.test")).toEqual({ status: "off", computedAt: null, competitors: 0, hooks: [], formats: [] });
    expect(f.parseFindings(body({ status: "no_account" }), "jay@climbranked.test").status).toBe("no_account");
    expect(f.parseFindings(body({ status: "empty", hooks: [], formats: [] }), "jay@climbranked.test")).toMatchObject({ status: "empty", competitors: 4 });
  });

  it("is unavailable for a wrong version, a bad body or someone else's email", () => {
    expect(f.parseFindings(body({ v: 2 }), "jay@climbranked.test").status).toBe("unavailable");
    expect(f.parseFindings({ error: "x" }, "jay@climbranked.test").status).toBe("unavailable");
    expect(f.parseFindings(body({ email: "someone@else.test" }), "jay@climbranked.test").status).toBe("unavailable");
  });
});

describe("calling ReelVault", () => {
  it("sends a signed GET with no-store and returns the findings", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body()), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await f.reelVaultFindings(jay("  Jay@ClimbRanked.test "));
    expect(r.status).toBe("ready");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8800/api/onex/v1/findings");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const h = init.headers as Record<string, string>;
    expect(h["X-OneX-Email"]).toBe("jay@climbranked.test");
    expect(h["X-OneX-Nonce"]).toMatch(/^[0-9a-f]{32}$/);
    expect(h["X-OneX-Signature"]).toMatch(/^v1=[A-Za-z0-9_-]{43}$/);
    expect(h.Accept).toBe("application/json");
    expect(JSON.stringify(init)).not.toContain(SECRET);
  });

  it("never throws: network errors, non-200s and bad JSON are 'unavailable'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    expect((await f.reelVaultFindings(jay())).status).toBe("unavailable");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"x","code":"stale"}', { status: 401 })));
    expect((await f.reelVaultFindings(jay())).status).toBe("unavailable");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    expect((await f.reelVaultFindings(jay())).status).toBe("unavailable");
  });

  it("doesn't call for an email that isn't printable ASCII", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await f.reelVaultFindings(jay("jäy@example.test"))).status).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never asks for an unconfirmed email: the signed request vouches for it, like the ticket", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    verified.ids = new Set();
    expect((await f.reelVaultFindings(jay())).status).toBe("unavailable");
    const fd = new FormData();
    fd.append("rvHook", "rl_abcdefghijklmnop");
    expect(await f.provenHooksFromForm(fd, jay())).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Ad studio's ticked hooks", () => {
  it("keeps only ReelVault ids, at most 5, without repeats", () => {
    const ids = ["rl_abcdefghijklmnop", "rl_abcdefghijklmnop", "bad", "rl_ABCDEFGHIJKLMNOP", "rl_bbbbbbbbbbbbbbbb", "rl_cccccccccccccccc", "rl_dddddddddddddddd", "rl_eeeeeeeeeeeeeeee", "rl_ffffffffffffffff"];
    expect(f.pickedHookIds(ids)).toEqual(["rl_abcdefghijklmnop", "rl_bbbbbbbbbbbbbbbb", "rl_cccccccccccccccc", "rl_dddddddddddddddd", "rl_eeeeeeeeeeeeeeee"]);
  });

  it("re-reads the ticked hooks from ReelVault, never from the form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body({ hooks: [hook(), hook({ id: "rl_bbbbbbbbbbbbbbbb", text: "Second one.", hook_label: null })] })), { status: 200 })));
    const fd = new FormData();
    fd.append("rvHook", "rl_bbbbbbbbbbbbbbbb");
    fd.append("rvHook", "rl_zzzzzzzzzzzzzzzz");
    expect(await f.provenHooksFromForm(fd, jay())).toEqual([{ text: "Second one.", handle: "fitdadcoach", score: 4.2, hookType: "" }]);
    expect(await f.provenHooksFromForm(new FormData(), jay())).toEqual([]);
  });
});

describe("where the frame can open", () => {
  const dev = { appUrl: "http://localhost:3000", reelVaultUrl: "http://localhost:8800", isProd: false };
  const prod = { appUrl: "https://app.scaleitads.com", reelVaultUrl: "https://reelvault.scaleitads.com", isProd: true };

  it("opens on the app host and on localhost in development", () => {
    expect(f.embedHostState("app.scaleitads.com", prod).kind).toBe("ok");
    expect(f.embedHostState("localhost:3000", dev).kind).toBe("ok");
    expect(f.embedHostState("localhost:3005", dev).kind).toBe("ok");
  });

  it("tells a developer on 127.0.0.1 to use localhost (cross-site cookie)", () => {
    expect(f.embedHostState("127.0.0.1:3000", dev)).toEqual({ kind: "dev-mismatch", reelVaultHostname: "localhost", port: "3000" });
  });

  it("sends white-label hosts and production localhost to the new-tab button", () => {
    expect(f.embedHostState("app.someagency.com", prod).kind).toBe("elsewhere");
    expect(f.embedHostState("localhost:3000", prod).kind).toBe("elsewhere");
    expect(f.embedHostState("localhost:3000", { ...dev, reelVaultUrl: "https://reelvault.scaleitads.com" }).kind).toBe("elsewhere");
    expect(f.embedHostState("", prod).kind).toBe("elsewhere");
    // The app host itself, but ReelVault on another site: its cookie would be dropped in a frame.
    expect(f.embedHostState("app.scaleitads.com", { ...prod, reelVaultUrl: "https://reelvault.other.example" }).kind).toBe("elsewhere");
  });
});

describe("the workspace gates for a ReelVault ticket", () => {
  const open = { effectiveStatus: "active", viewAs: null, isPlatformAdmin: false, accessSource: "member", entryPending: false };

  it("matches requireWorkspace: paused, entry preview and a pending entry ticket are a no", () => {
    expect(f.workspaceGateOpen(open)).toBe(true);
    expect(f.workspaceGateOpen({ ...open, effectiveStatus: "grace" })).toBe(true);
    expect(f.workspaceGateOpen({ ...open, effectiveStatus: "paused" })).toBe(false);
    expect(f.workspaceGateOpen({ ...open, isPlatformAdmin: true, viewAs: "entry" })).toBe(false);
    expect(f.workspaceGateOpen({ ...open, entryPending: true })).toBe(false);
    expect(f.workspaceGateOpen({ ...open, entryPending: true, isPlatformAdmin: true })).toBe(true);
    expect(f.workspaceGateOpen({ ...open, entryPending: true, accessSource: "agency" })).toBe(true);
  });
});
