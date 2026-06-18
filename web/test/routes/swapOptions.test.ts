import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, req, readJson, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET } = await import("@/app/api/swap-options/route");

const get = (qs: string, ip?: string) => GET(req(`/api/swap-options?${qs}`, ip ? { ip } : undefined));

beforeEach(() => { freshFake(); });

// The What-If Lab's swap options: descriptive candidates for a slot, fame-sorted. Post-commit only
// and never ranked by outcome (DESIGN.md §12) — the Lab re-scores only after the user picks.
describe("GET /api/swap-options", () => {
  it("returns slot-eligible candidates for a real team+decade", async () => {
    const { status, body } = await readJson(await get("team=CHI&decade=1990s&slot=SG"));
    expect(status).toBe(200);
    expect(Array.isArray(body.candidates)).toBe(true);
    const cands = body.candidates as { eligible: string[] }[];
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) expect(c.eligible).toContain("SG");
  });

  it("400 on malformed params", async () => {
    expect((await readJson(await get("team=CHICAGO&decade=1990s&slot=SG"))).status).toBe(400);
    expect((await readJson(await get("team=CHI&decade=90s&slot=SG"))).status).toBe(400);
    expect((await readJson(await get("team=CHI&decade=1990s&slot=ZZ"))).status).toBe(400);
  });

  it("429 when the per-IP bucket is exhausted", async () => {
    exhaustRateLimit("rl:swap:1.2.3.4", 120);
    expect((await readJson(await get("team=CHI&decade=1990s&slot=SG", "1.2.3.4"))).status).toBe(429);
  });
});
