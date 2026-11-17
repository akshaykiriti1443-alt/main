import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const WID = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";

type Ws = { id: string; status: "active" | "grace" | "paused"; accessSource: string };
const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; name: string; isPlatformAdmin: boolean },
  verified: true,
  // The workspaces getWorkspaceContext can open for this user, by id.
  workspaces: {} as Record<string, { ws: Ws; agencyPaused?: boolean; viewAs?: string | null }>,
  // The user's own (direct) memberships, for the no-workspace new-tab link.
  memberships: [] as string[],
  entryPending: new Set<string>(),
}));

vi.mock("@/server/auth", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/server/emailVerify", () => ({ isEmailVerified: async () => state.verified }));
vi.mock("@/server/tenancy", () => ({
  getWorkspaceContext: async (id: string) => {
    const w = state.workspaces[id];
    if (!w || !state.user) throw new Error("NEXT_NOT_FOUND");
    const effectiveStatus = w.agencyPaused ? "paused" : w.ws.status;
    return { user: state.user, workspace: w.ws, agency: { status: w.agencyPaused ? "paused" : "active" }, role: "owner", effectiveStatus, viewAs: w.viewAs ?? null };
  },
  listUserWorkspaces: async () =>
    state.memberships.map((id) => ({ workspace: state.workspaces[id].ws, role: "owner", agency: { status: state.workspaces[id].agencyPaused ? "paused" : "active" } })),
}));
vi.mock("@/server/unlocks", () => ({
  getEntryTicket: async () => ({ on: true }),
  entryTicketPending: async (_t: unknown, ws: { id: string }) => state.entryPending.has(ws.id),
}));

let GET: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.ONEX_SSO_SECRET = "test-secret-that-is-at-least-32-characters-long";
  process.env.REELVAULT_URL = "http://localhost:8800";
  ({ GET } = await import("@/app/api/reelvault/open/route"));
});

beforeEach(() => {
  state.user = { id: "u1", email: "Jay@ClimbRanked.test", name: "Jay", isPlatformAdmin: false };
  state.verified = true;
  state.workspaces = { [WID]: { ws: { id: WID, status: "active", accessSource: "member" } } };
  state.memberships = [WID];
  state.entryPending = new Set();
});

const open = (q = "") => GET(new Request(`http://localhost:3000/api/reelvault/open${q}`));
const embedQ = (more = "") => `?embed=1&w=${WID}${more}`;

describe("/api/reelvault/open in the frame (embed=1)", () => {
  it("sends the frame to ReelVault's sign-in with embed, parent, theme and to, never w", async () => {
    const res = await open(embedQ("&theme=dark&to=working%3Fdimension%3Dhook%26window%3Drecent"));
    expect(res.status).toBe(307);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    const to = new URL(res.headers.get("Location")!);
    expect(to.origin + to.pathname).toBe("http://localhost:8800/sso/onex");
    expect([...to.searchParams.keys()].sort()).toEqual(["embed", "parent", "t", "theme", "to"]);
    expect(to.searchParams.get("embed")).toBe("1");
    expect(to.searchParams.get("parent")).toBe("http://localhost:3000");
    expect(to.searchParams.get("theme")).toBe("dark");
    expect(to.searchParams.get("to")).toBe("working?dimension=hook&window=recent");
    const payload = JSON.parse(Buffer.from(to.searchParams.get("t")!.split(".")[1], "base64url").toString("utf8"));
    expect(payload.email).toBe("jay@climbranked.test");
  });

  it("drops a theme it doesn't know and sends a bad route home", async () => {
    for (const bad of ["%2F%2Fevil.example", "https%3A%2F%2Fevil.example", "admin", "reels%2F..%2F..%2Fx"]) {
      const to = new URL((await open(embedQ(`&theme=system&to=${bad}`))).headers.get("Location")!);
      expect(to.searchParams.has("theme")).toBe(false);
      expect(to.searchParams.get("to")).toBe("home");
    }
  });

  it("answers in plain words, never with a redirect, when it can't sign in", async () => {
    state.user = null;
    let res = await open(embedQ("&to=reels"));
    expect(res.status).toBe(401);
    expect(res.headers.get("Location")).toBeNull();
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("Sign in to OneX again.");

    state.user = { id: "u1", email: "a@b.test", name: "", isPlatformAdmin: false };
    state.verified = false;
    res = await open(embedQ());
    expect(res.status).toBe(403);
    expect(res.headers.get("Location")).toBeNull();
    expect(await res.text()).toBe("ReelVault is not available.");
  });

  const refused = async (q: string) => {
    const res = await open(q);
    expect(res.status).toBe(403);
    expect(res.headers.get("Location")).toBeNull();
    expect(await res.text()).toBe("ReelVault is not available.");
  };

  it("needs a workspace the member can open", async () => {
    await refused("?embed=1"); // no w
    await refused("?embed=1&w=not-a-uuid");
    await refused(`?embed=1&w=${OTHER}`); // not theirs (getWorkspaceContext says not found)
  });

  it("gives no ticket to a paused account", async () => {
    state.workspaces[WID].ws.status = "paused";
    await refused(embedQ());
    state.workspaces[WID].ws.status = "active";
    state.workspaces[WID].agencyPaused = true;
    await refused(embedQ());
  });

  it("gives no ticket before the entry ticket is done, or while previewing as a new member", async () => {
    state.entryPending.add(WID);
    await refused(embedQ());
    state.entryPending.clear();
    state.workspaces[WID].viewAs = "entry";
    await refused(embedQ());
  });

  it("lets a platform admin past the entry ticket, like requireWorkspace does", async () => {
    state.user = { id: "u1", email: "owner@x.test", name: "", isPlatformAdmin: true };
    state.entryPending.add(WID);
    expect((await open(embedQ())).status).toBe(307);
  });
});

describe("/api/reelvault/open as a new tab (no embed)", () => {
  it("keeps today's behaviour", async () => {
    let res = await open();
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("Location")!);
    expect([...to.searchParams.keys()]).toEqual(["t"]);

    state.user = null;
    res = await open();
    expect(new URL(res.headers.get("Location")!).pathname).toBe("/login");

    state.user = { id: "u1", email: "a@b.test", name: "", isPlatformAdmin: false };
    state.verified = false;
    res = await open("?embed=0");
    expect(new URL(res.headers.get("Location")!).pathname).toBe("/app");
  });

  it("checks the named workspace's gates (the white-label button passes w)", async () => {
    expect((await open(`?w=${WID}`)).status).toBe(307);
    expect([...new URL((await open(`?w=${WID}`)).headers.get("Location")!).searchParams.keys()]).toEqual(["t"]);
    state.workspaces[WID].ws.status = "paused";
    expect(new URL((await open(`?w=${WID}`)).headers.get("Location")!).pathname).toBe("/app");
  });

  it("without w, needs at least one workspace of theirs that is open", async () => {
    state.workspaces[WID].ws.status = "paused";
    expect(new URL((await open()).headers.get("Location")!).pathname).toBe("/app");
    state.workspaces[OTHER] = { ws: { id: OTHER, status: "active", accessSource: "member" } };
    state.memberships = [WID, OTHER];
    state.entryPending.add(OTHER);
    expect(new URL((await open()).headers.get("Location")!).pathname).toBe("/app");
    state.entryPending.clear();
    expect((await open()).status).toBe(307);
    state.memberships = [];
    expect(new URL((await open()).headers.get("Location")!).pathname).toBe("/app");
    state.user = { id: "u1", email: "owner@x.test", name: "", isPlatformAdmin: true };
    expect((await open()).status).toBe(307);
  });
});
