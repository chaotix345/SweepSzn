import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, authEnv, signIn, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
authEnv();

const { GET, POST } = await import("@/app/api/daily/ceiling/route");
const { computeDailyCeiling, _resetCeilingMemo } = await import("@/lib/dailyCeiling");

// The clock is pinned so "today" is a fixed Daily: 2026-11-20 (past = 2026-11-19, future = 2026-11-21).
const TODAY = "2026-11-20", PAST = "2026-11-19", FUTURE = "2026-11-21";
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(Date.UTC(2026, 10, 20, 15))); });
afterAll(() => { vi.useRealTimers(); });

const ANON = "anon-uid-12345678";
const get = (date: string, ip?: string) => GET(req(`/api/daily/ceiling?date=${date}`, { ip }));
const post = (body: unknown, url = "/api/daily/ceiling") => POST(req(url, { body }));

// A verified submission = a row on that day's board (only the replay-verified submit writes one).
function seedRow(date: string, uid: string, wins: number) {
  const h = ctx.redis!.hashes.get(`lb:${date}:meta`) ?? new Map<string, string>();
  h.set(uid, JSON.stringify({ uid, name: "P", wins, losses: 82 - wins, net: 1, lineup: "a,b,c,d,e" }));
  ctx.redis!.hashes.set(`lb:${date}:meta`, h);
  const z = ctx.redis!.zsets.get(`lb:${date}`) ?? new Map<string, number>();
  z.set(uid, wins * 1000);
  ctx.redis!.zsets.set(`lb:${date}`, z);
}

const ceilingKeys = () => [...ctx.redis!.strings.keys()].filter((k) => k.startsWith("ceiling:"));

beforeEach(() => { freshFake(); _resetCeilingMemo(); });

describe("§12 gate 1: today's ceiling only after a verified submit", () => {
  it("GET never serves today (nor a future day), even with no viewer at all", async () => {
    for (const d of [TODAY, FUTURE]) {
      const { status, body } = await readJson(await get(d));
      expect(status).toBe(403);
      expect(body).toEqual({ error: "locked until the daily rolls over" });
    }
    expect(ceilingKeys()).toEqual([]); // not even computed
  });

  it("POST for today without a verified submission → 403 and no ceiling data", async () => {
    const { status, body } = await readJson(await post({ date: TODAY, uid: ANON }));
    expect(status).toBe(403);
    expect(body).toEqual({ error: "submit today's daily first" });
    expect(ceilingKeys()).toEqual([]);
  });

  it("a row on another day doesn't unlock today", async () => {
    seedRow(PAST, ANON, 50);
    expect((await post({ date: TODAY, uid: ANON })).status).toBe(403);
  });

  it("POST for today after a verified submission → record + gap only, never the lineup", async () => {
    seedRow(TODAY, ANON, 50);
    const rec = computeDailyCeiling(TODAY)!;
    const { status, body } = await readJson(await post({ date: TODAY, uid: ANON }));
    expect(status).toBe(200);
    expect(body).toEqual({ date: TODAY, ceiling: { wins: rec.wins, losses: rec.losses }, you: { wins: 50, gap: rec.wins - 50 } });
    const text = JSON.stringify(body);
    for (const p of rec.lineup) expect(text).not.toContain(p.id);
  });

  it("the uid only counts from the body; a uid in the URL is ignored", async () => {
    seedRow(TODAY, ANON, 50);
    const { status, body } = await readJson(await post({ date: TODAY }, `/api/daily/ceiling?uid=${ANON}`));
    expect(status).toBe(400);
    expect(body.ceiling).toBeUndefined();
  });

  it("rejects a malformed uid", async () => {
    expect((await post({ date: TODAY, uid: "x" })).status).toBe(400);
  });

  it("a session is authoritative: a signed-in viewer with no row can't borrow another uid's row", async () => {
    seedRow(TODAY, ANON, 50);
    await signIn({ uid: "g0123456789abcdef0123456789abcde", name: "Carol" });
    expect((await post({ date: TODAY, uid: ANON })).status).toBe(403);
    seedRow(TODAY, "g0123456789abcdef0123456789abcde", 61);
    const { status, body } = await readJson(await post({ date: TODAY, uid: ANON }));
    expect(status).toBe(200);
    expect((body.you as { wins: number }).wins).toBe(61);
  });

  it("future days are refused by POST too, even with a row", async () => {
    seedRow(FUTURE, ANON, 50);
    expect((await post({ date: FUTURE, uid: ANON })).status).toBe(403);
  });
});

describe("§12 gate 2: the lineup only for past days", () => {
  it("GET a past day → the full five, CDN-cacheable", async () => {
    const rec = computeDailyCeiling(PAST)!;
    const res = await get(PAST);
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/public/);
    const c = body.ceiling as { wins: number; lineup: { id: string }[]; seg: string };
    expect(c.wins).toBe(rec.wins);
    expect(c.lineup.map((x) => x.id)).toEqual(rec.lineup.map((x) => x.id));
    expect(c.seg).toBe(rec.seg);
  });

  it("POST a past day → the five plus your gap when you played it, private", async () => {
    seedRow(PAST, ANON, 44);
    const rec = computeDailyCeiling(PAST)!;
    const res = await post({ date: PAST, uid: ANON });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect((body.ceiling as { lineup: unknown[] }).lineup).toHaveLength(5);
    expect(body.you).toEqual({ wins: 44, gap: rec.wins - 44 });
    const anon = await readJson(await post({ date: PAST }));
    expect(anon.status).toBe(200);
    expect(anon.body.you).toBeUndefined();
  });
});

describe("dates", () => {
  it("normalizes zero-padding to the seed spelling (a padded date is the same Daily)", async () => {
    const a = await readJson(await get("2026-06-09"));
    const b = await readJson(await get("2026-6-9"));
    expect(a.body.date).toBe("2026-6-9");
    expect(a.body).toEqual(b.body);
  });

  it("rejects malformed and impossible dates, and days before the first Daily", async () => {
    for (const d of ["", "2026-13-1", "2026-2-30", "x", "2026-6"]) expect((await get(d)).status).toBe(400);
    expect((await get("2026-6-5")).status).toBe(404);
    expect((await post({ date: 42, uid: ANON })).status).toBe(400);
  });
});

describe("caching + limits", () => {
  it("stores the computed ceiling in Redis with a long TTL and serves it from there", async () => {
    await get(PAST);
    const [key] = ceilingKeys();
    expect(key).toMatch(/^ceiling:v1:[a-z0-9]+:2026-11-19$/);
    expect(ctx.redis!.ttls.get(key)).toBeGreaterThan(60 * 60 * 24 * 300);
    // prove the read path: tamper the stored record, drop the memo, and the route returns Redis's copy
    const stored = JSON.parse(ctx.redis!.strings.get(key)!);
    ctx.redis!.strings.set(key, JSON.stringify({ ...stored, wins: 99 }));
    _resetCeilingMemo();
    expect(((await readJson(await get(PAST))).body.ceiling as { wins: number }).wins).toBe(99);
  });

  it("rate-limits per IP", async () => {
    exhaustRateLimit("rl:ceiling:9.9.9.9", 30);
    expect((await get(PAST, "9.9.9.9")).status).toBe(429);
  });
});
