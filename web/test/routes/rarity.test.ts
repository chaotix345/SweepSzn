import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET } = await import("@/app/api/rarity/route");

const FIVE = ["michael_jordan", "scottie_pippen", "horace_grant", "ron_harper", "luc_longley"];
const get = (ids: string[], ip?: string) => GET(req(`/api/rarity?ids=${ids.join(",")}`, ip ? { ip } : undefined));
const coreKey = [...FIVE].sort().join(",");

beforeEach(() => { freshFake(); });

describe("GET /api/rarity (post-commit badge)", () => {
  it("returns null below the volume gate (<100 total cores)", async () => {
    ctx.redis!.strings.set("core_picks:total", "50");
    ctx.redis!.hashes.set("core_picks", new Map([[coreKey, "3"]]));
    expect((await readJson(await get(FIVE))).body.rarity).toBeNull();
  });

  it("returns the rarity percentage once the sample is large enough", async () => {
    ctx.redis!.strings.set("core_picks:total", "1000");
    ctx.redis!.hashes.set("core_picks", new Map([[coreKey, "28"]]));
    const { body } = await readJson(await get(FIVE));
    expect((body.rarity as { pct: number; total: number }).pct).toBeCloseTo(2.8, 1);
    expect((body.rarity as { total: number }).total).toBe(1000);
  });

  it("400 when not exactly 5 ids, 429 when rate-limited", async () => {
    expect((await readJson(await get(["a", "b"]))).status).toBe(400);
    exhaustRateLimit("rl:rarity:1.2.3.4", 120);
    expect((await readJson(await get(FIVE, "1.2.3.4"))).status).toBe(429);
  });
});
