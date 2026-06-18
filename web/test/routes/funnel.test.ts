import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { enableRedisEnv, freshFake, signIn, ctx, req, readJson } from "@/test/routeHarness";

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
});
