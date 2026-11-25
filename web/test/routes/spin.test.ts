import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// passthrough spy so the exclude-cap test can see what the route hands to spin()
vi.mock("@/lib/data", async (orig) => {
  const actual = await orig<typeof import("@/lib/data")>();
  return { ...actual, spin: vi.fn(actual.spin), duelSpin: vi.fn(actual.duelSpin) };
});

enableRedisEnv();
const { POST } = await import("@/app/api/spin/route");
const { spin, duelSpin } = await import("@/lib/data");

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

describe("POST /api/spin — szn rank ordinal", () => {
  it("stamps each candidate with a sequential rank (0..n-1) in board order", async () => {
    const { body } = await readJson(await post({ seed: "classic-rank-001" }));
    const cands = body.candidates as Array<{ rank?: number }>;
    expect(cands.length).toBeGreaterThan(1);
    expect(cands.map((c) => c.rank)).toEqual(cands.map((_, i) => i));
  });

  it("stamps rank on prime candidates too", async () => {
    const { body } = await readJson(await post({ seed: "prime-rank-001" }));
    const cands = body.candidates as Array<{ rank?: number }>;
    expect(cands.length).toBeGreaterThan(1);
    expect(cands.map((c) => c.rank)).toEqual(cands.map((_, i) => i));
  });
});

describe("POST /api/spin — exclude cap", () => {
  it("a real game excludes at most 4 prior picks — a crafted longer list is capped at 4", async () => {
    const exclude = Array.from({ length: 8 }, (_, i) => `crafted_id_${i}`);
    const { status } = await readJson(await post({ seed: "classic-cap", fit: true, exclude }));
    expect(status).toBe(200);
    const opts = vi.mocked(spin).mock.calls.at(-1)![2]!;
    expect(opts.exclude).toEqual(exclude.slice(0, 4));
  });
});

describe("POST /api/spin — pool date", () => {
  it("passes the game's pinned day through to spin()", async () => {
    vi.mocked(spin).mockClear();
    await post({ seed: "classic-abc", asOf: "2026-11-01" });
    expect(vi.mocked(spin).mock.calls[0][2]?.asOf).toBe("2026-11-01");
  });

  it("drops a non-string day", async () => {
    vi.mocked(spin).mockClear();
    await post({ seed: "classic-abc", asOf: 20261101 });
    expect(vi.mocked(spin).mock.calls[0][2]?.asOf).toBeUndefined();
  });
});

describe("POST /api/spin — duel seed", () => {
  it("allows up to 9 exclusions for a duel seed (both sides' picks) and caps a longer list at 9", async () => {
    const exclude = Array.from({ length: 12 }, (_, i) => `crafted_id_${i}`);
    const { status } = await readJson(await post({ seed: "duel-cap1", round: 4, exclude, open: ["C"] }));
    expect(status).toBe(200);
    const call = vi.mocked(duelSpin).mock.calls.at(-1)!;
    expect(call[2]).toEqual(exclude.slice(0, 9));
    expect(call[3]).toEqual(["C"]);
  });

  it("other modes keep the 4-exclusion cap", async () => {
    const exclude = Array.from({ length: 9 }, (_, i) => `crafted_id_${i}`);
    await post({ seed: "prime-cap1", exclude });
    await post({ seed: "classic-cap2", exclude });
    expect(vi.mocked(spin).mock.calls.at(-1)![2]!.exclude).toEqual(exclude.slice(0, 4));
  });

  it("never carries fit grades, even with fit:true", async () => {
    const { body } = await readJson(await post({ seed: "duel-fit1", fit: true }));
    const cands = body.candidates as Array<Record<string, unknown>>;
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.every((c) => c.fit == null)).toBe(true);
    expect(body.decade).not.toBe("PRIME");
  });

  it("guard: the side's deal always has someone for its open slots", async () => {
    for (let r = 0; r < 5; r++) {
      const { body } = await readJson(await post({ seed: `duel-guard${r}`, round: r, open: ["PG"] }));
      const cands = body.candidates as Array<{ eligible: string[] }>;
      expect(cands.some((c) => c.eligible.includes("PG"))).toBe(true);
    }
  });

  it("drops junk from `open` and defaults to every slot", async () => {
    await post({ seed: "duel-open1", open: ["G", 3, "C", "C"] });
    expect(vi.mocked(duelSpin).mock.calls.at(-1)![3]).toEqual(["C"]);
    await post({ seed: "duel-open2" });
    expect(vi.mocked(duelSpin).mock.calls.at(-1)![3]).toEqual(["PG", "SG", "SF", "PF", "C"]);
  });
});
