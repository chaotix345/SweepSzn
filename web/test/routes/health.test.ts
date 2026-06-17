import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, readJson } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());

enableRedisEnv();
const { GET } = await import("@/app/api/health/route");

beforeEach(() => { freshFake(); });

describe("GET /api/health", () => {
  it("returns ok:true with redis configured + reachable when Redis env is set", async () => {
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.redis).toMatchObject({ configured: true, reachable: true });
  });

  it("reports redis unreachable (but still configured) when the PING throws", async () => {
    // the canary's whole job: surface a configured-but-unreachable Redis (the common deploy failure)
    ctx.redis!.ping = async () => { throw new Error("redis down"); };
    const { body } = await readJson(await GET());
    expect(body.redis).toMatchObject({ configured: true, reachable: false });
  });

  it("never sets a cache header that would let a monitor see stale status", async () => {
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("reports configured booleans for push/auth/cron without leaking secret values", async () => {
    const { body } = await readJson(await GET());
    expect(typeof body.push).toBe("boolean");
    expect(typeof body.auth).toBe("boolean");
    expect(typeof body.cron).toBe("boolean");
    const json = JSON.stringify(body);
    expect(json).not.toContain("VAPID");
    expect(json).not.toContain("AUTH_SECRET");
  });
});
