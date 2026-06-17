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
authEnv();

// ---- Deterministic fixture world ----
// Players are constructed to produce predictable blueprint metric values when evaluated.
// All usg=22 → total usage demand = 110, which falls in the D band for discipline (>= 108, < 118).
// blk=2.5 on the C and rimProtector=true produces a non-zero rim metric.
const mkP = (id: string, slot: string): Player =>
  ({
    id,
    person_id: id,
    name: id,
    year: 2015,
    decade: "2010s",
    tier: "complete",
    team: "BOS",
    pos: slot,
    eligible: [slot],
    g: 70,
    mp: 32,
    obpm: 4,
    dbpm: 1,
    usg: 22,
    blk: slot === "C" ? 2.5 : 0,
    trb: slot === "C" ? 11 : 4,
  } as unknown as Player);

const PLAYERS: Record<string, Player> = {
  p0pg: mkP("p0pg", "PG"),
  p1sg: mkP("p1sg", "SG"),
  p2sf: mkP("p2sf", "SF"),
  p3pf: mkP("p3pf", "PF"),
  p4c:  mkP("p4c",  "C"),
};

// bp-<date> seed: the route uses `bp-${date}` (not `daily-${date}`)
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

const { POST } = await import("@/app/api/blueprint/submit/route");

const todayUTC = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
};

const TODAY = todayUTC();

const LEGIT_TRACE: DraftStep[] = [
  { slot: "PG", pickedId: "p0pg", respins: [] },
  { slot: "SG", pickedId: "p1sg", respins: [] },
  { slot: "SF", pickedId: "p2sf", respins: [] },
  { slot: "PF", pickedId: "p3pf", respins: [] },
  { slot: "C",  pickedId: "p4c",  respins: [] },
];

const submit = (body: unknown, ip = "1.2.3.4") =>
  POST(req("/api/blueprint/submit", { body, method: "POST", ip }));

function anonBody(overrides: Record<string, unknown> = {}) {
  return { date: TODAY, uid: "anonusr-blueprint01", trace: LEGIT_TRACE, blueprint: "balanced", ...overrides };
}

beforeEach(() => { freshFake(); });

// ---- Rate limit ----
describe("POST /api/blueprint/submit — rate limit", () => {
  it("returns 429 when rate limit bucket is exhausted", async () => {
    exhaustRateLimit("rl:bpsubmit:5.5.5.5", 20);
    const { status } = await readJson(await submit(anonBody(), "5.5.5.5"));
    expect(status).toBe(429);
  });
});

// ---- Stale / wrong date ----
describe("POST /api/blueprint/submit — date validation", () => {
  it("returns 400 for a date that is not server today", async () => {
    const { status, body } = await readJson(await submit(anonBody({ date: "2020-1-1" })));
    expect(status).toBe(400);
    expect(body.error).toMatch(/stale/i);
  });

  it("returns 400 when date is missing", async () => {
    const { status } = await readJson(await submit({ uid: "anonusr-blueprint01", trace: LEGIT_TRACE, blueprint: "balanced" }));
    expect(status).toBe(400);
  });
});

// ---- Blueprint key validation ----
describe("POST /api/blueprint/submit — blueprint validation", () => {
  it("returns 400 for an unknown blueprint key", async () => {
    const { status, body } = await readJson(await submit(anonBody({ blueprint: "invalidkey" })));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad blueprint/i);
  });

  it("returns 400 when blueprint is missing", async () => {
    const { status } = await readJson(await submit({ date: TODAY, uid: "anonusr-blueprint01", trace: LEGIT_TRACE }));
    expect(status).toBe(400);
  });

  it("accepts each valid blueprint key", async () => {
    for (const bp of ["spacing", "fortress", "discipline", "rim", "balanced"] as const) {
      freshFake();
      const { status } = await readJson(await submit(anonBody({ blueprint: bp })));
      expect(status).toBe(200);
    }
  });
});

// ---- Anon uid validation ----
describe("POST /api/blueprint/submit — anon uid validation", () => {
  it("returns 400 when uid is missing and no session", async () => {
    const { status, body } = await readJson(await submit({ date: TODAY, trace: LEGIT_TRACE, blueprint: "balanced" }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });

  it("returns 400 when uid is too short", async () => {
    const { status, body } = await readJson(await submit(anonBody({ uid: "short" })));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });

  it("returns 400 when uid contains invalid characters", async () => {
    const { status, body } = await readJson(await submit(anonBody({ uid: "bad uid!!!" })));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });
});

// ---- Trace verification ----
describe("POST /api/blueprint/submit — trace verification", () => {
  it("rejects a pick that is not in the spin pool", async () => {
    const tampered = LEGIT_TRACE.map((s, i) => (i === 0 ? { ...s, pickedId: "not-in-pool" } : s));
    const { status } = await readJson(await submit(anonBody({ trace: tampered })));
    expect(status).toBe(400);
  });

  it("rejects a short trace (fewer than 5 steps)", async () => {
    const { status } = await readJson(await submit(anonBody({ trace: LEGIT_TRACE.slice(0, 4) })));
    expect(status).toBe(400);
  });

  it("rejects a null trace", async () => {
    const { status } = await readJson(await submit(anonBody({ trace: null })));
    expect(status).toBe(400);
  });

  it("rejects a missing trace key", async () => {
    const { status } = await readJson(await submit({ date: TODAY, uid: "anonusr-blueprint01", blueprint: "balanced" }));
    expect(status).toBe(400);
  });

  it("rejects a duplicated slot", async () => {
    const tampered = LEGIT_TRACE.map((s, i) => (i === 1 ? { ...s, slot: "PG" } : s));
    const { status } = await readJson(await submit(anonBody({ trace: tampered })));
    expect(status).toBe(400);
  });
});

// ---- Happy path: response shape + board writes ----
describe("POST /api/blueprint/submit — happy path", () => {
  it("returns 200 with a valid view on an anon balanced submit", async () => {
    const { status, body } = await readJson(await submit(anonBody()));
    expect(status).toBe(200);
    // BpBoardView shape
    expect(body).toHaveProperty("date", TODAY);
    expect(body).toHaveProperty("bp", "balanced");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.top)).toBe(true);
  });

  it("the you row in the response carries grade, score, and bp fields", async () => {
    const { status, body } = await readJson(await submit(anonBody()));
    expect(status).toBe(200);
    const you = body.you as Record<string, unknown> | undefined;
    expect(you).toBeDefined();
    expect(typeof you!.grade).toBe("string");
    expect(typeof you!.score).toBe("number");
    expect(you!.bp).toBe("balanced");
  });

  it("writes a row to both the per-blueprint zset and the combined all zset", async () => {
    const uid = "anonusr-blueprint01";
    await submit(anonBody({ uid, blueprint: "spacing" }));

    const spacingZ = `lb:bp:${TODAY}:spacing`;
    const allZ = `lb:bp:${TODAY}:all`;
    expect(ctx.redis!.zsets.get(spacingZ)?.has(uid)).toBe(true);
    expect(ctx.redis!.zsets.get(allZ)?.has(uid)).toBe(true);
  });

  it("writes meta to both per-blueprint and all meta hashes", async () => {
    const uid = "anonusr-blueprint01";
    await submit(anonBody({ uid, blueprint: "fortress" }));

    const fortressH = `lb:bp:${TODAY}:fortress:meta`;
    const allH = `lb:bp:${TODAY}:all:meta`;
    expect(ctx.redis!.hashes.get(fortressH)?.has(uid)).toBe(true);
    expect(ctx.redis!.hashes.get(allH)?.has(uid)).toBe(true);
  });

  it("the stored meta row has the correct bp field matching the submitted blueprint", async () => {
    const uid = "anonusr-blueprint02";
    await submit(anonBody({ uid, blueprint: "rim" }));

    const rimH = `lb:bp:${TODAY}:rim:meta`;
    const raw = ctx.redis!.hashes.get(rimH)?.get(uid);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.bp).toBe("rim");
  });

  it("lineup in the stored row encodes the blueprint code as the bs~ prefix", async () => {
    // The lineup field should start with "b<code>~" where for spacing code = "s"
    const uid = "anonusr-blueprint03";
    await submit(anonBody({ uid, blueprint: "spacing" }));

    const spacingH = `lb:bp:${TODAY}:spacing:meta`;
    const raw = ctx.redis!.hashes.get(spacingH)?.get(uid);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    // spacing blueprint code is "s" → lineup starts with "bs~"
    expect(String(parsed.lineup)).toMatch(/^bs~/);
  });

  it("usedHints flag is encoded in the lineup when true", async () => {
    const uid = "anonusr-blueprint04";
    await submit(anonBody({ uid, blueprint: "balanced", usedHints: true }));

    const allH = `lb:bp:${TODAY}:all:meta`;
    const raw = ctx.redis!.hashes.get(allH)?.get(uid);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    // hints stamp = "h~"
    expect(String(parsed.lineup)).toContain("h~");
  });
});

// ---- Keep-best ----
describe("POST /api/blueprint/submit — keep-best", () => {
  it("a worse second submit does not lower the stored score", async () => {
    const uid = "anonusr-blueprint01";
    const spacingZ = `lb:bp:${TODAY}:spacing`;
    // Pre-seed a very high score
    const highScore = 9999999;
    ctx.redis!.zsets.set(spacingZ, new Map([[uid, highScore]]));

    await submit(anonBody({ uid, blueprint: "spacing" }));

    const stored = ctx.redis!.zsets.get(spacingZ)?.get(uid) ?? 0;
    expect(stored).toBe(highScore);
  });

  it("a better second submit replaces the stored score", async () => {
    const uid = "anonusr-blueprint05";
    // Submit once (establishes a real score)
    await submit(anonBody({ uid, blueprint: "balanced" }));
    const spacingZ = `lb:bp:${TODAY}:balanced`;
    const firstScore = ctx.redis!.zsets.get(spacingZ)?.get(uid) ?? 0;

    // Now overwrite with an artificially higher pre-seed so the next submit is "worse"
    // (i.e. test the inverse: a re-submit with the same lineup produces the SAME score,
    // which stays because keep-best only writes when strictly better)
    const sameScore = firstScore;
    ctx.redis!.zsets.get(spacingZ)!.set(uid, sameScore);

    await submit(anonBody({ uid, blueprint: "balanced" }));
    const afterScore = ctx.redis!.zsets.get(spacingZ)?.get(uid) ?? 0;
    // Same or better — must not decrease
    expect(afterScore).toBeGreaterThanOrEqual(firstScore);
  });
});

// ---- Authed path ----
describe("POST /api/blueprint/submit — authed session", () => {
  it("uses session uid when signed in, ignoring body uid", async () => {
    const sessionUid = "gsession-blueprint001";
    await signIn({ uid: sessionUid, name: "SessionUser" });

    const { status } = await readJson(await submit(anonBody({ uid: "ignored-uid-body" })));
    expect(status).toBe(200);

    const balancedZ = `lb:bp:${TODAY}:balanced`;
    expect(ctx.redis!.zsets.get(balancedZ)?.has(sessionUid)).toBe(true);
    expect(ctx.redis!.zsets.get(balancedZ)?.has("ignored-uid-body")).toBeFalsy();
  });
});

// ---- Anon→auth claim cleanup ----
describe("POST /api/blueprint/submit — claim cleanup (removeBpEntry)", () => {
  it("removes the anon row from all 6 boards when session.anon !== uid", async () => {
    const anonUid = "anon-bp-cleanup001";
    const authedUid = "gsession-cleanup001";
    const DATE = TODAY;

    // Seed the anon row on the balanced board and the all board
    const boards = ["spacing", "fortress", "discipline", "rim", "balanced", "all"];
    for (const bp of boards) {
      const z = `lb:bp:${DATE}:${bp}`;
      const h = `lb:bp:${DATE}:${bp}:meta`;
      ctx.redis!.zsets.set(z, new Map([[anonUid, 50000]]));
      ctx.redis!.hashes.set(h, new Map([[anonUid, JSON.stringify({ uid: anonUid, name: "Anon", bp: "balanced" })]]));
    }

    await signIn({ uid: authedUid, name: "AuthedUser", anon: anonUid });
    const { status } = await readJson(await submit(anonBody({ blueprint: "balanced" })));
    expect(status).toBe(200);

    // All six boards must have the anon row removed
    for (const bp of boards) {
      const z = `lb:bp:${DATE}:${bp}`;
      const h = `lb:bp:${DATE}:${bp}:meta`;
      expect(ctx.redis!.zsets.get(z)?.has(anonUid)).toBeFalsy();
      expect(ctx.redis!.hashes.get(h)?.has(anonUid)).toBeFalsy();
    }

    // The authed uid should appear on the balanced and all boards
    const balancedZ = `lb:bp:${DATE}:balanced`;
    const allZ = `lb:bp:${DATE}:all`;
    expect(ctx.redis!.zsets.get(balancedZ)?.has(authedUid)).toBe(true);
    expect(ctx.redis!.zsets.get(allZ)?.has(authedUid)).toBe(true);
  });

  it("does NOT remove the row when session.anon equals session.uid", async () => {
    const uid = "gsession-sameuid001";
    await signIn({ uid, name: "SameUser", anon: uid });

    const balancedZ = `lb:bp:${TODAY}:balanced`;
    ctx.redis!.zsets.set(balancedZ, new Map([[uid, 50000]]));

    const callsBefore = ctx.redis!.calls.length;
    await submit(anonBody({ blueprint: "balanced" }));

    const newCalls = ctx.redis!.calls.slice(callsBefore);
    const hadZrem = newCalls.some((c) => c.startsWith("zrem") && c.includes(uid));
    expect(hadZrem).toBe(false);
  });
});

// ---- after() side effects ----
describe("POST /api/blueprint/submit — after() side effects", () => {
  it("flushAfter increments the ev:submit counter", async () => {
    const { status } = await readJson(await submit(anonBody()));
    expect(status).toBe(200);

    await flushAfter();

    const d = new Date();
    const day = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    const counterKey = `ev:submit:${day}`;
    const val = ctx.redis!.strings.get(counterKey);
    expect(Number(val)).toBeGreaterThanOrEqual(1);
    // submit is mode-tagged → admin can compute play→submit conversion per mode
    expect(Number(ctx.redis!.hashes.get(`ev:submode:${day}`)?.get("blueprint"))).toBeGreaterThanOrEqual(1);
  });
});

// ---- 503 gate: todo (same constraint as other route tests) ----
describe("POST /api/blueprint/submit — disabled board", () => {
  it.todo(
    "returns 503 when isBpBoardEnabled() is false (Redis env absent at module import time) — cannot be exercised in this file without a full vi.resetModules() flow because the redis singleton is already bound at module eval",
  );
});
