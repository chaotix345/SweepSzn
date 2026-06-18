import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, exhaustRateLimit, signIn } from "@/test/routeHarness";
import { encodeLineup } from "@/lib/share";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET } = await import("@/app/api/dex/route");

const FIVE = [
  "michael_jordan_chi_1980s_1988",
  "lebron_james_cle_2000s_2009",
  "david_robinson_sas_1990s_1994",
  "nikola_joki_den_2020s_2024",
  "kevin_garnett_min_2000s_2004",
];
const result = (grade: string, mode = "classic") =>
  JSON.stringify({ encoded: encodeLineup(FIVE), mode, wins: 60, losses: 22, grade, ts: 1 });

beforeEach(() => { freshFake(); });

describe("GET /api/dex", () => {
  it("401 when not signed in", async () => {
    expect((await readJson(await GET(req("/api/dex")))).status).toBe(401);
  });

  it("returns the collected players, total, and badges for a signed-in user", async () => {
    await signIn({ uid: "user-dextester", name: "Dex" });
    ctx.redis!.lists.set("results:user-dextester", [result("S")]);
    const { status, body } = await readJson(await GET(req("/api/dex")));
    expect(status).toBe(200);
    expect(Array.isArray(body.players)).toBe(true);
    expect((body.players as unknown[]).length).toBe(5);
    expect(body.total).toBe(1);
    expect(body.badges).toContain("first");
    expect(body.badges).toContain("sTier"); // grade S in the result
  });

  it("dedupes the same player across multiple games", async () => {
    await signIn({ uid: "user-dextester2", name: "Dex2" });
    ctx.redis!.lists.set("results:user-dextester2", [result("F"), result("F", "daily")]);
    const { body } = await readJson(await GET(req("/api/dex")));
    expect((body.players as unknown[]).length).toBe(5); // same five, one set of cards
    expect(body.total).toBe(2);
  });

  it("includes players from the unbounded dex set even when results are empty (past the cap)", async () => {
    await signIn({ uid: "user-dexonly", name: "U" });
    ctx.redis!.sets.set("dex:user-dexonly", new Set(FIVE));
    const { body } = await readJson(await GET(req("/api/dex")));
    expect((body.players as unknown[]).length).toBe(5); // from the dex set alone
    expect(body.total).toBe(0); // no result rows
  });

  it("429 when the per-IP bucket is exhausted", async () => {
    exhaustRateLimit("rl:dex:1.2.3.4", 60);
    expect((await readJson(await GET(req("/api/dex", { ip: "1.2.3.4" })))).status).toBe(429);
  });
});
