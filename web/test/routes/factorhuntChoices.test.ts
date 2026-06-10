import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, req, readJson, exhaustRateLimit } from "@/test/routeHarness";
import type { Player, Coefficients } from "@/lib/types";
import { FH_FACTOR_LABELS } from "@/lib/factorHunt";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// Minimal player fixture — must have person_id to satisfy the duplicate-person check
const mkP = (id: string, pos: "PG" | "SG" | "SF" | "PF" | "C"): Player => ({
  id,
  person_id: id,
  name: id,
  year: 2015,
  decade: "2010s",
  tier: "complete",
  team: "GSW",
  pos,
  eligible: [pos],
  obpm: pos === "PG" ? 6 : pos === "SG" ? 2 : pos === "SF" ? -3 : pos === "PF" ? -1 : -4,
  dbpm: 1,
  usg: 22,
  blk: pos === "C" ? 2.1 : 0,
  trb: pos === "C" ? 10 : 4,
} as unknown as Player);

// Fixture 5 (5 distinct ids/person_ids)
const P1 = mkP("pg_alpha", "PG");
const P2 = mkP("sg_bravo", "SG");
const P3 = mkP("sf_charlie", "SF");
const P4 = mkP("pf_delta", "PF");
const P5 = mkP("c_echo", "C");
const LINEUP_IDS = [P1.id, P2.id, P3.id, P4.id, P5.id];

const DEFAULT_COEFFS: Coefficients = {
  ortgBase: 104.407, drtgBase: 107.595, offScale: 0.6178, defScale: 0.742, pythK: 14, zCap: 3.3,
  eraStrength: { floor: 0.85, gamma: 0.7, startYear: 1950, fullYear: 1985 },
  offModel: { intercept: 0.4328, pts: 1.058, ast: 0.6331, ts: 0.9088 },
  defModel: { intercept: -2.4242, dws: 79.5313, trb: -0.7115, posC: 0.6555, posPF: 0.2915, posSF: 0.1066, posSG: -0.0155 },
  defModelEst: { intercept: -1.7504, dws: 77.2445, posC: 0.0613, posPF: -0.2484, posSF: -0.1734, posSG: -0.1265 },
  defEstCap: 5.5, dwsShrinkK: 40, leagueDwsMean: 0.02037,
  usgModel: { intercept: 21.2311, pts: 3.0339, ast: -0.4904 },
  usageBudget: 100, overloadGamma: 0.22,
  spacing: { perShooter: 0.987, diminish: 0.55, noneFloor: -3, baseline: 1.6 },
  rim: { blkLo: 0.4, blkSpan: 1.4, trbProxyLo: 0.8, trbProxySpan: 1.6 },
  noRimPenalty: 7, thinPerimeterPenalty: 3,
};

vi.mock("@/lib/data", () => ({
  getPlayersByIds: (ids: string[]) => {
    const byId = new Map<string, Player>([[P1.id, P1], [P2.id, P2], [P3.id, P3], [P4.id, P4], [P5.id, P5]]);
    return ids.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  },
  getCoefficients: () => DEFAULT_COEFFS,
  spinPool: () => ({ team: "GSW", decade: "2010s", ids: LINEUP_IDS }),
}));

enableRedisEnv();
const { POST } = await import("@/app/api/factorhunt/choices/route");

const SEED = "fh-2026-6-10";
const post = (body: unknown, ip = "9.9.9.9") => POST(req("/api/factorhunt/choices", { body, ip }));

beforeEach(() => { freshFake(); });

describe("POST /api/factorhunt/choices — 422 path", () => {
  it.todo(
    "returns 422 when buildFhChoices returns null (no factors) — achieving zero factors via real engine with available fixtures is non-trivial; requires either a dedicated all-zero-factor lineup or a targeted mock",
  );
});

describe("POST /api/factorhunt/choices — validation", () => {
  it("rejects a missing seed with 400", async () => {
    const { status, body } = await readJson(await post({ ids: LINEUP_IDS }));
    expect(status).toBe(400);
    expect(body.error).toBe("bad seed");
  });

  it("rejects an invalid seed format with 400", async () => {
    const { status } = await readJson(await post({ seed: "daily-2026-6-10", ids: LINEUP_IDS }));
    expect(status).toBe(400);
  });

  it("rejects fewer than 5 players with 400", async () => {
    const { status, body } = await readJson(await post({ seed: SEED, ids: LINEUP_IDS.slice(0, 4) }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/5/);
  });

  it("rejects more than 5 players with 400", async () => {
    const { status } = await readJson(await post({ seed: SEED, ids: [...LINEUP_IDS, "extra_player"] }));
    expect(status).toBe(400);
  });

  it("rejects ids with invalid characters (filters them out, resulting in <5)", async () => {
    const { status } = await readJson(await post({ seed: SEED, ids: [...LINEUP_IDS.slice(0, 4), "bad id!"] }));
    expect(status).toBe(400);
  });

  it("rejects a duplicate player (same person_id twice)", async () => {
    // Use the same id twice — the route checks people.size !== players.length
    const { status, body } = await readJson(await post({ seed: SEED, ids: [...LINEUP_IDS.slice(0, 4), LINEUP_IDS[0]] }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/unique/);
  });

  it("rejects a non-JSON body gracefully (returns 400 via bad seed)", async () => {
    const res = await POST(req("/api/factorhunt/choices", { rawBody: "not json", method: "POST" }));
    const { status } = await readJson(res);
    expect(status).toBe(400);
  });

  it("rate limits with 429 after 60 calls", async () => {
    exhaustRateLimit("rl:fhchoices:1.2.3.4", 60);
    const { status } = await readJson(await post({ seed: SEED, ids: LINEUP_IDS }, "1.2.3.4"));
    expect(status).toBe(429);
  });
});

describe("POST /api/factorhunt/choices — response shape + determinism", () => {
  it("returns ask and choices for a valid lineup", async () => {
    const { status, body } = await readJson(await post({ seed: SEED, ids: LINEUP_IDS }));
    expect(status).toBe(200);
    expect(body).toHaveProperty("ask");
    expect(["worst", "best"]).toContain(body.ask);
    expect(Array.isArray(body.choices)).toBe(true);
    expect((body.choices as unknown[]).length).toBe(4);
  });

  it("does NOT expose the answer field", async () => {
    const { body } = await readJson(await post({ seed: SEED, ids: LINEUP_IDS }));
    expect(body).not.toHaveProperty("answer");
  });

  it("all choices are non-empty strings from the FH label pool", async () => {
    const { body } = await readJson(await post({ seed: SEED, ids: LINEUP_IDS }));
    const knownLabels = new Set<string>(FH_FACTOR_LABELS);
    for (const c of body.choices as string[]) {
      expect(typeof c).toBe("string");
      expect(c.length).toBeGreaterThan(0);
      // Decoys are guaranteed to be in FH_FACTOR_LABELS; real factors are canonical labels
      // that are also drawn from the same pool, so all four choices must be known labels.
      expect(knownLabels.has(c)).toBe(true);
    }
  });

  it("choices are deterministic for the same seed + lineup", async () => {
    const { body: b1 } = await readJson(await post({ seed: SEED, ids: LINEUP_IDS }));
    const { body: b2 } = await readJson(await post({ seed: SEED, ids: LINEUP_IDS }));
    expect(b1.choices).toEqual(b2.choices);
    expect(b1.ask).toBe(b2.ask);
  });

  it("choices are returned successfully for a different seed (shuffle is seed-dependent)", async () => {
    const { status: s1 } = await readJson(await post({ seed: SEED, ids: LINEUP_IDS }));
    const { status: s2, body: b2 } = await readJson(await post({ seed: "fh-2025-1-1", ids: LINEUP_IDS }));
    expect(s1).toBe(200);
    expect(s2).toBe(200);
    expect(typeof b2.ask).toBe("string");
    expect(Array.isArray(b2.choices)).toBe(true);
    // Both should return 4 choices (same lineup, different seed-based shuffle)
    expect((b2.choices as unknown[]).length).toBe(4);
  });

  it("choices array has exactly 4 unique items", async () => {
    const { body } = await readJson(await post({ seed: SEED, ids: LINEUP_IDS }));
    const choices = body.choices as string[];
    expect(choices.length).toBe(4);
    expect(new Set(choices).size).toBe(4);
  });
});
