import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, req, readJson, exhaustRateLimit } from "@/test/routeHarness";
import { encodeLineup } from "@/lib/share";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET } = await import("@/app/api/result/[lineup]/route");

const FIVE = [
  "michael_jordan_chi_1980s_1988",
  "lebron_james_cle_2000s_2009",
  "david_robinson_sas_1990s_1994",
  "nikola_joki_den_2020s_2024",
  "kevin_garnett_min_2000s_2004",
];
const get = (lineup: string, ip?: string) =>
  GET(req(`/api/result/${lineup}`, ip ? { ip } : undefined), { params: Promise.resolve({ lineup }) });

beforeEach(() => { freshFake(); });

describe("GET /api/result/[lineup] (friend-compare JSON)", () => {
  it("returns the resolved five + result for a valid lineup segment", async () => {
    const { status, body } = await readJson(await get(encodeLineup(FIVE)));
    expect(status).toBe(200);
    expect(Array.isArray(body.players)).toBe(true);
    expect((body.players as unknown[]).length).toBe(5);
    const res = body.result as { wins: number; ortg: number };
    expect(typeof res.wins).toBe("number");
    expect(typeof res.ortg).toBe("number");
    expect(body.hinted).toBe(false);
  });

  it("404 for a malformed / non-resolving segment", async () => {
    expect((await readJson(await get(encodeLineup(FIVE.slice(0, 4))))).status).toBe(404);
    expect((await readJson(await get("not-a-real-lineup"))).status).toBe(404);
  });

  it("429 when the per-IP bucket is exhausted", async () => {
    exhaustRateLimit("rl:result:1.2.3.4", 120);
    expect((await readJson(await get(encodeLineup(FIVE), "1.2.3.4"))).status).toBe(429);
  });
});
