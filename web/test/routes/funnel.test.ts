import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { enableRedisEnv, freshFake, signIn, ctx, req, readJson } from "@/test/routeHarness";
import { isoWeek } from "@/lib/isoweek";
import { encScore } from "@/lib/score";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET } = await import("@/app/api/funnel/route");

const ADMIN = "g123456789012345678901234567890ab";

// Freeze the clock so getMetrics' window (ending "today") matches the seeded day key deterministically.
beforeEach(() => {
  freshFake();
  vi.useFakeTimers({ now: Date.parse("2026-06-18T12:00:00Z"), toFake: ["Date"] });
  process.env.ADMIN_UIDS = ADMIN;
});
afterAll(() => { vi.useRealTimers(); });

describe("GET /api/funnel", () => {
  it("404 when there is no session (route hidden from non-admins)", async () => {
    const res = await GET(req("/api/funnel"));
    expect(res.status).toBe(404);
  });

  it("404 for a signed-in non-admin", async () => {
    await signIn({ uid: "g000000000000000000000000000000zz", name: "Mallory" });
    const res = await GET(req("/api/funnel"));
    expect(res.status).toBe(404);
  });

  it("returns the funnel metrics JSON for an admin session", async () => {
    await signIn({ uid: ADMIN, name: "Charlie" });
    ctx.redis!.strings.set("ev:visit:2026-6-18", "8");
    ctx.redis!.strings.set("ev:first_play:2026-6-18", "2");
    ctx.redis!.strings.set("ev:compare_friend:2026-6-18", "1");

    const { status, body } = await readJson(await GET(req("/api/funnel?days=14")));
    expect(status).toBe(200);
    const funnel = body.funnel as Record<string, number>;
    const rates = body.rates as Record<string, number>;
    const engagement = body.engagement as Record<string, number>;
    expect(funnel.visits).toBe(8);
    expect(funnel.firstPlays).toBe(2);
    expect(Math.abs(rates.firstPlay - 2 / 8)).toBeLessThan(1e-9);
    expect(engagement.compareFriend).toBe(1);
  });

  it("clamps the days window to [2, 60]", async () => {
    await signIn({ uid: ADMIN, name: "Charlie" });
    const big = await readJson(await GET(req("/api/funnel?days=999")));
    expect((big.body.days as string[]).length).toBe(60);
    const small = await readJson(await GET(req("/api/funnel?days=1")));
    expect((small.body.days as string[]).length).toBe(2);
  });

  it("defaults to a 14-day window when days is absent or invalid", async () => {
    await signIn({ uid: ADMIN, name: "Charlie" });
    const { body } = await readJson(await GET(req("/api/funnel?days=abc")));
    expect((body.days as string[]).length).toBe(14);
  });

  it("splits first_play and visit by acquisition source", async () => {
    await signIn({ uid: ADMIN, name: "Charlie" });
    ctx.redis!.hashes.set("ev:src:first_play:2026-6-18", new Map([["x_launch", "3"], ["reddit", "1"]]));
    ctx.redis!.hashes.set("ev:src:visit:2026-6-18", new Map([["x_launch", "10"]]));

    const { body } = await readJson(await GET(req("/api/funnel?days=14")));
    const ss = body.sourceSplit as { firstPlay: Record<string, number>; visit: Record<string, number> };
    expect(ss.firstPlay.x_launch).toBe(3);
    expect(ss.firstPlay.reddit).toBe(1);
    expect(ss.visit.x_launch).toBe(10);
  });

  it("exposes the sign-in nudge stages in engagement and splits them by mode", async () => {
    await signIn({ uid: ADMIN, name: "Charlie" });
    ctx.redis!.strings.set("ev:claim_nudge_shown:2026-6-18", "5");
    ctx.redis!.strings.set("ev:claim_nudge_tap:2026-6-18", "2");
    ctx.redis!.hashes.set("ev:nudge:claim_nudge_shown:2026-6-18", new Map([["classic", "4"], ["hoopiq", "1"]]));
    ctx.redis!.hashes.set("ev:nudge:claim_nudge_tap:2026-6-18", new Map([["classic", "2"]]));

    const { body } = await readJson(await GET(req("/api/funnel?days=14")));
    const eng = body.engagement as Record<string, number>;
    expect(eng.claimNudgeShown).toBe(5);
    expect(eng.claimNudgeTap).toBe(2);
    const ns = body.nudgeSplit as { shown: Record<string, number>; tap: Record<string, number> };
    expect(ns.shown.classic).toBe(4);
    expect(ns.shown.hoopiq).toBe(1);
    expect(ns.tap.classic).toBe(2);
  });

  it("reads the win distribution from the WEEKLY board (the daily board resets at the UTC midnight)", async () => {
    await signIn({ uid: ADMIN, name: "Charlie" });
    const wk = `lb:week:${isoWeek("2026-6-18")}`;
    ctx.redis!.zsets.set(wk, new Map([
      ["u1", encScore(80, 5)],   // 78-82
      ["u2", encScore(65, 2)],   // 60-69
      ["u3", encScore(50, -10)], // <60
    ]));
    // The daily board holds DIFFERENT (all sub-60) entries — proving winBuckets does not read it.
    ctx.redis!.zsets.set("lb:2026-6-18", new Map([["d1", encScore(10, -50)], ["d2", encScore(20, -30)]]));

    const { body } = await readJson(await GET(req("/api/funnel?days=14")));
    const by = Object.fromEntries((body.winBuckets as { label: string; count: number }[]).map(b => [b.label, b.count]));
    expect(by["78-82"]).toBe(1); // u1 — only present on the weekly board
    expect(by["70-77"]).toBe(0);
    expect(by["60-69"]).toBe(1); // u2
    expect(by["<60"]).toBe(1);   // u3 (NOT the two daily entries)
  });
});
