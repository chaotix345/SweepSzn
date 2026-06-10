import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enableRedisEnv,
  freshFake,
  authEnv,
  signIn,
  ctx,
  req,
  readJson,
  exhaustRateLimit,
  flushAfter,
} from "@/test/routeHarness";
import type { DraftStep } from "@/lib/types";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// Fixture world: five players, one per slot, forming a valid trace.
// spinPool determinism: the mock returns fixed pools keyed by seed+round so verifyTrace passes.
const mkP = (id: string, slot: string) => ({
  id,
  person_id: id,
  name: id,
  year: 2015,
  decade: "2010s",
  tier: "complete" as const,
  team: "GSW",
  pos: slot,
  eligible: [slot],
});

const PLAYERS: Record<string, ReturnType<typeof mkP>> = {
  p0pg: mkP("p0pg", "PG"),
  p1sg: mkP("p1sg", "SG"),
  p2sf: mkP("p2sf", "SF"),
  p3pf: mkP("p3pf", "PF"),
  p4c: mkP("p4c", "C"),
};

const BASE_POOLS: Record<number, string[]> = {
  0: ["p0pg"],
  1: ["p1sg"],
  2: ["p2sf"],
  3: ["p3pf"],
  4: ["p4c"],
};

vi.mock("@/lib/data", () => ({
  spinPool: (seed: string, round: number) => ({
    team: "GSW",
    decade: "2010s",
    ids: BASE_POOLS[round] ?? [],
  }),
  getPlayersByIds: (ids: string[]) => ids.map((id) => PLAYERS[id]).filter(Boolean),
  getCoefficients: () => ({}),
}));

vi.mock("@/lib/engine", () => ({
  evaluateLineup: () => ({
    wins: 55,
    losses: 27,
    netRtg: 7.5,
    ortg: 112,
    drtg: 104.5,
    winPct: 0.67,
    grade: "B+",
    label: "Contender",
    factors: [],
    players: [],
    notes: [],
  }),
}));

// Keep push silent — VAPID keys are absent, so isPushEnabled() returns false and sendPushToUid no-ops.
// No extra mock needed.

enableRedisEnv();
authEnv();
const { POST } = await import("@/app/api/challenge/submit/route");

const VALID_ID = "abc12345";

const LEGIT_TRACE: DraftStep[] = [
  { slot: "PG", pickedId: "p0pg", respins: [] },
  { slot: "SG", pickedId: "p1sg", respins: [] },
  { slot: "SF", pickedId: "p2sf", respins: [] },
  { slot: "PF", pickedId: "p3pf", respins: [] },
  { slot: "C", pickedId: "p4c", respins: [] },
];

const anonUid = "anon-user-001";

const post = (body: unknown, ip = "9.9.9.9") =>
  POST(req("/api/challenge/submit", { body, ip }));

beforeEach(() => {
  freshFake();
});

describe("POST /api/challenge/submit — disabled", () => {
  it.todo(
    "503 when redis env is absent — cannot test: isChallengeEnabled() reads the module-level redis " +
    "const set at import time; would require a separate worker with env stripped before import",
  );
});

describe("POST /api/challenge/submit — validation", () => {
  it("400 on bad challenge id (too short)", async () => {
    const { status, body } = await readJson(
      await post({ id: "bad", uid: anonUid, trace: LEGIT_TRACE }),
    );
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad challenge id/i);
  });

  it("400 on bad challenge id (illegal chars)", async () => {
    const { status } = await readJson(
      await post({ id: "INVALID!", uid: anonUid, trace: LEGIT_TRACE }),
    );
    expect(status).toBe(400);
  });

  it("400 when anon uid is absent (and no session)", async () => {
    const { status, body } = await readJson(
      await post({ id: VALID_ID, trace: LEGIT_TRACE }),
    );
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });

  it("400 when anon uid fails the pattern (too short)", async () => {
    const { status } = await readJson(
      await post({ id: VALID_ID, uid: "short", trace: LEGIT_TRACE }),
    );
    expect(status).toBe(400);
  });

  it("400 on a bad trace (off-pool pick)", async () => {
    const badTrace: DraftStep[] = [
      { slot: "PG", pickedId: "not_in_pool", respins: [] },
      ...LEGIT_TRACE.slice(1),
    ];
    const { status } = await readJson(
      await post({ id: VALID_ID, uid: anonUid, trace: badTrace }),
    );
    expect(status).toBe(400);
  });

  it("400 on a bad trace (wrong length)", async () => {
    const { status } = await readJson(
      await post({ id: VALID_ID, uid: anonUid, trace: LEGIT_TRACE.slice(0, 4) }),
    );
    expect(status).toBe(400);
  });
});

describe("POST /api/challenge/submit — creator path", () => {
  it("first submit claims the creator slot and returns role:creator + board", async () => {
    const { status, body } = await readJson(
      await post({ id: VALID_ID, uid: anonUid, name: "Alice", trace: LEGIT_TRACE }),
    );
    expect(status).toBe(200);
    expect(body.role).toBe("creator");
    expect(body.id).toBe(VALID_ID);
    expect(body.board).toBeDefined();
    expect((body.board as Record<string, unknown>).total).toBe(1);
  });

  it("creator info key (nx) is written to Redis on first submit", async () => {
    await post({ id: VALID_ID, uid: anonUid, name: "Alice", trace: LEGIT_TRACE });
    const infoKey = `chal:${VALID_ID}:info`;
    expect(ctx.redis!.strings.has(infoKey)).toBe(true);
    const stored = JSON.parse(ctx.redis!.strings.get(infoKey)!);
    expect(stored.uid).toBe(anonUid);
    expect(stored.name).toBe("Alice");
    expect(stored.wins).toBe(55);
  });

  it("second submit with a DIFFERENT uid uses the STORED seed (responder path)", async () => {
    // First: creator
    await post({ id: VALID_ID, uid: anonUid, name: "Alice", trace: LEGIT_TRACE });
    // Second: responder (same seed, different uid)
    const { status, body } = await readJson(
      await post({ id: VALID_ID, uid: "responder-uid-001", name: "Bob", trace: LEGIT_TRACE }),
    );
    expect(status).toBe(200);
    expect(body.role).toBe("responder");
  });

  it("creator re-submitting stays role:creator (idempotent)", async () => {
    await post({ id: VALID_ID, uid: anonUid, name: "Alice", trace: LEGIT_TRACE });
    // Capture the info key as written by the first submit
    const infoAfterFirst = JSON.parse(ctx.redis!.strings.get(`chal:${VALID_ID}:info`)!);

    const { status, body } = await readJson(
      await post({ id: VALID_ID, uid: anonUid, name: "Alice", trace: LEGIT_TRACE }),
    );
    expect(status).toBe(200);
    expect(body.role).toBe("creator");
    // The nx:true set must have prevented overwriting the info key.
    // If set-nx were ever changed to set (no nx option), the uid would still match
    // the creator check and role would still be "creator" — but the original row must survive.
    const infoAfterResubmit = JSON.parse(ctx.redis!.strings.get(`chal:${VALID_ID}:info`)!);
    expect(infoAfterResubmit).toStrictEqual(infoAfterFirst);
  });

  it("seed supplied by creator is stored in info key", async () => {
    await post({
      id: VALID_ID,
      uid: anonUid,
      trace: LEGIT_TRACE,
      seed: "daily-2026-6-10",
    });
    const stored = JSON.parse(ctx.redis!.strings.get(`chal:${VALID_ID}:info`)!);
    expect(stored.seed).toBe("daily-2026-6-10");
  });

  it("hinted flag propagated to info when creator submits with usedHints:true", async () => {
    await post({
      id: VALID_ID,
      uid: anonUid,
      trace: LEGIT_TRACE,
      usedHints: true,
    });
    const stored = JSON.parse(ctx.redis!.strings.get(`chal:${VALID_ID}:info`)!);
    expect(stored.hinted).toBe(true);
  });

  it("classic seed triggers fit-lock key", async () => {
    await post({
      id: VALID_ID,
      uid: anonUid,
      trace: LEGIT_TRACE,
      seed: "classic-abc123",
    });
    expect(ctx.redis!.strings.has("chal:fitlock:classic-abc123")).toBe(true);
  });

  it("non-classic seed does NOT set fit-lock key", async () => {
    await post({ id: VALID_ID, uid: anonUid, trace: LEGIT_TRACE, seed: "daily-2026-6-10" });
    const lockKeys = [...ctx.redis!.strings.keys()].filter((k) => k.startsWith("chal:fitlock:"));
    expect(lockKeys.length).toBe(0);
  });
});

describe("POST /api/challenge/submit — keep-best on re-submit", () => {
  it("responder re-submit with SAME score: improved=false, board not regressed", async () => {
    await post({ id: VALID_ID, uid: anonUid, name: "Alice", trace: LEGIT_TRACE });
    await post({ id: VALID_ID, uid: "responder-uid-001", name: "Bob", trace: LEGIT_TRACE });
    // Capture the score written by the first Bob submit before re-submitting
    const scoreAfterFirstSubmit = ctx.redis!.zsets.get(`chal:${VALID_ID}`)?.get("responder-uid-001");
    expect(scoreAfterFirstSubmit).toBeDefined();

    // Bob re-submits identical score
    const { body } = await readJson(
      await post({ id: VALID_ID, uid: "responder-uid-001", name: "Bob", trace: LEGIT_TRACE }),
    );
    // Board total must not grow (no duplicate slot)
    expect((body.board as Record<string, unknown>).total).toBe(2);
    // The zset score must NOT have been overwritten on a non-improving re-submit.
    // If submitChallenge ever removed the score>prev guard and always zadd'd, this would catch it.
    const scoreAfterReSubmit = ctx.redis!.zsets.get(`chal:${VALID_ID}`)?.get("responder-uid-001");
    expect(scoreAfterReSubmit).toBe(scoreAfterFirstSubmit);
  });
});

describe("POST /api/challenge/submit — responder path + verdict", () => {
  it("responder response includes creator bar + verdict + board", async () => {
    await post({ id: VALID_ID, uid: anonUid, name: "Alice", trace: LEGIT_TRACE });
    const { status, body } = await readJson(
      await post({ id: VALID_ID, uid: "responder-uid-001", name: "Bob", trace: LEGIT_TRACE }),
    );
    expect(status).toBe(200);
    expect(body.role).toBe("responder");
    const b = body as Record<string, unknown>;
    expect(b.creator).toBeDefined();
    expect(b.verdict).toBeDefined();
    expect(b.board).toBeDefined();
    const verdict = b.verdict as Record<string, unknown>;
    // Same score => tie
    expect(verdict.outcome).toBe("tie");
  });

  it("responder with better score gets outcome:win", async () => {
    // Make creator score lower by pre-seeding the info key with a weaker result
    const weakInfo = {
      uid: anonUid,
      name: "Alice",
      wins: 40,
      losses: 42,
      net: -2.0,
      grade: "D",
      lineup: "p0pg,p1sg,p2sf,p3pf,p4c",
      seed: `h2h-${VALID_ID}`,
      hinted: false,
    };
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(weakInfo));
    // Also seed the creator's board entry so board.you resolves correctly for the creator
    ctx.redis!.zsets.set(
      `chal:${VALID_ID}`,
      new Map([[anonUid, 40 * 1000 + 150]]),
    );
    ctx.redis!.hashes.set(
      `chal:${VALID_ID}:meta`,
      new Map([[anonUid, JSON.stringify(weakInfo)]]),
    );

    const { body } = await readJson(
      await post({ id: VALID_ID, uid: "responder-uid-001", name: "Bob", trace: LEGIT_TRACE }),
    );
    const verdict = (body as Record<string, unknown>).verdict as Record<string, unknown>;
    // Engine returns wins=55 > creator's wins=40 => responder wins
    expect(verdict.outcome).toBe("win");
  });

  it("responder with lower score gets outcome:loss", async () => {
    // Creator has wins=70 (stored directly, above the engine mock's fixed output of 55).
    // compareResults(a={wins:55}, b={wins:70}) → winner="b" → outcome:"loss" for the responder.
    const strongInfo = {
      uid: anonUid,
      name: "Alice",
      wins: 70,
      losses: 12,
      net: 15.0,
      grade: "A+",
      lineup: "p0pg,p1sg,p2sf,p3pf,p4c",
      seed: `h2h-${VALID_ID}`,
      hinted: false,
    };
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(strongInfo));
    // Seed the creator's board entry so zrevrank returns a valid rank
    ctx.redis!.zsets.set(
      `chal:${VALID_ID}`,
      new Map([[anonUid, 70 * 1000 + 200]]),
    );
    ctx.redis!.hashes.set(
      `chal:${VALID_ID}:meta`,
      new Map([[anonUid, JSON.stringify(strongInfo)]]),
    );

    const { body } = await readJson(
      await post({ id: VALID_ID, uid: "responder-uid-001", name: "Bob", trace: LEGIT_TRACE }),
    );
    const verdict = (body as Record<string, unknown>).verdict as Record<string, unknown>;
    // Creator wins=70 > responder wins=55 → compareResults winner="b" → outcome:"loss"
    expect(verdict.outcome).toBe("loss");
  });
});

describe("POST /api/challenge/submit — authed session identity", () => {
  it("signed-in user's uid from session overrides body.uid", async () => {
    await signIn({ uid: "session-user-abc", name: "Charlie" });
    const { status, body } = await readJson(
      await post({
        id: VALID_ID,
        uid: "should-be-ignored",
        name: "Charlie",
        trace: LEGIT_TRACE,
      }),
    );
    expect(status).toBe(200);
    const stored = JSON.parse(ctx.redis!.strings.get(`chal:${VALID_ID}:info`)!);
    expect(stored.uid).toBe("session-user-abc");
    expect(body.role).toBe("creator");
  });
});

describe("POST /api/challenge/submit — after() notification fan-out", () => {
  it("responder new best: flushAfter enqueues notif to creator's list", async () => {
    // Seed a weak creator so the responder (wins=55) beats them
    const creatorUid = "creator-uid-notif";
    const weakInfo = {
      uid: creatorUid,
      name: "Creator",
      wins: 30,
      losses: 52,
      net: -5.0,
      grade: "F",
      lineup: "p0pg,p1sg,p2sf,p3pf,p4c",
      seed: `h2h-${VALID_ID}`,
      hinted: false,
    };
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(weakInfo));
    // Add creator to board so board is non-empty
    ctx.redis!.zsets.set(`chal:${VALID_ID}`, new Map([[creatorUid, 30 * 1000 + 95]]));
    ctx.redis!.hashes.set(
      `chal:${VALID_ID}:meta`,
      new Map([[creatorUid, JSON.stringify(weakInfo)]]),
    );

    await post({ id: VALID_ID, uid: "responder-uid-notif", name: "Bob", trace: LEGIT_TRACE });
    await flushAfter();

    const notifList = ctx.redis!.lists.get(`notif:${creatorUid}`);
    expect(notifList).toBeDefined();
    expect(notifList!.length).toBeGreaterThanOrEqual(1);
  });

  it("dedup nx key is set after notification fan-out", async () => {
    const creatorUid = "creator-uid-dedup";
    const weakInfo = {
      uid: creatorUid,
      name: "Creator",
      wins: 10,
      losses: 72,
      net: -10.0,
      grade: "F",
      lineup: "p0pg,p1sg,p2sf,p3pf,p4c",
      seed: `h2h-${VALID_ID}`,
      hinted: false,
    };
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(weakInfo));

    await post({ id: VALID_ID, uid: "responder-uid-dedup", name: "Sam", trace: LEGIT_TRACE });
    await flushAfter();

    const dedupKeys = [...ctx.redis!.strings.keys()].filter((k) =>
      k.startsWith(`notif:dedup:${creatorUid}:`),
    );
    expect(dedupKeys.length).toBeGreaterThanOrEqual(1);
  });

  it("no notification queued when improvement is false (not a new personal best)", async () => {
    // The real gate for notification fan-out is out.improved, which is false when the responder's
    // engine score does not exceed their prior zset score. The dedup key is irrelevant here because
    // the notification after() callback is never even registered when improved===false.
    const creatorUid = "creator-uid-noimprove";
    const weakInfo = {
      uid: creatorUid,
      name: "Creator",
      wins: 10,
      losses: 72,
      net: -10.0,
      grade: "F",
      lineup: "p0pg,p1sg,p2sf,p3pf,p4c",
      seed: `h2h-${VALID_ID}`,
      hinted: false,
    };
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(weakInfo));

    const responderUid = "responder-uid-noimprove";
    // First submit: improved===true, notification IS queued (score goes from null → engine score)
    await post({ id: VALID_ID, uid: responderUid, name: "Sam", trace: LEGIT_TRACE });
    await flushAfter();

    // Clear the notification list so we can observe only the second submit's effect.
    // Do NOT clear dedup keys — they are irrelevant; the gate is improved===false.
    ctx.redis!.lists.delete(`notif:${creatorUid}`);

    // Second submit: same engine score (55 wins) equals the now-stored zset score → improved===false.
    // The route never registers the notification after() callback when improved===false, so nothing
    // is enqueued regardless of dedup state.
    await post({ id: VALID_ID, uid: responderUid, name: "Sam", trace: LEGIT_TRACE });
    await flushAfter();

    const notifList = ctx.redis!.lists.get(`notif:${creatorUid}`);
    expect(!notifList || notifList.length === 0).toBe(true);
  });
});

describe("POST /api/challenge/submit — rate limit", () => {
  it("429 when bucket is exhausted", async () => {
    exhaustRateLimit("rl:chal:9.9.9.9", 20);
    const { status } = await readJson(
      await post({ id: VALID_ID, uid: anonUid, trace: LEGIT_TRACE }, "9.9.9.9"),
    );
    expect(status).toBe(429);
  });

  it("rate limit is per-IP: a different IP is not blocked", async () => {
    exhaustRateLimit("rl:chal:9.9.9.9", 20);
    const { status } = await readJson(
      await post({ id: VALID_ID, uid: anonUid, trace: LEGIT_TRACE }, "8.8.8.8"),
    );
    expect(status).toBe(200);
  });
});

describe("POST /api/challenge/submit — isGameSeed allowlist", () => {
  it("h2h- seed is NOT accepted from the client (security: closes poisoning hole)", async () => {
    // A client supplying an h2h- seed for a new challenge should NOT get it stored literally;
    // the route should fall through to challengeSeed(id) => h2h-<id>
    const { status } = await readJson(
      await post({
        id: VALID_ID,
        uid: anonUid,
        trace: LEGIT_TRACE,
        seed: "h2h-someotherid",
      }),
    );
    // The submit still succeeds (400 only on bad trace/id), but the stored seed
    // should be the canonical h2h-<VALID_ID>, not h2h-someotherid
    expect(status).toBe(200);
    const stored = JSON.parse(ctx.redis!.strings.get(`chal:${VALID_ID}:info`)!);
    expect(stored.seed).toBe(`h2h-${VALID_ID}`);
  });

  it("daily- seed is accepted from the creator", async () => {
    const { status } = await readJson(
      await post({
        id: VALID_ID,
        uid: anonUid,
        trace: LEGIT_TRACE,
        seed: "daily-2026-6-10",
      }),
    );
    expect(status).toBe(200);
    const stored = JSON.parse(ctx.redis!.strings.get(`chal:${VALID_ID}:info`)!);
    expect(stored.seed).toBe("daily-2026-6-10");
  });
});
