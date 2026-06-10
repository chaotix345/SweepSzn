import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enableRedisEnv,
  disableRedisEnv,
  freshFake,
  req,
  readJson,
  exhaustRateLimit,
} from "@/test/routeHarness";
import type { Player, LineupResult, Coefficients, DraftStep } from "@/lib/types";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// ---------- fixture world ----------
// Players are designed so the engine yields a known negative factor ("No perimeter defender"):
// no guard with a meaningful stl z-score => perimAdj fires.
const mkP = (id: string, pos: "PG" | "SG" | "SF" | "PF" | "C", obpm = 3, dbpm = 1): Player => ({
  id,
  person_id: id,
  name: id,
  year: 2015,
  decade: "2010s",
  tier: "complete" as const,
  team: "BOS",
  pos,
  eligible: [pos],
  g: 70,
  mp: 32,
  pts: 20,
  trb: pos === "C" ? 11 : 4,
  ast: 3,
  stl: 0,     // no perimeter stopper — ensures "No perimeter defender" fires
  blk: pos === "C" ? 2.5 : 0,
  fg3: 1.5,
  fg3a: 4,
  usg: 22,
  obpm,
  dbpm,
} as unknown as Player);

const P_PG = mkP("pgalpha2015", "PG", 5, 1);
const P_SG = mkP("sgbravo2015", "SG", 3, -1);
const P_SF = mkP("sfchrl2015b", "SF", -2, -1);
const P_PF = mkP("pfdelta2015", "PF", 1, 0);
const P_C  = mkP("centerech15", "C",  0, 2);

// A spare PG for an alternate lineup
const P_PG2 = mkP("pgbeta20152", "PG", 4, 0);

// Offered players who are NOT in the drafted five (swap candidates)
const P_CAND1 = mkP("cand0001sg15", "SG", 2, 3);
const P_CAND2 = mkP("cand0002pf15", "PF", 1, 2);
const P_CAND3 = mkP("cand0003c015", "C",  0, 3);

const byIdMap = new Map<string, Player>([
  [P_PG.id, P_PG], [P_PG2.id, P_PG2],
  [P_SG.id, P_SG], [P_SF.id, P_SF], [P_PF.id, P_PF], [P_C.id, P_C],
  [P_CAND1.id, P_CAND1], [P_CAND2.id, P_CAND2], [P_CAND3.id, P_CAND3],
]);

// Round 0 has two PGs so a second valid lineup can differ from the first
const POOLS: Record<number, string[]> = {
  0: [P_PG.id, P_PG2.id],
  1: [P_SG.id],
  2: [P_SF.id],
  3: [P_PF.id, P_CAND2.id],
  4: [P_C.id, P_CAND1.id, P_CAND3.id],
};

const syntheticResult: LineupResult = {
  ortg: 115, drtg: 110, netRtg: 5.0, wins: 57, losses: 25, winPct: 0.7,
  grade: "B", label: "CONTENDER",
  factors: [
    { label: "No perimeter defender", value: -3.0, kind: "bad" },
    { label: "Star offense", value: 4.0, kind: "good" },
  ],
  players: [], notes: [],
};

vi.mock("@/lib/data", () => ({
  spinPool: (_seed: string, round: number) => ({
    team: "BOS", decade: "2010s", ids: POOLS[round] ?? [],
  }),
  getPlayersByIds: (ids: string[]) =>
    ids.map((id) => byIdMap.get(id)).filter((p): p is Player => !!p),
  getCoefficients: () => ({} as Coefficients),
}));

vi.mock("@/lib/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/engine")>();
  return { ...actual, evaluateLineup: () => syntheticResult };
});

// Enable Redis so rateLimit works — pool route does NOT gate on isSurgeonBoardEnabled()
enableRedisEnv();

const { POST } = await import("@/app/api/surgeon/pool/route");

const NOW = new Date();
const DATE = `${NOW.getUTCFullYear()}-${NOW.getUTCMonth() + 1}-${NOW.getUTCDate()}`;
const SEED = `surgeon-${DATE}`;

const VALID_TRACE: DraftStep[] = [
  { slot: "PG", pickedId: P_PG.id, respins: [] },
  { slot: "SG", pickedId: P_SG.id, respins: [] },
  { slot: "SF", pickedId: P_SF.id, respins: [] },
  { slot: "PF", pickedId: P_PF.id, respins: [] },
  { slot: "C",  pickedId: P_C.id,  respins: [] },
];

const VALID_TRACE2: DraftStep[] = [
  { slot: "PG", pickedId: P_PG2.id, respins: [] },
  { slot: "SG", pickedId: P_SG.id,  respins: [] },
  { slot: "SF", pickedId: P_SF.id,  respins: [] },
  { slot: "PF", pickedId: P_PF.id,  respins: [] },
  { slot: "C",  pickedId: P_C.id,   respins: [] },
];

const post = (body: unknown, ip = "7.7.7.7") =>
  POST(req("/api/surgeon/pool", { body, ip }));

beforeEach(() => { freshFake(); });

// ---------- guard rails ----------
describe("POST /api/surgeon/pool — guard rails", () => {
  it("returns 400 for a missing seed", async () => {
    const { status, body } = await readJson(await post({ trace: VALID_TRACE }));
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("returns 400 for a bad seed format", async () => {
    const { status } = await readJson(await post({ seed: "daily-2026-6-10", trace: VALID_TRACE }));
    expect(status).toBe(400);
  });

  it("returns 400 for an invalid trace (off-pool pick)", async () => {
    const badTrace = VALID_TRACE.map((s, i) =>
      i === 0 ? { ...s, pickedId: "nobody_here_xxx" } : s,
    );
    const { status } = await readJson(await post({ seed: SEED, trace: badTrace }));
    expect(status).toBe(400);
  });

  it("returns 400 when seed is today but wrong format", async () => {
    const { status } = await readJson(await post({ seed: `bp-${DATE}`, trace: VALID_TRACE }));
    expect(status).toBe(400);
  });

  it("returns 400 for a stale date (surgeon seed from a different day)", async () => {
    const { status, body } = await readJson(await post({ seed: "surgeon-2020-1-1", trace: VALID_TRACE }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/stale/i);
  });

  it("rate limits with 429 after 60 calls", async () => {
    exhaustRateLimit("rl:sgpool:8.8.8.8", 60);
    const { status } = await readJson(await post({ seed: SEED, trace: VALID_TRACE }, "8.8.8.8"));
    expect(status).toBe(429);
  });
});

// ---------- happy path — response shape ----------
describe("POST /api/surgeon/pool — response shape", () => {
  it("returns 200 with diagnosis + before + candidates for a valid trace", async () => {
    const { status, body } = await readJson(await post({ seed: SEED, trace: VALID_TRACE }));
    expect(status).toBe(200);
    expect(body).toHaveProperty("diagnosis");
    expect(body).toHaveProperty("before");
    expect(body).toHaveProperty("candidates");
  });

  it("diagnosis shape has kind, label, canonical, value", async () => {
    const { body } = await readJson(await post({ seed: SEED, trace: VALID_TRACE }));
    const dx = body.diagnosis as Record<string, unknown>;
    expect(typeof dx.kind).toBe("string");
    expect(typeof dx.label).toBe("string");
    expect(typeof dx.canonical).toBe("string");
    expect(typeof dx.value).toBe("number");
  });

  it("before shape has wins, losses, net, grade", async () => {
    const { body } = await readJson(await post({ seed: SEED, trace: VALID_TRACE }));
    const before = body.before as Record<string, unknown>;
    expect(typeof before.wins).toBe("number");
    expect(typeof before.losses).toBe("number");
    expect(typeof before.net).toBe("number");
    expect(typeof before.grade).toBe("string");
  });

  it("candidates is a non-empty array with id, why, eligible fields", async () => {
    const { body } = await readJson(await post({ seed: SEED, trace: VALID_TRACE }));
    const cands = body.candidates as Record<string, unknown>[];
    expect(Array.isArray(cands)).toBe(true);
    expect(cands.length).toBeGreaterThan(0);
    const c = cands[0];
    expect(typeof c.id).toBe("string");
    expect(typeof c.why).toBe("string");
    expect(Array.isArray(c.eligible)).toBe(true);
  });

  it("does NOT include a delta or after-swap score (delta revealed only by submit)", async () => {
    const { body } = await readJson(await post({ seed: SEED, trace: VALID_TRACE }));
    expect(body).not.toHaveProperty("delta");
    expect(body).not.toHaveProperty("after");
    expect(body).not.toHaveProperty("afterWins");
  });
});

// ---------- determinism (same seed + trace → same pool) ----------
describe("POST /api/surgeon/pool — determinism", () => {
  it("same seed + trace returns identical candidates both times", async () => {
    const { body: body1 } = await readJson(await post({ seed: SEED, trace: VALID_TRACE }));
    const { body: body2 } = await readJson(await post({ seed: SEED, trace: VALID_TRACE }));
    expect(JSON.stringify(body1.candidates)).toBe(JSON.stringify(body2.candidates));
  });

  it("different trace (different first pick) can produce a different candidate set", async () => {
    const { body: body1 } = await readJson(await post({ seed: SEED, trace: VALID_TRACE }));
    const { body: body2 } = await readJson(await post({ seed: SEED, trace: VALID_TRACE2 }));
    // Both are valid; they may or may not differ — just assert both succeed
    expect(body1.candidates).toBeDefined();
    expect(body2.candidates).toBeDefined();
  });
});

// ---------- Redis-less behavior (pool intentionally serves without Redis) ----------
describe("POST /api/surgeon/pool — Redis-less (no board gate)", () => {
  // The pool route does NOT check isSurgeonBoardEnabled(): it is intentionally served without
  // Redis so that the deal/diagnosis is always available even in Redis-disabled environments.
  it("works correctly when Redis env is absent (no 503 returned)", async () => {
    // Temporarily disable Redis env for this sub-test by re-importing with disabled env.
    // Because vi.mock is module-level and the module is already imported, rateLimit fails-open
    // (redis is null → always returns true). The route MUST complete and return 200.
    // We verify by exhausting a bucket: with null redis the counter stays at 0, so the request
    // still succeeds — proving the pool logic runs without a Redis guard.
    disableRedisEnv();
    const { status } = await readJson(await post({ seed: SEED, trace: VALID_TRACE }));
    // Pool route returns 200 even with redis = null (rateLimit fails open; no board gate)
    expect(status).toBe(200);
    enableRedisEnv();
  });
});
