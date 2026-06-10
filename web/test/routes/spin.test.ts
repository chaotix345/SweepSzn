import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { POST } = await import("@/app/api/spin/route");

const post = (body: unknown, ip = "1.2.3.4") => POST(req("/api/spin", { body, ip }));

beforeEach(() => { freshFake(); });

describe("POST /api/spin — rate limit", () => {
  it("429s when the bucket is exhausted", async () => {
    exhaustRateLimit("rl:spin:1.2.3.4", 120);
    const { status } = await readJson(await post({ seed: "classic" }));
    expect(status).toBe(429);
  });

  it("allows requests from a different IP when one IP is exhausted", async () => {
    exhaustRateLimit("rl:spin:1.2.3.4", 120);
    const { status } = await readJson(await post({ seed: "classic" }, "5.6.7.8"));
    expect(status).toBe(200);
  });
});

describe("POST /api/spin — classic seed", () => {
  it("returns a SpinResult with team, decade, and candidates array", async () => {
    const { status, body } = await readJson(await post({ seed: "classic-abc123" }));
    expect(status).toBe(200);
    expect(typeof body.team).toBe("string");
    expect(typeof body.decade).toBe("string");
    expect(Array.isArray(body.candidates)).toBe(true);
    expect((body.candidates as unknown[]).length).toBeGreaterThan(0);
  });

  it("decade is NOT 'PRIME' for a classic seed", async () => {
    const { body } = await readJson(await post({ seed: "classic-xyz" }));
    expect(body.decade).not.toBe("PRIME");
  });

  it("candidates do NOT carry fit data when fit is false", async () => {
    const { body } = await readJson(await post({ seed: "classic-nf", fit: false }));
    const cands = body.candidates as Array<Record<string, unknown>>;
    expect(cands.every((c) => c.fit == null)).toBe(true);
  });

  it("candidates carry fit data when fit:true on a classic free-play seed", async () => {
    const { body } = await readJson(await post({ seed: "classic-free", fit: true }));
    const cands = body.candidates as Array<Record<string, unknown>>;
    expect(cands.some((c) => c.fit != null)).toBe(true);
  });

  it("defaults to classic-like behavior when seed is omitted (falls back to 'classic')", async () => {
    const { status, body } = await readJson(await post({}));
    expect(status).toBe(200);
    expect(body.decade).not.toBe("PRIME");
  });
});

describe("POST /api/spin — fit-lock guard", () => {
  it("suppresses fit grades when the classic seed has been fit-locked in Redis", async () => {
    const seed = "classic-locked-seed-001";
    ctx.redis!.strings.set("chal:fitlock:classic-locked-seed-001", "1");
    const { body } = await readJson(await post({ seed, fit: true }));
    const cands = body.candidates as Array<Record<string, unknown>>;
    expect(cands.every((c) => c.fit == null)).toBe(true);
  });

  it("serves fit grades for an unlocked classic seed", async () => {
    const seed = "classic-unlocked-seed-002";
    const { body } = await readJson(await post({ seed, fit: true }));
    const cands = body.candidates as Array<Record<string, unknown>>;
    expect(cands.some((c) => c.fit != null)).toBe(true);
  });
});

describe("POST /api/spin — prime seed", () => {
  it("returns decade='PRIME' for a prime- prefixed seed", async () => {
    const { status, body } = await readJson(await post({ seed: "prime-free-001" }));
    expect(status).toBe(200);
    expect(body.decade).toBe("PRIME");
  });

  it("prime candidates carry fit data when fit:true on a non-daily prime seed", async () => {
    const { body } = await readJson(await post({ seed: "prime-free-001", fit: true }));
    const cands = body.candidates as Array<Record<string, unknown>>;
    expect(cands.some((c) => c.fit != null)).toBe(true);
  });

  it("prime-daily seeds do NOT carry fit data even with fit:true", async () => {
    const { body } = await readJson(await post({ seed: "prime-daily-2026-6-10", fit: true }));
    const cands = body.candidates as Array<Record<string, unknown>>;
    expect(cands.every((c) => c.fit == null)).toBe(true);
  });

  it("pool contains only one entry per person_id (prime dedup)", async () => {
    const { body } = await readJson(await post({ seed: "prime-pool-test-001" }));
    const cands = body.candidates as Array<{ person_id?: string; id: string }>;
    const personIds = cands.map((c) => c.person_id ?? c.id);
    const unique = new Set(personIds);
    expect(unique.size).toBe(cands.length);
  });
});
