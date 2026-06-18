import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET } = await import("@/app/api/crowd/route");

const get = (qs: string, ip?: string) => GET(req(`/api/crowd?${qs}`, ip ? { ip } : undefined));
const seedSlot = (hash: string, fields: Record<string, number>) => {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(fields)) m.set(k, String(v));
  ctx.redis!.hashes.set(hash, m);
};

beforeEach(() => { freshFake(); });

describe("GET /api/crowd (post-lock reveal)", () => {
  it("returns null below the volume gate (<20 plays)", async () => {
    seedSlot("slot_picks:classic:CHI|1990s:SG", { michael_jordan: 5, __total__: 5 });
    const { status, body } = await readJson(await get("mode=classic&spinKey=CHI|1990s&slot=SG"));
    expect(status).toBe(200);
    expect(body.crowd).toBeNull();
  });

  it("returns top choices with share + resolved names once volume is sufficient", async () => {
    seedSlot("slot_picks:classic:CHI|1990s:SG", { michael_jordan: 18, ron_harper: 7, __total__: 25 });
    const { body } = await readJson(await get("mode=classic&spinKey=CHI|1990s&slot=SG"));
    const crowd = body.crowd as { total: number; choices: { personId: string; name: string; pct: number }[] };
    expect(crowd.total).toBe(25);
    expect(crowd.choices[0].personId).toBe("michael_jordan");
    expect(crowd.choices[0].pct).toBeCloseTo(72, 0);
    expect(crowd.choices[0].name).toMatch(/Jordan/);
  });

  it("400 on bad params, 429 when rate-limited", async () => {
    expect((await readJson(await get("mode=nope&spinKey=CHI|1990s&slot=SG"))).status).toBe(400);
    exhaustRateLimit("rl:crowd:1.2.3.4", 120);
    expect((await readJson(await get("mode=classic&spinKey=CHI|1990s&slot=SG", "1.2.3.4"))).status).toBe(429);
  });
});
