import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enableRedisEnv,
  freshFake,
  ctx,
  req,
  readJson,
  exhaustRateLimit,
  authEnv,
  signIn,
  flushAfter,
} from "@/test/routeHarness";
import type { Player, LineupResult, Coefficients, DraftStep } from "@/lib/types";
import { buildFhChoices } from "@/lib/factorHunt";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// Freeze Date (only — timers stay real) mid-day UTC so a CI run straddling UTC midnight can't
// flake the date checks: DATE here and the route's request-time check see the same day.
vi.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z"), toFake: ["Date"] });

// ---------- fixture world ----------
const mkP = (id: string, pos: "PG" | "SG" | "SF" | "PF" | "C", obpm: number, dbpm: number): Player => ({
  id,
  person_id: id,
  name: id,
  year: 2015,
  decade: "2010s",
  tier: "complete",
  team: "BOS",
  pos,
  eligible: [pos],
  obpm,
  dbpm,
  usg: 22,
  blk: pos === "C" ? 2.5 : 0,
  trb: pos === "C" ? 11 : 4,
} as unknown as Player);

const P_PG  = mkP("pgalpha2015", "PG", 5.5, 0.5);
const P_PG2 = mkP("pgbeta2015x", "PG", 4.0, 0.2); // second PG used in new-lineup-locks-fresh test
const P_SG  = mkP("sgbravo2015", "SG", 3.0, -0.5);
const P_SF  = mkP("sfchrl2015b", "SF", -3.0, -2.0);
const P_PF  = mkP("pfdelta2015", "PF", 1.0, 0.5);
const P_C   = mkP("centerech15", "C", 0.5, 2.0);

// Synthetic result with a known single-negative factor so we fully control choices.
// ANSWER_LABEL = the canonical label of the only negative factor → it is the "worst" answer.
const ANSWER_LABEL = "No perimeter defender";

const syntheticResult: LineupResult = {
  ortg: 112, drtg: 108, netRtg: 4.0, wins: 55, losses: 27, winPct: 0.67,
  grade: "B", label: "Contender",
  factors: [
    { label: ANSWER_LABEL, value: -4.5, kind: "bad" },
    { label: "Star offense", value: 3.0, kind: "good" },
    { label: "Star defense", value: 1.5, kind: "good" },
  ],
  players: [], notes: [],
};

const byIdMap = new Map<string, Player>([
  [P_PG.id, P_PG], [P_PG2.id, P_PG2],
  [P_SG.id, P_SG], [P_SF.id, P_SF], [P_PF.id, P_PF], [P_C.id, P_C],
]);

// Slot 0 intentionally holds two PGs so tests can submit two distinct valid lineups (different
// pickedId → different lineup string → different sha256 → independent prediction lock key).
const POOLS: Record<number, string[]> = {
  0: [P_PG.id, P_PG2.id], 1: [P_SG.id], 2: [P_SF.id], 3: [P_PF.id], 4: [P_C.id],
};

vi.mock("@/lib/data", () => ({
  spinPool: (_seed: string, round: number) => ({
    team: "BOS", decade: "2010s", ids: POOLS[round] ?? [],
  }),
  getPlayersByIds: (ids: string[]) => ids.map((id) => byIdMap.get(id)).filter((p): p is Player => !!p),
  getCoefficients: () => ({} as Coefficients),
}));

vi.mock("@/lib/engine", () => ({
  evaluateLineup: () => syntheticResult,
}));

enableRedisEnv();
authEnv();

const { POST } = await import("@/app/api/factorhunt/submit/route");

const NOW = new Date();
const DATE = `${NOW.getUTCFullYear()}-${NOW.getUTCMonth() + 1}-${NOW.getUTCDate()}`;

// DECOY_LABEL = a wrong-but-offered choice. Derived from the SAME buildFhChoices call the route
// makes (decoy sampling shuffles over FH_FACTOR_LABELS, so a hardcoded label breaks whenever
// that list grows — it did when the engine gained Era adjustment / Thin perimeter defense).
const DECOY_LABEL = buildFhChoices(syntheticResult.factors, `fh-${DATE}`)!.choices.find((c) => c !== ANSWER_LABEL)!;

// Valid trace for the fixture world: one pick per slot in draft order, no respins.
const VALID_TRACE: DraftStep[] = [
  { slot: "PG", pickedId: P_PG.id, respins: [] },
  { slot: "SG", pickedId: P_SG.id, respins: [] },
  { slot: "SF", pickedId: P_SF.id, respins: [] },
  { slot: "PF", pickedId: P_PF.id, respins: [] },
  { slot: "C",  pickedId: P_C.id,  respins: [] },
];

// Second valid trace: picks the alternate PG (P_PG2) — a different lineup string, so a
// different sha256 lock key, independent from VALID_TRACE's lock.
const VALID_TRACE2: DraftStep[] = [
  { slot: "PG", pickedId: P_PG2.id, respins: [] },
  { slot: "SG", pickedId: P_SG.id,  respins: [] },
  { slot: "SF", pickedId: P_SF.id,  respins: [] },
  { slot: "PF", pickedId: P_PF.id,  respins: [] },
  { slot: "C",  pickedId: P_C.id,   respins: [] },
];

// All uids use only [a-z0-9-] to satisfy the route's UID_RE = /^[a-z0-9-]{8,64}$/i
const post = (body: unknown, ip = "9.9.9.9") => POST(req("/api/factorhunt/submit", { body, ip }));

function anonBody(overrides: Record<string, unknown> = {}) {
  return { date: DATE, uid: "anonusr001x", name: "Tester", trace: VALID_TRACE, ...overrides };
}

beforeEach(() => { freshFake(); });

// ---------- guard-rail tests ----------
describe("POST /api/factorhunt/submit — guard rails", () => {
  it("returns 400 for a stale date", async () => {
    const { status, body } = await readJson(await post({ date: "2020-1-1", uid: "anonusr001x", trace: VALID_TRACE }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/stale/);
  });

  it("returns 400 for a bad uid (no session)", async () => {
    const { status, body } = await readJson(await post({ date: DATE, uid: "x!", trace: VALID_TRACE }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/uid/);
  });

  it("returns 400 for an invalid trace (off-pool pick)", async () => {
    const badTrace = [
      { slot: "PG", pickedId: "not-in-pool", respins: [] },
      { slot: "SG", pickedId: P_SG.id, respins: [] },
      { slot: "SF", pickedId: P_SF.id, respins: [] },
      { slot: "PF", pickedId: P_PF.id, respins: [] },
      { slot: "C",  pickedId: P_C.id,  respins: [] },
    ];
    const { status } = await readJson(await post(anonBody({ trace: badTrace })));
    expect(status).toBe(400);
  });

  it("rate limits with 429 after 20 calls", async () => {
    exhaustRateLimit("rl:fhsubmit:1.2.3.4", 20);
    const { status } = await readJson(await post(anonBody(), "1.2.3.4"));
    expect(status).toBe(429);
  });
});

// ---------- anon identity ----------
describe("POST /api/factorhunt/submit — anon identity", () => {
  it("accepts a valid anon uid from the body when no session exists", async () => {
    const { status, body } = await readJson(await post(anonBody()));
    expect(status).toBe(200);
    expect(body).toHaveProperty("date");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("top");
  });

  it("board entry is keyed on the anon uid", async () => {
    await post(anonBody({ uid: "anonusr001x", name: "TestBot" }));
    const keyZ = `lb:fh:${DATE}`;
    expect(ctx.redis!.zsets.get(keyZ)?.has("anonusr001x")).toBe(true);
  });
});

// ---------- authed identity ----------
describe("POST /api/factorhunt/submit — authed identity", () => {
  it("uses the session uid, ignoring body uid", async () => {
    await signIn({ uid: "sessionusr99", name: "SignedIn" });
    const { status } = await readJson(await post(anonBody({ uid: "ignoredusr00" })));
    expect(status).toBe(200);
    const keyZ = `lb:fh:${DATE}`;
    expect(ctx.redis!.zsets.get(keyZ)?.has("sessionusr99")).toBe(true);
    expect(ctx.redis!.zsets.get(keyZ)?.has("ignoredusr00")).toBe(false);
  });

  it("removes the anon entry when the session has an anon field", async () => {
    const keyZ = `lb:fh:${DATE}`;
    const keyH = `lb:fh:${DATE}:meta`;
    ctx.redis!.zsets.set(keyZ, new Map([["anonprev0001", 50000]]));
    ctx.redis!.hashes.set(keyH, new Map([["anonprev0001", JSON.stringify({ uid: "anonprev0001" })]]));

    await signIn({ uid: "realuidabc01", name: "Real User", anon: "anonprev0001" });
    await post(anonBody());

    expect(ctx.redis!.zsets.get(keyZ)?.has("anonprev0001")).toBeFalsy();
  });
});

// ---------- PREDICTION LOCK semantics (PRIORITY) ----------
describe("POST /api/factorhunt/submit — prediction lock (PRIORITY)", () => {
  it("first submit locks the prediction — correct answer earns x1.05", async () => {
    const { status, body } = await readJson(await post(anonBody({ uid: "locktest0001", prediction: ANSWER_LABEL })));
    expect(status).toBe(200);
    const you = body.you as Record<string, unknown> | undefined;
    expect(you?.predicted).toBe(ANSWER_LABEL);
    expect(you?.correct).toBe(true);
  });

  it("first submit with no prediction locks a skip (predicted: null, correct: false)", async () => {
    const { status, body } = await readJson(await post(anonBody({ uid: "locktest0002" })));
    expect(status).toBe(200);
    const you = body.you as Record<string, unknown> | undefined;
    expect(you?.predicted).toBeNull();
    expect(you?.correct).toBe(false);
  });

  it("first submit with an empty-string prediction is treated as a skip", async () => {
    const { status, body } = await readJson(await post(anonBody({ uid: "locktest0003", prediction: "" })));
    expect(status).toBe(200);
    const you = body.you as Record<string, unknown> | undefined;
    expect(you?.predicted).toBeNull();
    expect(you?.correct).toBe(false);
  });

  it("replaying the SAME lineup with a different prediction keeps the original lock", async () => {
    // First: lock correct answer
    await post(anonBody({ uid: "locktest0004", prediction: ANSWER_LABEL }));
    // Second: attempt to replace with wrong prediction on the SAME lineup
    const { body: body2 } = await readJson(
      await post(anonBody({ uid: "locktest0004", prediction: DECOY_LABEL })),
    );
    const you2 = body2.you as Record<string, unknown> | undefined;
    // The lock must be ANSWER_LABEL (not DECOY_LABEL)
    expect(you2?.predicted).toBe(ANSWER_LABEL);
    expect(you2?.correct).toBe(true);
  });

  it("replaying the SAME lineup after a wrong lock: correct prediction on replay does NOT earn bonus", async () => {
    // First: lock the wrong prediction
    await post(anonBody({ uid: "locktest0005", prediction: DECOY_LABEL }));
    // Second: try to claim the correct answer
    const { body: body2 } = await readJson(
      await post(anonBody({ uid: "locktest0005", prediction: ANSWER_LABEL })),
    );
    const you2 = body2.you as Record<string, unknown> | undefined;
    // Lock stays on DECOY_LABEL, which is wrong
    expect(you2?.predicted).toBe(DECOY_LABEL);
    expect(you2?.correct).toBe(false);
  });

  it("replaying the SAME lineup after a skip still keeps the skip — no upgrade to correct", async () => {
    // First: lock a skip
    await post(anonBody({ uid: "locktest0006" }));
    // Second: try to claim the correct answer on the same lineup
    const { body: body2 } = await readJson(
      await post(anonBody({ uid: "locktest0006", prediction: ANSWER_LABEL })),
    );
    const you2 = body2.you as Record<string, unknown> | undefined;
    // Locked empty string → null after read-back; still no bonus
    expect(you2?.predicted).toBeNull();
    expect(you2?.correct).toBe(false);
  });

  it("x1.05 multiplier applies ONLY when the server-recomputed prediction is correct", async () => {
    // Correct prediction
    const { body: bodyC } = await readJson(
      await post(anonBody({ uid: "bonususr0001", prediction: ANSWER_LABEL })),
    );
    const youC = bodyC.you as Record<string, unknown> | undefined;
    const wins = syntheticResult.wins; // 55
    // score = round(55 * 1.05 * 100) / 100 = 57.75 (display)
    const expectedCorrect = Math.round(wins * 1.05 * 100) / 100;
    expect(youC?.correct).toBe(true);
    expect(Number(youC?.score)).toBeCloseTo(expectedCorrect, 1);

    // Wrong prediction (fresh state, different uid)
    freshFake();
    const { body: bodyW } = await readJson(
      await post(anonBody({ uid: "bonususr0002", prediction: DECOY_LABEL })),
    );
    const youW = bodyW.you as Record<string, unknown> | undefined;
    expect(youW?.correct).toBe(false);
    // no bonus: display score = wins (55)
    expect(Number(youW?.score)).toBeCloseTo(wins, 1);

    // Correct score must be higher than wrong score
    expect(Number(youC?.score)).toBeGreaterThan(Number(youW?.score));
  });

  it("client submitting a fabricated correct label that is not in the computed choices earns nothing", async () => {
    // DECOY_LABEL is in FH_FACTOR_LABELS but may or may not be in the shuffled choices for this lineup.
    // For a truly fabricated label that is never in the choices:
    const fabricated = "Completely made up factor";
    const { body } = await readJson(await post(anonBody({ uid: "cheatusr0001", prediction: fabricated })));
    const you = body.you as Record<string, unknown> | undefined;
    expect(you?.predicted).toBeNull();
    expect(you?.correct).toBe(false);
  });

  it("a second uid gets an independent lock — their correct prediction earns the bonus", async () => {
    // uid A locks with a wrong prediction
    await post(anonBody({ uid: "lockusra001x", prediction: DECOY_LABEL }));
    // uid B submits independently with the correct prediction
    const { body: bodyB } = await readJson(
      await post(anonBody({ uid: "lockusrb001x", prediction: ANSWER_LABEL })),
    );
    const youB = bodyB.you as Record<string, unknown> | undefined;
    expect(youB?.predicted).toBe(ANSWER_LABEL);
    expect(youB?.correct).toBe(true);
  });
});

// ---------- keep-best board ----------
describe("POST /api/factorhunt/submit — keep-best board", () => {
  it("a second submit with the same lineup does not lower the board score", async () => {
    // First submit: correct prediction → higher score
    await post(anonBody({ uid: "keepbstusr01", prediction: ANSWER_LABEL }));
    const keyZ = `lb:fh:${DATE}`;
    const scoreAfterFirst = ctx.redis!.zsets.get(keyZ)?.get("keepbstusr01") ?? 0;

    // Second submit: same lineup → lock already set to ANSWER_LABEL (correct), same score
    await post(anonBody({ uid: "keepbstusr01" }));
    const scoreAfterSecond = ctx.redis!.zsets.get(keyZ)?.get("keepbstusr01") ?? 0;

    expect(scoreAfterSecond).toBeGreaterThanOrEqual(scoreAfterFirst);
  });
});

// ---------- after() / ev counter ----------
describe("POST /api/factorhunt/submit — after() side effects", () => {
  it("flushAfter bumps the ev:submit:<date> counter", async () => {
    await post(anonBody({ uid: "evtestusr001" }));
    await flushAfter();

    const now2 = new Date();
    const day = `${now2.getUTCFullYear()}-${now2.getUTCMonth() + 1}-${now2.getUTCDate()}`;
    const counterKey = `ev:submit:${day}`;
    const count = ctx.redis!.strings.get(counterKey);
    expect(Number(count)).toBeGreaterThanOrEqual(1);
    // submit is mode-tagged → admin can compute play→submit conversion per mode
    expect(Number(ctx.redis!.hashes.get(`ev:submode:${day}`)?.get("factorhunt"))).toBeGreaterThanOrEqual(1);
  });
});

// ---------- new lineup locks fresh (independent lock key per lineup) ----------
describe("POST /api/factorhunt/submit — new lineup locks fresh", () => {
  // Lock the first lineup with a skip (no prediction), then submit a DIFFERENT lineup with the
  // correct prediction.  Because lockFhPrediction uses sha256(lineup) in its Redis key, the two
  // lineups have independent locks and the second one earns the ×1.05 bonus.
  it("a NEW lineup (different player) gets an independent prediction lock", async () => {
    const uid = "newlockusr01";

    // Lineup A (P_PG): lock a skip
    await post({ date: DATE, uid, name: "Tester", trace: VALID_TRACE });

    // Lineup B (P_PG2): a different lineup string → different sha256 key → fresh lock
    const { status, body } = await readJson(
      await post({ date: DATE, uid, name: "Tester", trace: VALID_TRACE2, prediction: ANSWER_LABEL }),
    );
    expect(status).toBe(200);
    const you = body.you as Record<string, unknown> | undefined;
    // The lock for lineup B is set to ANSWER_LABEL (correct) — independent of lineup A's skip lock
    expect(you?.predicted).toBe(ANSWER_LABEL);
    expect(you?.correct).toBe(true);

    // Verify that two distinct pred keys exist in Redis (one per lineup)
    const predKeys = [...ctx.redis!.strings.keys()].filter((k) => k.includes(`:pred:${uid}:`));
    expect(predKeys.length).toBe(2);
  });
});

// ---------- 503 branch (disabled board) ----------
describe("POST /api/factorhunt/submit — disabled board", () => {
  it.todo(
    "returns 503 when isFhBoardEnabled() is false (Redis env absent at module import time) — cannot be exercised in this file without a full vi.resetModules() flow because the redis singleton is already bound at module eval",
  );
});
