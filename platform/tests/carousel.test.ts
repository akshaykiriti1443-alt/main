import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { CAROUSEL_LIMITS, GYM_EXAMPLE, cleanCarousel, cleanHandle, parseCarouselLook, scriptToSlides, starterSlides } from "@/server/carousel/shape";
import { carouselSlidePng, carouselZip, headingParts, slideItems, slideLayout } from "@/server/carousel/render";
import { crc32, zipStore } from "@/server/carousel/zip";
import { carouselCount, deleteCarousel, getCarousel, listCarousels, saveCarousel } from "@/server/carousel/store";
import { CAROUSEL_NO_AI, CAROUSEL_SCRIPT_NO_AI, scriptCarousel, slidesFromAi, writeCarousel } from "@/server/ai/carouselWrite";
import { handleMcpMessage, mcpTools } from "@/server/mcp";
import { playbookByName } from "@/server/playbooks";
import { createConnectorToken, resolveConnectorToken } from "@/server/connectors";
import { CLAUDE_JOBS } from "@/app/app/w/[wid]/ai/runs";
import { POSTING_TIP } from "@/app/app/w/[wid]/carousel/view";
import { makeWorkspace } from "./helpers";

// Make my carousel: the slides are drawn by code from what's saved, one workspace at a time.

const who = vi.hoisted(() => ({ user: null as null | { id: string; email: string; name: string; isPlatformAdmin: boolean }, ctx: null as unknown }));
vi.mock("@/server/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth")>()),
  getCurrentUser: async () => who.user,
  requireUser: async () => {
    if (!who.user) throw new Error("NEXT_REDIRECT");
    return who.user;
  },
}));
// The page renders as the signed-in owner; the API route keeps tenancy's real membership check.
vi.mock("@/server/tenancy", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/tenancy")>();
  type Ctx = Awaited<ReturnType<typeof real.requireWorkspace>>;
  return { ...real, requireWorkspace: async (...a: Parameters<typeof real.requireWorkspace>): Promise<Ctx> => (who.ctx ? (who.ctx as Ctx) : real.requireWorkspace(...a)) };
});
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
}));
// The AI: off unless a test hands it an answer.
const ai = vi.hoisted(() => ({ answer: null as unknown, fail: false, charged: 0, refunded: 0 }));
vi.mock("@/server/ai/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/ai/client")>();
  return {
    ...real,
    chargeAi: async (...a: Parameters<typeof real.chargeAi>) => {
      if (ai.answer === null && !ai.fail) return real.chargeAi(...a);
      ai.charged++;
      return { billedMicros: 0, byo: false, creds: null };
    },
    refundAi: async () => void ai.refunded++,
    generateStructured: async () => {
      if (ai.fail) throw new Error("The AI is busy right now. Please try again in a minute.");
      return { data: ai.answer, usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
});

const aiWas = env.aiEnabled;
beforeEach(() => {
  who.user = null;
  who.ctx = null;
  Object.assign(ai, { answer: null, fail: false, charged: 0, refunded: 0 });
});
afterEach(() => {
  env.aiEnabled = aiWas;
});

const six = GYM_EXAMPLE.slides;
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];
const isPng = (png: Buffer) => png.subarray(1, 4).toString("latin1") === "PNG";

describe("cleanCarousel: every carousel is clamped before it's saved or drawn", () => {
  it("keeps 4 to 8 slides: too few is refused, too many keeps the first 7 and the call to action", () => {
    expect(cleanCarousel({ slides: six.slice(0, 3) })).toMatchObject({ ok: false });
    expect(cleanCarousel({ slides: [...six.slice(0, 3), { heading: "  ", lines: ["", " "] }] })).toMatchObject({ ok: false });
    const many = Array.from({ length: 12 }, (_, i) => ({ heading: `Slide ${i + 1}`, lines: [] }));
    const res = cleanCarousel({ slides: many });
    if (!res.ok) throw new Error(res.error);
    expect(res.carousel.slides.map((s) => s.heading)).toEqual(["Slide 1", "Slide 2", "Slide 3", "Slide 4", "Slide 5", "Slide 6", "Slide 7", "Slide 12"]);
  });

  it("cleans and clamps every word, and moves a first line up when the big words are empty", () => {
    const res = cleanCarousel({
      title: "<b>My</b> post 🔥",
      handle: "@Gym.Dad_1",
      look: "midnight",
      slides: [
        { heading: "x ".repeat(200), lines: ["y ".repeat(200), "two", "three", "four"] },
        { heading: "", lines: ["Promoted line", "second"] },
        { heading: "<script>alert(1)</script>Fine", body: "a\nb" },
        { heading: "💪 Last" },
      ],
    });
    if (!res.ok) throw new Error(res.error);
    const c = res.carousel;
    expect(c.title).toBe("My post");
    expect(c.handle).toBe("Gym.Dad_1");
    expect(c.look).toBe("midnight");
    expect(c.slides[0].heading.length).toBeLessThanOrEqual(CAROUSEL_LIMITS.heading);
    expect(c.slides[0].lines).toHaveLength(CAROUSEL_LIMITS.lines);
    expect(c.slides[0].lines[0].length).toBeLessThanOrEqual(CAROUSEL_LIMITS.line);
    expect(c.slides[1]).toEqual({ heading: "Promoted line", lines: ["second"] });
    expect(c.slides[2]).toEqual({ heading: "alert(1) Fine", lines: ["a", "b"] });
    expect(c.slides[3]).toEqual({ heading: "Last", lines: [] });
  });

  it("only takes a real Instagram name and a known look", () => {
    expect(cleanHandle("https://instagram.com/fit.dad/")).toBe("fit.dad");
    expect(cleanHandle("@@ok_name")).toBe("ok_name");
    for (const bad of ["two words", "<x>", "a".repeat(31), 42, null]) expect(cleanHandle(bad)).toBe("");
    expect(parseCarouselLook("split")).toBe("glow");
    expect(parseCarouselLook("midnight")).toBe("midnight");
  });

  it("the starter always makes a full carousel from any topic", () => {
    const res = cleanCarousel({ slides: starterSlides("Fat loss for busy dads") });
    expect(res.ok && res.carousel.slides.length).toBe(5);
    expect(cleanCarousel({ slides: starterSlides("") }).ok).toBe(true);
  });
});

describe("Turn my script into slides, without AI", () => {
  it("puts the hook first and the call to action last, and drops labels, timings and camera notes", () => {
    const script = `HOOK (0-3s): If you're a dad over 35 and you train 6 days a week, you're wasting 3 of them.
Shot: phone at eye level, window light.
[0:03-0:10] Day A: squat and push. Goblet squat, push-ups, then a short walk.
Beat 2: Day B: hinge and pull. Romanian deadlift and dumbbell rows.
(smile)
Day C: carry and everything else.
CTA: Free plan, link in bio.`;
    const res = scriptToSlides(script);
    if (!res.ok) throw new Error(res.error);
    const all = JSON.stringify(res.slides);
    expect(res.slides[0].heading).toMatch(/^If you're a dad over 35/);
    expect(res.slides[res.slides.length - 1].heading).toBe("Free plan, link in bio.");
    expect(all).not.toMatch(/Shot|window light|smile|HOOK|CTA|0:03|Beat 2/);
    expect(res.slides.some((s) => s.heading === "Day A")).toBe(true);
    expect(res.slides.length).toBeGreaterThanOrEqual(CAROUSEL_LIMITS.minSlides);
    expect(res.slides.length).toBeLessThanOrEqual(CAROUSEL_LIMITS.maxSlides);
  });

  it("groups a long script into at most 8 slides, and asks for more when it's too short", () => {
    const long = Array.from({ length: 30 }, (_, i) => `Point number ${i + 1} is here.`).join("\n");
    const res = scriptToSlides(long);
    expect(res.ok && res.slides.length).toBe(CAROUSEL_LIMITS.maxSlides);
    expect(scriptToSlides("Just one line.")).toMatchObject({ ok: false });
    expect(scriptToSlides(42)).toMatchObject({ ok: false });
  });

  it("never calls the member's group free: it's a paid group (a free trial at most)", () => {
    // The last slide when nothing better was written, and every place that suggests it.
    const starter = JSON.stringify(starterSlides("fat loss"));
    const ruleSplit = scriptToSlides("Hook line here.\nFirst idea is this one.\nSecond idea is that one.\nThird idea too.");
    const defaults = [starter, JSON.stringify(ruleSplit.ok ? ruleSplit.slides : []), playbookByName("make_my_carousel")?.steps ?? "", JSON.stringify(mcpTools().find((t) => t.name === "save_carousel"))];
    for (const text of defaults) expect(text).not.toMatch(/free group/i);
    expect(starter).toContain("More in my group. Link in bio.");
  });
});

describe("The member's AI: Write it for me and Turn my script into slides", () => {
  it("takes the AI's slides only once they're cleaned and clamped", () => {
    const slides = slidesFromAi({
      slides: [
        { heading: "🔥 Hook here", lines: [] },
        ...Array.from({ length: 9 }, (_, i) => ({ heading: `Idea ${i + 1}`, lines: ["- one", "two", "three", "four"] })),
        { heading: "Save this.", lines: ["Link in bio."] },
      ],
    });
    expect(slides).toHaveLength(8);
    expect(slides[0].heading).toBe("Hook here");
    expect(slides[1].lines).toEqual(["one", "two", "three"]);
    expect(slides[7].heading).toBe("Save this.");
    expect(() => slidesFromAi({ slides: [{ heading: "Only", lines: [] }] })).toThrow(/too few/);
    expect(() => slidesFromAi("nonsense")).toThrow();
  });

  it("with no AI anywhere, gives a starter and the plain note", async () => {
    env.aiEnabled = false;
    const { ws } = await makeWorkspace();
    const res = await writeCarousel(ws.id, "3 easy gym days");
    expect(res).toMatchObject({ ok: true, usedAi: false, note: CAROUSEL_NO_AI });
    const script = await scriptCarousel(ws.id, "Hook: You need 3 days.\nDay A: squat.\nDay B: pull.\nDay C: carry.");
    expect(script).toMatchObject({ ok: true, usedAi: false, note: CAROUSEL_SCRIPT_NO_AI });
    expect(await writeCarousel(ws.id, "")).toMatchObject({ ok: false });
  });

  it("uses the AI's answer when it runs, and refunds and falls back when it fails", async () => {
    const { ws } = await makeWorkspace();
    ai.answer = { slides: six };
    const ok = await writeCarousel(ws.id, "3 gym days");
    expect(ok).toMatchObject({ ok: true, usedAi: true });
    expect(ok.ok && ok.slides).toEqual(six);

    ai.answer = null;
    ai.fail = true;
    const failed = await writeCarousel(ws.id, "3 gym days");
    expect(failed).toMatchObject({ ok: true, usedAi: false, model: "starter" });
    expect(ai.refunded).toBe(1);
  });
});

describe("Drawing", () => {
  it("keeps sentences on their own lines and never leaves a number alone", () => {
    expect(headingParts("You don't need 6 gym days. You need these 3.")).toEqual(["You don't need 6 gym days.", "You need these 3."]);
    expect(headingParts("1. Start small today")).toHaveLength(1);
    expect(slideItems(["Goblet squat 3×8 · Push-up 3×max · 10 min walk"])).toEqual(["Goblet squat 3×8", "Push-up 3×max", "10 min walk"]);
  });

  it("fits the longest allowed slide inside its card", () => {
    const heading = "Wwm ".repeat(30).slice(0, CAROUSEL_LIMITS.heading);
    const line = "Mmw wide words ".repeat(8).slice(0, CAROUSEL_LIMITS.line);
    for (const role of ["hook", "point", "cta"] as const) {
      const l = slideLayout(role, heading, [line, line, line]);
      expect(l.height, role).toBeLessThanOrEqual(1052 - 152);
      expect(l.body).toBeGreaterThanOrEqual(28);
    }
    // Short words keep their big sizes.
    expect(slideLayout("hook", "Stop doing this.", []).head).toBeGreaterThanOrEqual(130);
  });

  it("draws every slide as a 1080x1350 PNG in both looks", async () => {
    const c = { ...GYM_EXAMPLE, handle: "fit.dad" };
    for (const look of ["glow", "midnight"] as const) {
      for (const n of [1, 2, 6]) {
        const png = await carouselSlidePng(c, n, look, "#7c3aed");
        expect(isPng(png)).toBe(true);
        expect(pngSize(png)).toEqual([1080, 1350]);
      }
    }
  });
});

/** The entries of a stored ZIP, read back the way an unzip tool does: from the central directory. */
function readZip(zip: Buffer) {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  const cdSize = zip.readUInt32LE(end + 12);
  let p = zip.readUInt32LE(end + 16);
  expect(p + cdSize).toBe(end);
  const out: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(p + 16);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("ascii");
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    expect(zip.readUInt16LE(local + 8)).toBe(0); // stored
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    expect(zip.readUInt32LE(local + 14)).toBe(crc);
    out.push({ name, data });
    p += 46 + nameLen;
  }
  return out;
}

describe("The ZIP of all slides", () => {
  it("computes the standard CRC-32 and writes a valid stored ZIP", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
    const files = [
      { name: "a.txt", data: Buffer.from("hello") },
      { name: "b/c.bin", data: Buffer.from([0, 1, 2, 255]) },
      { name: "empty.txt", data: Buffer.alloc(0) },
    ];
    const back = readZip(zipStore(files));
    expect(back.map((f) => f.name)).toEqual(["a.txt", "b/c.bin", "empty.txt"]);
    back.forEach((f, i) => expect(Buffer.compare(f.data, files[i].data)).toBe(0));
  });

  it("holds every slide in order as a PNG", async () => {
    const zip = await carouselZip({ ...GYM_EXAMPLE, title: "Gym days!" }, "glow", "#2A44EE");
    const back = readZip(zip);
    expect(back.map((f) => f.name)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `gym-days-slide-${n}.png`));
    for (const f of back) {
      expect(isPng(f.data)).toBe(true);
      expect(pngSize(f.data)).toEqual([1080, 1350]);
    }
  });
});

describe("Saved carousels stay in their own workspace", () => {
  it("saves, lists, updates and deletes only this workspace's carousels", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const saved = await saveCarousel(a.ws.id, GYM_EXAMPLE, { source: "example" });
    if (!saved.ok) throw new Error(saved.error);
    const id = saved.carousel.id;
    expect(await carouselCount(a.ws.id)).toBe(1);
    expect(await carouselCount(b.ws.id)).toBe(0);
    expect(await getCarousel(b.ws.id, id)).toBeNull();
    expect(await listCarousels(b.ws.id)).toEqual([]);
    // Another workspace can't overwrite or delete it.
    expect(await saveCarousel(b.ws.id, GYM_EXAMPLE, { id, source: "hand" })).toMatchObject({ ok: false });
    expect(await deleteCarousel(b.ws.id, id)).toBe(false);
    // Its own workspace can.
    const edited = await saveCarousel(a.ws.id, { ...GYM_EXAMPLE, slides: [{ heading: "New hook" }, ...six.slice(1)] }, { id, source: "hand" });
    expect(edited.ok && edited.carousel.slides[0].heading).toBe("New hook");
    // Where it first came from stays on it.
    expect((await getCarousel(a.ws.id, id))?.source).toBe("example");
    expect(await deleteCarousel(a.ws.id, id)).toBe(true);
    expect(await getCarousel(a.ws.id, id)).toBeNull();
  });
});

async function get(q: string) {
  const { GET } = await import("@/app/api/carousel/route");
  return GET(new Request(`http://localhost:3000/api/carousel?${q}`));
}
const signIn = (u: { id: string; email: string; name: string }) => (who.user = { id: u.id, email: u.email, name: u.name, isPlatformAdmin: false });

describe("GET /api/carousel", () => {
  it("asks for a sign-in, and is 404 for someone else's workspace or carousel", async () => {
    const mine = await makeWorkspace();
    const theirs = await makeWorkspace();
    const theirC = await saveCarousel(theirs.ws.id, GYM_EXAMPLE, { source: "example" });
    const myC = await saveCarousel(mine.ws.id, GYM_EXAMPLE, { source: "example" });
    if (!theirC.ok || !myC.ok) throw new Error("save failed");
    expect((await get(`w=${mine.ws.id}&id=${myC.carousel.id}`)).status).toBe(401);
    signIn(mine.user);
    expect((await get(`w=${theirs.ws.id}&id=${theirC.carousel.id}`)).status).toBe(404);
    // Their carousel through my workspace: still not found.
    expect((await get(`w=${mine.ws.id}&id=${theirC.carousel.id}`)).status).toBe(404);
    expect((await get(`w=${mine.ws.id}&id=${myC.carousel.id}&slide=7`)).status).toBe(404);
    expect((await get(`w=${mine.ws.id}&id=${myC.carousel.id}&slide=0`)).status).toBe(404);
  });

  it("is closed for a paused account", async () => {
    const { ws, user } = await makeWorkspace();
    const c = await saveCarousel(ws.id, GYM_EXAMPLE, { source: "example" });
    const db = await getDb();
    await db.update(workspaces).set({ status: "paused" }).where(eq(workspaces.id, ws.id));
    signIn(user);
    expect((await get(`w=${ws.id}&id=${c.ok && c.carousel.id}`)).status).toBe(403);
  });

  it("draws a slide inline or as a download, and every slide as a ZIP", async () => {
    const { ws, user } = await makeWorkspace();
    const c = await saveCarousel(ws.id, GYM_EXAMPLE, { source: "example" });
    if (!c.ok) throw new Error(c.error);
    signIn(user);
    const preview = await get(`w=${ws.id}&id=${c.carousel.id}&slide=2&look=midnight`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Content-Type")).toBe("image/png");
    expect(preview.headers.get("Content-Disposition")).toBe("inline");
    expect(preview.headers.get("Cache-Control")).toBe("private, no-store");
    expect(pngSize(Buffer.from(await preview.arrayBuffer()))).toEqual([1080, 1350]);

    const one = await get(`w=${ws.id}&id=${c.carousel.id}&slide=6&download=1`);
    expect(one.headers.get("Content-Disposition")).toBe('attachment; filename="you-need-these-3-gym-days-slide-6.png"');
    await one.arrayBuffer();

    const zip = await get(`w=${ws.id}&id=${c.carousel.id}&zip=1`);
    expect(zip.status).toBe(200);
    expect(zip.headers.get("Content-Type")).toBe("application/zip");
    expect(zip.headers.get("Content-Disposition")).toBe('attachment; filename="you-need-these-3-gym-days-slides.zip"');
    expect(readZip(Buffer.from(await zip.arrayBuffer()))).toHaveLength(6);
  });
});

const call = async (workspaceId: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await handleMcpMessage({ workspaceId }, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const result = res?.result as { content: { text: string }[]; isError: boolean };
  return { isError: result.isError, text: result.content[0].text, json: () => JSON.parse(result.content[0].text) };
};

describe("The Claude road: save_carousel and list_carousels", () => {
  it("are listed, and the page's sentence is the playbook's", () => {
    const names = mcpTools().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["save_carousel", "list_carousels"]));
    expect(CLAUDE_JOBS.carousel.say).toBe("Turn my ReelVault script into a 6-slide carousel and save it in OneX.");
    expect(CLAUDE_JOBS.carousel.say).toBe(playbookByName("make_my_carousel")!.say);
    expect(playbookByName("make_my_carousel")!.steps).toContain("save_carousel");
    expect(playbookByName("make_my_carousel")!.steps).toContain(POSTING_TIP.replace("On Instagram: ", ""));
  });

  it("saves a carousel to this workspace only, and changes one only by its own id", async () => {
    const a = await makeWorkspace();
    const b = await makeWorkspace();
    const saved = await call(a.ws.id, "save_carousel", { title: "Gym days", slides: six, handle: "@fit.dad" });
    expect(saved.isError).toBe(false);
    const out = saved.json();
    expect(out).toMatchObject({ ok: true, title: "Gym days", slides: 6, look: "glow" });
    expect(out.view).toBe(`http://localhost:3000/app/w/${a.ws.id}/carousel?id=${out.carouselId}`);
    expect((await getCarousel(a.ws.id, out.carouselId))?.source).toBe("claude");

    const listA = (await call(a.ws.id, "list_carousels")).json();
    expect(listA).toHaveLength(1);
    expect(listA[0]).toMatchObject({ carouselId: out.carouselId, handle: "fit.dad" });
    expect(listA[0].slides[1]).toEqual(six[1]);
    expect((await call(b.ws.id, "list_carousels")).json()).toEqual([]);

    // b can't reach a's carousel by its id.
    const cross = await call(b.ws.id, "save_carousel", { carouselId: out.carouselId, slides: six });
    expect(cross.isError).toBe(true);
    expect(cross.text).toMatch(/not found/i);
    expect((await getCarousel(a.ws.id, out.carouselId))?.title).toBe("Gym days");

    // a changes its own, keeping the name and handle it had.
    const edit = await call(a.ws.id, "save_carousel", { carouselId: out.carouselId, slides: [{ heading: "New hook" }, ...six.slice(1)], look: "midnight" });
    expect(edit.json()).toMatchObject({ carouselId: out.carouselId, look: "midnight", title: "Gym days" });
    expect((await getCarousel(a.ws.id, out.carouselId))?.handle).toBe("fit.dad");
  });

  it("refuses too few or too many slides, and a paused workspace", async () => {
    const { ws } = await makeWorkspace();
    expect((await call(ws.id, "save_carousel", { slides: six.slice(0, 3) })).isError).toBe(true);
    expect((await call(ws.id, "save_carousel", { slides: [...six, ...six] })).isError).toBe(true);
    expect((await call(ws.id, "save_carousel", { slides: [{ heading: "" }, { heading: "" }, { heading: "a" }, { heading: "b" }] })).text).toMatch(/4 to 8 slides/);
    const db = await getDb();
    await db.update(workspaces).set({ status: "paused" }).where(eq(workspaces.id, ws.id));
    const paused = await call(ws.id, "list_carousels");
    expect(paused.isError).toBe(true);
    expect(paused.text).toMatch(/paused/);
  });
});

type PageFn = (p: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) => Promise<unknown>;
async function pageText(wid: string, sp: Record<string, string> = {}) {
  const el = await ((await import("@/app/app/w/[wid]/carousel/page")).default as PageFn)({ params: Promise.resolve({ wid }), searchParams: Promise.resolve(sp) });
  return renderToStaticMarkup(el as React.ReactElement)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|“|”/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
async function asOwner() {
  const made = await makeWorkspace();
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, made.ws.id));
  who.ctx = { workspace: ws, user: { ...made.user, isPlatformAdmin: false }, role: "owner", viewAs: null };
  return made;
}

describe("The Make my carousel page", () => {
  it("starts with the two ways in, and the Claude sentence as a tip", async () => {
    const { ws } = await asOwner();
    const text = await pageText(ws.id);
    for (const label of ["Make my carousel", "Write it for me", "Turn my script into slides", "Show me an example"]) expect(text).toContain(label);
    expect(text).toContain(`"${CLAUDE_JOBS.carousel.say}"`);
    expect(text).not.toContain("You're on the Claude road");
  });

  it("shows a saved carousel's slides, downloads, the posting tip and the list; Claude connected gets the Claude road card", async () => {
    const { ws, user } = await asOwner();
    const c = await saveCarousel(ws.id, GYM_EXAMPLE, { source: "example" });
    if (!c.ok) throw new Error(c.error);
    await resolveConnectorToken((await createConnectorToken(ws.id, user.id, "Claude")).token);
    const text = await pageText(ws.id, { id: c.carousel.id });
    for (const label of ["Your slides", "Try another look", "Download all slides", "Download", "Change any words", "Save changes", "Add a slide", "Your carousels", "Make another one"]) expect(text).toContain(label);
    expect(text).toContain(POSTING_TIP);
    expect(text).toContain("You're on the Claude road");
    expect(text).toContain(`"${CLAUDE_JOBS.carousel.say}"`);
    expect(text).toContain("You need these 3 gym days");
  });
});
