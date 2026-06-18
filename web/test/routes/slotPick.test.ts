import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, exhaustRateLimit, flushAfter } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { POST } = await import("@/app/api/slot-pick/route");

const ok = { mode: "classic", spinKey: "BOS|2010s", slot: "PG", personId: "isaiah_thomas" };
const HKEY = "slot_picks:classic:BOS|2010s:PG";

const post = async (body: unknown) => {
  const res = await POST(req("/api/slot-pick", { body }));
  await flushAfter();
  return res;
};

beforeEach(() => { freshFake(); });

describe("POST /api/slot-pick (silent crowd logging)", () => {
  it("always returns 204", async () => {
    expect((await post(ok)).status).toBe(204);
  });

  it("increments the per-player and __total__ counters for the slot", async () => {
    await post(ok);
    const h = ctx.redis!.hashes.get(HKEY);
    expect(h?.get("isaiah_thomas")).toBe("1");
    expect(h?.get("__total__")).toBe("1");
  });

  it("accumulates picks across players at the same slot", async () => {
    await post(ok);
    await post(ok);
    await post({ ...ok, personId: "rajon_rondo" });
    const h = ctx.redis!.hashes.get(HKEY);
    expect(h?.get("isaiah_thomas")).toBe("2");
    expect(h?.get("rajon_rondo")).toBe("1");
    expect(h?.get("__total__")).toBe("3");
  });

  it("defers the write via after() — 204 returns before the counter lands", async () => {
    const res = await POST(req("/api/slot-pick", { body: ok }));
    expect(res.status).toBe(204);
    expect(ctx.redis!.hashes.has(HKEY)).toBe(false);
    await flushAfter();
    expect(ctx.redis!.hashes.get(HKEY)?.get("isaiah_thomas")).toBe("1");
  });

  it("segments counts by mode (Classic crowd != Prime crowd)", async () => {
    await post(ok);
    await post({ ...ok, mode: "prime" });
    expect(ctx.redis!.hashes.has("slot_picks:classic:BOS|2010s:PG")).toBe(true);
    expect(ctx.redis!.hashes.has("slot_picks:prime:BOS|2010s:PG")).toBe(true);
  });

  it("returns 204 and writes nothing for malformed bodies", async () => {
    await post({ mode: "classic" });
    await post(null);
    await POST(req("/api/slot-pick", { rawBody: "not json", method: "POST" }));
    await flushAfter();
    expect([...ctx.redis!.hashes.keys()].some((k) => k.startsWith("slot_picks:"))).toBe(false);
  });

  it("silently drops (204, no write) once the per-IP bucket is exhausted", async () => {
    exhaustRateLimit("rl:slotpick:9.9.9.9", 150);
    const res = await POST(req("/api/slot-pick", { body: ok, ip: "9.9.9.9" }));
    await flushAfter();
    expect(res.status).toBe(204);
    expect(ctx.redis!.hashes.has(HKEY)).toBe(false);
  });
});
