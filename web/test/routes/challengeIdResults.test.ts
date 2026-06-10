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
} from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// Minimal player stub so resolveFive doesn't return empty arrays
vi.mock("@/lib/data", () => ({
  getPlayersByIds: (ids: string[]) => ids.map((id) => ({
    id,
    person_id: id,
    name: id,
    year: 2015,
    decade: "2010s",
    tier: "complete",
    team: "GSW",
    pos: "PG",
    eligible: ["PG"],
  })),
  spinPool: () => ({ team: "GSW", decade: "2010s", ids: [] }),
  getCoefficients: () => ({}),
}));

enableRedisEnv();
authEnv();
const { POST } = await import("@/app/api/challenge/[id]/results/route");

const VALID_ID = "abc12345";
const CREATOR_UID = "creator-uid-results";
const RESPONDER_UID = "responder-uid-results";
const ANON_UID = "anon-user-results-001";

// Seed the fake with a challenge that has a creator + one responder
function seedChallenge() {
  const info = {
    uid: CREATOR_UID,
    name: "Alice",
    wins: 55,
    losses: 27,
    net: 7.5,
    grade: "B+",
    lineup: "p0pg,p1sg,p2sf,p3pf,p4c",
    seed: `h2h-${VALID_ID}`,
    hinted: false,
  };
  const creatorRow = { uid: CREATOR_UID, name: "Alice", wins: 55, losses: 27, net: 7.5, lineup: "p0pg,p1sg,p2sf,p3pf,p4c" };
  const responderRow = { uid: RESPONDER_UID, name: "Bob", wins: 48, losses: 34, net: 3.2, lineup: "p0pg,p1sg,p2sf,p3pf,p4c" };

  ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(info));

  const z = new Map<string, number>([
    [CREATOR_UID, 55000 + 175],
    [RESPONDER_UID, 48000 + 132],
  ]);
  ctx.redis!.zsets.set(`chal:${VALID_ID}`, z);

  const metaHash = new Map<string, string>([
    [CREATOR_UID, JSON.stringify(creatorRow)],
    [RESPONDER_UID, JSON.stringify(responderRow)],
  ]);
  ctx.redis!.hashes.set(`chal:${VALID_ID}:meta`, metaHash);
}

const post = (id: string, uid?: string, ip = "9.9.9.9") =>
  POST(req(`/api/challenge/${id}/results`, { body: uid !== undefined ? { uid } : undefined, ip }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  freshFake();
});

describe("POST /api/challenge/[id]/results — disabled", () => {
  it.todo(
    "503 when Redis is unavailable — cannot test: isChallengeEnabled() reads the module-level redis " +
    "const fixed at import time; requires a separate worker with env stripped before import",
  );
});

describe("POST /api/challenge/[id]/results — id validation", () => {
  it("400 on too-short id", async () => {
    const { status, body } = await readJson(await post("ab", CREATOR_UID));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad id/i);
  });

  it("400 on id with illegal chars", async () => {
    const { status, body } = await readJson(await post("BADID!", CREATOR_UID));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad id/i);
  });
});

describe("POST /api/challenge/[id]/results — uid validation (anon path)", () => {
  it("400 when no uid in body and no session", async () => {
    const { status, body } = await readJson(await post(VALID_ID));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });

  it("400 when uid fails the pattern (too short)", async () => {
    const { status, body } = await readJson(await post(VALID_ID, "short"));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });

  it("400 when uid has illegal chars", async () => {
    const { status } = await readJson(await post(VALID_ID, "uid!invalid@here"));
    expect(status).toBe(400);
  });
});

describe("POST /api/challenge/[id]/results — not found / forbidden", () => {
  it("404 when challenge does not exist", async () => {
    const { status, body } = await readJson(await post(VALID_ID, CREATOR_UID));
    expect(status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it("403 when uid does not match the creator", async () => {
    seedChallenge();
    const { status, body } = await readJson(await post(VALID_ID, ANON_UID));
    expect(status).toBe(403);
    expect(body.error).toMatch(/not your challenge/i);
  });

  it("403 when responder uid is supplied (only creator gets the dashboard)", async () => {
    seedChallenge();
    const { status, body } = await readJson(await post(VALID_ID, RESPONDER_UID));
    expect(status).toBe(403);
    expect(body.error).toMatch(/not your challenge/i);
  });
});

describe("POST /api/challenge/[id]/results — creator dashboard (anon uid path)", () => {
  it("200 with creator view for the matching uid", async () => {
    seedChallenge();
    const { status, body } = await readJson(await post(VALID_ID, CREATOR_UID));
    expect(status).toBe(200);
    expect(body.id).toBe(VALID_ID);
    const b = body as Record<string, unknown>;
    expect(b.creator).toBeDefined();
    expect((b.creator as Record<string, unknown>).name).toBe("Alice");
    expect((b.creator as Record<string, unknown>).wins).toBe(55);
  });

  it("view includes total and responders array", async () => {
    seedChallenge();
    const { body } = await readJson(await post(VALID_ID, CREATOR_UID));
    const b = body as Record<string, unknown>;
    expect(b.total).toBe(2);
    expect(Array.isArray(b.responders)).toBe(true);
    expect((b.responders as unknown[]).length).toBe(1);
  });

  it("responder entry has outcome, winsMargin, and netMargin", async () => {
    seedChallenge();
    const { body } = await readJson(await post(VALID_ID, CREATOR_UID));
    const responders = (body as Record<string, unknown>).responders as Record<string, unknown>[];
    const first = responders[0];
    expect(first.outcome).toBeDefined();
    expect(typeof first.winsMargin).toBe("number");
    expect(typeof first.netMargin).toBe("number");
  });

  it("creator row does NOT appear in the responders array", async () => {
    seedChallenge();
    const { body } = await readJson(await post(VALID_ID, CREATOR_UID));
    const responders = (body as Record<string, unknown>).responders as Record<string, unknown>[];
    const names = responders.map((r) => r.name);
    expect(names).not.toContain("Alice");
  });
});

describe("POST /api/challenge/[id]/results — authed session identity", () => {
  it("session uid takes precedence over the uid in the body", async () => {
    seedChallenge();
    await signIn({ uid: CREATOR_UID, name: "Alice" });
    // Supplying a bad uid in body should be irrelevant — session wins
    const { status, body } = await readJson(await post(VALID_ID, ANON_UID));
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).id).toBe(VALID_ID);
  });

  it("signed-in non-creator gets 403 even with a valid uid in body", async () => {
    seedChallenge();
    await signIn({ uid: "some-other-user-xyz", name: "Nobody" });
    const { status } = await readJson(await post(VALID_ID, CREATOR_UID));
    // Session uid = some-other-user-xyz !== CREATOR_UID => 403
    expect(status).toBe(403);
  });
});

describe("POST /api/challenge/[id]/results — rate limit", () => {
  it("429 when bucket is exhausted", async () => {
    exhaustRateLimit(`rl:chalown:9.9.9.9`, 120);
    seedChallenge();
    const { status } = await readJson(await post(VALID_ID, CREATOR_UID, "9.9.9.9"));
    expect(status).toBe(429);
  });

  it("different IPs are bucketed independently", async () => {
    exhaustRateLimit(`rl:chalown:1.2.3.4`, 120);
    seedChallenge();
    const { status } = await readJson(await post(VALID_ID, CREATOR_UID, "5.6.7.8"));
    expect(status).toBe(200);
  });
});

describe("POST /api/challenge/[id]/results — board with zero responders", () => {
  it("responders array is empty when only the creator submitted", async () => {
    const info = {
      uid: CREATOR_UID,
      name: "Alice",
      wins: 55,
      losses: 27,
      net: 7.5,
      grade: "B+",
      lineup: "p0pg,p1sg,p2sf,p3pf,p4c",
      seed: `h2h-${VALID_ID}`,
      hinted: false,
    };
    const creatorRow = { uid: CREATOR_UID, name: "Alice", wins: 55, losses: 27, net: 7.5, lineup: "p0pg,p1sg,p2sf,p3pf,p4c" };
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(info));
    ctx.redis!.zsets.set(`chal:${VALID_ID}`, new Map([[CREATOR_UID, 55000 + 175]]));
    ctx.redis!.hashes.set(`chal:${VALID_ID}:meta`, new Map([[CREATOR_UID, JSON.stringify(creatorRow)]]));

    const { body } = await readJson(await post(VALID_ID, CREATOR_UID));
    const b = body as Record<string, unknown>;
    expect(b.total).toBe(1);
    expect((b.responders as unknown[]).length).toBe(0);
  });
});
