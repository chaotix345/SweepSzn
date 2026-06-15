import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enableRedisEnv,
  freshFake,
  ctx,
  req,
  readJson,
  exhaustRateLimit,
  signIn,
  authEnv,
  flushAfter,
} from "@/test/routeHarness";
import type { DraftStep, Player } from "@/lib/types";
import { DEFAULT_COEFFICIENTS } from "@/lib/engine";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// Must be called before any module that transitively imports @/lib/redis.
enableRedisEnv();
// Also need auth env so getSession / isAuthEnabled work without actual Google creds.
authEnv();

// Freeze Date (only — timers stay real) mid-day UTC so a CI run straddling UTC midnight can't
// flake the date checks: TODAY here and the route's request-time todayUTC() see the same day.
vi.useFakeTimers({ now: new Date("2026-06-15T12:00:00Z"), toFake: ["Date"] });

// ---- Deterministic fixture world (mirrors dailyVerify.test.ts pattern) ----
const mkP = (id: string, slot: string, eligible?: string[]): Player =>
  ({
    id,
    person_id: id,
    name: id,
    year: 2015,
    decade: "2010s",
    tier: "complete",
    team: "BOS",
    pos: slot,
    eligible: eligible ?? [slot],
    g: 70,
    mp: 32,
    obpm: 4,
    dbpm: 1,
    usg: 22,
  } as unknown as Player);

const PLAYERS: Record<string, Player> = {
  p0pg: mkP("p0pg", "PG"),
  p1sg: mkP("p1sg", "SG"),
  p2sf: mkP("p2sf", "SF"),
  p3pf: mkP("p3pf", "PF"),
  p4c: mkP("p4c", "C"),
};


// basePool keyed by round — the route's spinPool uses seed "daily-<date>".
// The verifier calls spinPool(seed, round, opts). For our legit trace (no respins), it just
// needs round 0..4 to contain the picked ids.
const BASE_POOL: Record<number, string[]> = {
  0: ["p0pg"],
  1: ["p1sg"],
  2: ["p2sf"],
  3: ["p3pf"],
  4: ["p4c"],
};

vi.mock("@/lib/data", () => ({
  spinPool: (_seed: string, round: number, opts: { lockedDecade?: string; lockedTeam?: string; salt?: number }) => {
    if (opts.lockedDecade || opts.lockedTeam) {
      return { team: "BOS", decade: "2010s", ids: [] };
    }
    return { team: "BOS", decade: "2010s", ids: BASE_POOL[round] ?? [] };
  },
  getPlayersByIds: (ids: string[]) => ids.map((id) => PLAYERS[id]).filter(Boolean),
  getCoefficients: () => DEFAULT_COEFFICIENTS,
}));

const { POST } = await import("@/app/api/daily/submit/route");

// todayUTC mirrors the route's own implementation exactly.
const todayUTC = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
};

const TODAY = todayUTC();

// A legit trace: one pick per slot, all from the mocked pools.
const LEGIT_TRACE: DraftStep[] = [
  { slot: "PG", pickedId: "p0pg", respins: [] },
  { slot: "SG", pickedId: "p1sg", respins: [] },
  { slot: "SF", pickedId: "p2sf", respins: [] },
  { slot: "PF", pickedId: "p3pf", respins: [] },
  { slot: "C", pickedId: "p4c", respins: [] },
];

const submit = (body: unknown, ip = "1.2.3.4") =>
  POST(req("/api/daily/submit", { body, method: "POST", ip }));

beforeEach(() => {
  freshFake();
});

// ---- 503: leaderboard not configured ----
// isLeaderboardEnabled() checks isRedisEnabled() which is true because enableRedisEnv() set vars.
// So 503 is not reachable in this environment — that's expected and fine.

// ---- Rate limit ----
describe("POST /api/daily/submit — rate limit", () => {
  it("returns 429 when rate limit bucket is exhausted", async () => {
    exhaustRateLimit("rl:daily:5.5.5.5", 20);
    const { status } = await readJson(await submit({ date: TODAY, trace: LEGIT_TRACE }, "5.5.5.5"));
    expect(status).toBe(429);
  });
});

// ---- Stale date ----
describe("POST /api/daily/submit — stale date", () => {
  it("returns 400 for a date that is not server today", async () => {
    const { status, body } = await readJson(await submit({ date: "2020-1-1", trace: LEGIT_TRACE }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/stale/i);
  });

  it("returns 400 when date is missing", async () => {
    const { status } = await readJson(await submit({ trace: LEGIT_TRACE }));
    expect(status).toBe(400);
  });
});

// ---- Trace verification ----
describe("POST /api/daily/submit — trace verification", () => {
  it("accepts a legit trace (anon path) and returns 200 with a view", async () => {
    const { status, body } = await readJson(
      await submit({ date: TODAY, trace: LEGIT_TRACE, uid: "anon-uid-12345678", name: "Tester" }),
    );
    expect(status).toBe(200);
    expect(body).toHaveProperty("top");
    expect(body).toHaveProperty("date");
  });

  it("rejects a trace where a pick is not in the spin pool (wrong pick)", async () => {
    const tampered = LEGIT_TRACE.map((s, i) => (i === 0 ? { ...s, pickedId: "michael_jordan" } : s));
    const { status, body } = await readJson(
      await submit({ date: TODAY, trace: tampered, uid: "anon-uid-12345678" }),
    );
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("rejects a trace with a fabricated extra step (length != 5)", async () => {
    const { status } = await readJson(
      await submit({ date: TODAY, trace: LEGIT_TRACE.slice(0, 4), uid: "anon-uid-12345678" }),
    );
    expect(status).toBe(400);
  });

  it("rejects a trace with a duplicated slot (client-claimed different slot)", async () => {
    const tampered = LEGIT_TRACE.map((s, i) => (i === 1 ? { ...s, slot: "PG" } : s));
    const { status } = await readJson(
      await submit({ date: TODAY, trace: tampered, uid: "anon-uid-12345678" }),
    );
    expect(status).toBe(400);
  });

  it("rejects trace:null (client-fabricated, non-array)", async () => {
    const { status } = await readJson(await submit({ date: TODAY, trace: null, uid: "anon-uid-12345678" }));
    expect(status).toBe(400);
  });

  it("rejects missing trace key (body has no 'trace' property)", async () => {
    const { status } = await readJson(await submit({ date: TODAY, uid: "anon-uid-12345678" }));
    expect(status).toBe(400);
  });
});

// ---- Anon path ----
describe("POST /api/daily/submit — anon path", () => {
  it("returns 400 when uid is missing and no session", async () => {
    const { status, body } = await readJson(await submit({ date: TODAY, trace: LEGIT_TRACE }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });

  it("returns 400 when uid is invalid (too short)", async () => {
    const { status, body } = await readJson(await submit({ date: TODAY, trace: LEGIT_TRACE, uid: "short" }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });

  it("returns 400 when uid contains invalid characters", async () => {
    const { status, body } = await readJson(
      await submit({ date: TODAY, trace: LEGIT_TRACE, uid: "bad uid!!!" }),
    );
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });

  it("anon submit stores in daily zset only — no weekly/alltime keys touched", async () => {
    const anonUid = "anon-uid-12345678";
    const { status } = await readJson(
      await submit({ date: TODAY, trace: LEGIT_TRACE, uid: anonUid }),
    );
    expect(status).toBe(200);

    // Daily zset must have the uid
    const dailyZ = `lb:${TODAY}`;
    expect(ctx.redis!.zsets.get(dailyZ)?.has(anonUid)).toBe(true);

    // No weekly or all-time keys should be populated (anon path uses submitScore, not submitScoreAuthed)
    const weeklyKeys = [...ctx.redis!.zsets.keys()].filter((k) => k.startsWith("lb:week:"));
    const alltimeKeys = [...ctx.redis!.zsets.keys()].filter((k) => k === "lb:alltime");
    expect(weeklyKeys).toHaveLength(0);
    expect(alltimeKeys).toHaveLength(0);

    // No server-side streak for anonymous players — streak stays in their localStorage only.
    const streakKeys = [...ctx.redis!.zsets.keys()].filter((k) => k.startsWith("streak:"));
    expect(streakKeys).toHaveLength(0);
  });

  it("anon keep-best: resubmitting a worse score does not decrease the stored score", async () => {
    const anonUid = "anon-uid-12345678";
    const dailyZ = `lb:${TODAY}`;
    // Pre-seed a score higher than what LEGIT_TRACE will produce (wins=60, net=8.3 → 60108).
    // Use wins=70 (encScore(70, 0) = 70100) so the submitted trace (60108) is strictly worse.
    const highScore = 70100;
    ctx.redis!.zsets.set(dailyZ, new Map([[anonUid, highScore]]));

    // Submit the legit trace — it would produce 60108, which is < 70100.
    // submitScore's keep-best guard must leave the stored score unchanged.
    await submit({ date: TODAY, trace: LEGIT_TRACE, uid: anonUid });
    const stored = ctx.redis!.zsets.get(dailyZ)?.get(anonUid) ?? 0;
    expect(stored).toBe(highScore);
  });

  it("anon keep-best is atomic (eval) and a worse submit still refreshes the board TTLs", async () => {
    const anonUid = "anon-uid-12345678";
    const dailyZ = `lb:${TODAY}`;
    const dailyH = `lb:${TODAY}:meta`;
    // First (improving) submit goes through the shared keep-best Lua — meta + score move together.
    await submit({ date: TODAY, trace: LEGIT_TRACE, uid: anonUid });
    expect(ctx.redis!.calls.some((c) => c.startsWith(`eval ${dailyZ},${dailyH}`))).toBe(true);
    expect(ctx.redis!.ttls.has(dailyZ)).toBe(true);

    // A repeat (non-improving) submit must still refresh both TTLs — no TTL-stranded keys.
    ctx.redis!.ttls.delete(dailyZ);
    ctx.redis!.ttls.delete(dailyH);
    await submit({ date: TODAY, trace: LEGIT_TRACE, uid: anonUid }, "5.6.7.8");
    expect(ctx.redis!.ttls.has(dailyZ)).toBe(true);
    expect(ctx.redis!.ttls.has(dailyH)).toBe(true);
  });
});

// ---- Authed path ----
describe("POST /api/daily/submit — authed path", () => {
  it("signed-in submit stores in daily + weekly + alltime zsets", async () => {
    await signIn({ uid: "gaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", name: "Alice" });
    const uid = "gaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const { status } = await readJson(await submit({ date: TODAY, trace: LEGIT_TRACE }));
    expect(status).toBe(200);

    const dailyZ = `lb:${TODAY}`;
    expect(ctx.redis!.zsets.get(dailyZ)?.has(uid)).toBe(true);

    const weeklyKeys = [...ctx.redis!.zsets.keys()].filter((k) => k.startsWith("lb:week:"));
    expect(weeklyKeys.length).toBeGreaterThan(0);

    expect(ctx.redis!.zsets.has("lb:alltime")).toBe(true);
  });

  it("KEEP_BEST_LUA: resubmitting same score is a no-op on weekly/alltime", async () => {
    await signIn({ uid: "gbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", name: "Bob" });
    const uid = "gbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    await submit({ date: TODAY, trace: LEGIT_TRACE });
    const weekKey = [...ctx.redis!.zsets.keys()].find((k) => k.startsWith("lb:week:"))!;
    const weekScoreAfterFirst = ctx.redis!.zsets.get(weekKey)?.get(uid) ?? 0;
    const alltimeAfterFirst = ctx.redis!.zsets.get("lb:alltime")?.get(uid) ?? 0;

    // Same run again — KEEP_BEST_LUA returns changed=0, no delta
    await submit({ date: TODAY, trace: LEGIT_TRACE });
    const weekScoreAfterSecond = ctx.redis!.zsets.get(weekKey)?.get(uid) ?? 0;
    const alltimeAfterSecond = ctx.redis!.zsets.get("lb:alltime")?.get(uid) ?? 0;

    expect(weekScoreAfterSecond).toBe(weekScoreAfterFirst);
    expect(alltimeAfterSecond).toBe(alltimeAfterFirst);
  });

  it("meta hash written on authed submit", async () => {
    await signIn({ uid: "gcccccccccccccccccccccccccccccc", name: "Carol" });
    const uid = "gcccccccccccccccccccccccccccccc";

    await submit({ date: TODAY, trace: LEGIT_TRACE, name: "Carol" });

    const metaH = `lb:${TODAY}:meta`;
    const meta = ctx.redis!.hashes.get(metaH);
    expect(meta?.has(uid)).toBe(true);
  });

  it("records today's date in the per-account streak zset (server-authoritative, survives device swap)", async () => {
    const uid = "g" + "f".repeat(31);
    await signIn({ uid, name: "Fae" });

    const { status } = await readJson(await submit({ date: TODAY, trace: LEGIT_TRACE }));
    expect(status).toBe(200);

    const streakZ = `streak:${uid}`;
    expect(ctx.redis!.zsets.get(streakZ)?.has(TODAY)).toBe(true);
  });
});

// ---- Claim cleanup ----
describe("POST /api/daily/submit — claim cleanup", () => {
  it("removes the anon row when session has anon field pointing to a different uid", async () => {
    // First, seed the anon row on the board directly
    const anonUid = "anon-uid-cleanup001";
    const dailyZ = `lb:${TODAY}`;
    const metaH = `lb:${TODAY}:meta`;
    ctx.redis!.zsets.set(dailyZ, new Map([[anonUid, 50000]]));
    ctx.redis!.hashes.set(metaH, new Map([[anonUid, JSON.stringify({ uid: anonUid, name: "Anon" })]]));

    // Sign in as an authed user whose session carries the anon uid
    const authedUid = "gdddddddddddddddddddddddddddddd";
    await signIn({ uid: authedUid, name: "Dave", anon: anonUid });

    const { status } = await readJson(await submit({ date: TODAY, trace: LEGIT_TRACE }));
    expect(status).toBe(200);

    // Anon row should be removed
    expect(ctx.redis!.zsets.get(dailyZ)?.has(anonUid)).toBeFalsy();
    expect(ctx.redis!.hashes.get(metaH)?.has(anonUid)).toBeFalsy();

    // Authed uid should now be on the board
    expect(ctx.redis!.zsets.get(dailyZ)?.has(authedUid)).toBe(true);
  });

  it("does NOT remove the authed user's own row when session.anon equals session.uid", async () => {
    const uid = "geeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    // anon === uid: the route skips removeEntry because `session.anon !== uid` is false
    await signIn({ uid, name: "Eve", anon: uid });

    const dailyZ = `lb:${TODAY}`;
    // Pre-seed the uid so we can distinguish "was never removed" from "re-added after removal".
    const preScore = 50000;
    ctx.redis!.zsets.set(dailyZ, new Map([[uid, preScore]]));

    // Snapshot calls before submit to isolate new calls during the request.
    const callsBefore = ctx.redis!.calls.length;
    await submit({ date: TODAY, trace: LEGIT_TRACE });

    // No zrem call targeting this uid should have been made during the submit.
    const newCalls = ctx.redis!.calls.slice(callsBefore);
    const hadZrem = newCalls.some((c) => c.startsWith("zrem") && c.includes(uid));
    expect(hadZrem).toBe(false);

    // uid should still be on the board (submitScoreAuthed may update its score; either way it's present)
    expect(ctx.redis!.zsets.get(dailyZ)?.has(uid)).toBe(true);
  });
});

// ---- after() / ev:submit counter ----
describe("POST /api/daily/submit — after() side effects", () => {
  it("flushAfter increments ev:submit counter in Redis", async () => {
    const { status } = await readJson(
      await submit({ date: TODAY, trace: LEGIT_TRACE, uid: "anon-uid-99999999" }),
    );
    expect(status).toBe(200);

    await flushAfter();

    // bump writes to ev:submit:<day>  (no zero-padding — matches lib/day.ts exactly)
    const d = new Date();
    const day = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    const counterKey = `ev:submit:${day}`;
    const val = ctx.redis!.strings.get(counterKey);
    expect(Number(val)).toBeGreaterThanOrEqual(1);
  });
});
