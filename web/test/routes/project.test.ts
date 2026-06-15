import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, req, readJson, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { POST } = await import("@/app/api/project/route");

// Real player ids from players.json (distinct people), in SLOT order [PG, SG, SF, PF, C].
const FIVE = [
  "lebron_james_cle_2000s_2009",     // PG-eligible playmaker
  "michael_jordan_chi_1980s_1988",   // SG
  "kevin_garnett_min_2000s_2004",    // SF/PF
  "david_robinson_sas_1990s_1994",   // PF/C
  "nikola_joki_den_2020s_2024",      // C
];

const post = (body: unknown, ip?: string) => POST(req("/api/project", { body, ip }));

beforeEach(() => { freshFake(); });

describe("POST /api/project — gating", () => {
  it("returns gated for a Daily seed (no fit-class signal on competitive seeds)", async () => {
    const { status, body } = await readJson(await post({ seed: "daily-2026-06-15", lineup: [FIVE[0], null, null, null, null] }));
    expect(status).toBe(200);
    expect(body.gated).toBe(true);
    expect(body.floor).toBeUndefined();
  });

  it("returns gated for Factor Hunt / Surgeon / HoopIQ / Challenge / prime-daily seeds", async () => {
    for (const seed of ["fh-2026-06-15", "surgeon-2026-06-15", "hoopiq-3", "h2h-abc123", "prime-daily-2026-06-15"]) {
      const { body } = await readJson(await post({ seed, lineup: [FIVE[0], null, null, null, null] }));
      expect(body.gated).toBe(true);
    }
  });
});

describe("POST /api/project — projection on allowed seeds", () => {
  it("200 with a floor/ceiling band for a partial Classic roster", async () => {
    const { status, body } = await readJson(await post({ seed: "classic-1", lineup: [FIVE[0], FIVE[1], null, null, null] }));
    expect(status).toBe(200);
    const floor = body.floor as { wins: number; losses: number; grade: string };
    const ceiling = body.ceiling as { wins: number; losses: number; grade: string };
    expect(typeof floor.wins).toBe("number");
    expect(typeof floor.grade).toBe("string");
    expect(floor.wins + floor.losses).toBe(82);
    expect(floor.wins).toBeLessThanOrEqual(ceiling.wins);
    expect(body.n).toBe(2);
  });

  it("a full five converges: floor.wins === ceiling.wins", async () => {
    const { body } = await readJson(await post({ seed: "classic-1", lineup: FIVE }));
    const floor = body.floor as { wins: number };
    const ceiling = body.ceiling as { wins: number };
    expect(body.n).toBe(5);
    expect(floor.wins).toBe(ceiling.wins);
  });

  it("works for a Blueprint daily (bp-) seed", async () => {
    const { status, body } = await readJson(await post({ seed: "bp-2026-06-15", lineup: [FIVE[0], null, null, null, null] }));
    expect(status).toBe(200);
    expect(body.gated).toBeUndefined();
    expect((body.floor as { wins: number }).wins).toBeGreaterThanOrEqual(0);
  });
});

describe("POST /api/project — validation + limits", () => {
  it("400 when the lineup is empty (nothing drafted yet)", async () => {
    const { status } = await readJson(await post({ seed: "classic-1", lineup: [null, null, null, null, null] }));
    expect(status).toBe(400);
  });

  it("429s when the rate-limit bucket is exhausted", async () => {
    exhaustRateLimit("rl:project:9.9.9.9", 120);
    const { status } = await readJson(await post({ seed: "classic-1", lineup: FIVE }, "9.9.9.9"));
    expect(status).toBe(429);
  });
});
