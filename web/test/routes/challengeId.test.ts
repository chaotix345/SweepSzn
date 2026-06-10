import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enableRedisEnv,
  freshFake,
  authEnv,
  ctx,
  req,
  readJson,
  exhaustRateLimit,
} from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
authEnv();
const { GET } = await import("@/app/api/challenge/[id]/route");

const VALID_ID = "abc12345";

const mkInfo = (overrides: Record<string, unknown> = {}) => ({
  uid: "creator-uid-123",
  name: "Alice",
  wins: 55,
  losses: 27,
  net: 7.5,
  grade: "B+",
  lineup: "p0pg,p1sg,p2sf,p3pf,p4c",
  seed: `h2h-${VALID_ID}`,
  hinted: false,
  ...overrides,
});

const get = (id: string, ip = "9.9.9.9") =>
  GET(req(`/api/challenge/${id}`, { ip }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  freshFake();
});

describe("GET /api/challenge/[id] — disabled", () => {
  it.todo(
    "503 when Redis is unavailable — cannot test: isChallengeEnabled() reads the module-level redis " +
    "const fixed at import time; requires a separate worker with env stripped before import",
  );
});

describe("GET /api/challenge/[id] — validation", () => {
  it("400 on an id that is too short (< 6 chars)", async () => {
    const { status, body } = await readJson(await get("abc"));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad id/i);
  });

  it("400 on an id with illegal chars (uppercase letters)", async () => {
    const { status, body } = await readJson(await get("ABCDEFGH"));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad id/i);
  });

  it("400 on an id with illegal chars (hyphen)", async () => {
    const { status, body } = await readJson(await get("abc-1234"));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad id/i);
  });

  it("400 on an id that is too long (> 16 chars)", async () => {
    const { status, body } = await readJson(await get("a".repeat(17)));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad id/i);
  });
});

describe("GET /api/challenge/[id] — 404 / not found", () => {
  it("404 when challenge info key does not exist", async () => {
    const { status, body } = await readJson(await get(VALID_ID));
    expect(status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});

describe("GET /api/challenge/[id] — existing challenge", () => {
  it("200 with public challenge info when the key exists", async () => {
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(mkInfo()));
    // Add the creator to the zset (so responders count is accurate)
    ctx.redis!.zsets.set(`chal:${VALID_ID}`, new Map([["creator-uid-123", 55000 + 175]]));

    const { status, body } = await readJson(await get(VALID_ID));
    expect(status).toBe(200);
    expect(body.id).toBe(VALID_ID);
    expect(body.creatorName).toBe("Alice");
    expect(body.wins).toBe(55);
    expect(body.losses).toBe(27);
    expect(body.grade).toBe("B+");
    expect(body.seed).toBe(`h2h-${VALID_ID}`);
    expect(body.hinted).toBe(false);
  });

  it("responders count excludes the creator's own board slot", async () => {
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(mkInfo()));
    // Creator + 2 responders = 3 total board slots
    const z = new Map<string, number>([
      ["creator-uid-123", 55000 + 175],
      ["responder-uid-a", 50000 + 150],
      ["responder-uid-b", 45000 + 100],
    ]);
    ctx.redis!.zsets.set(`chal:${VALID_ID}`, z);

    const { body } = await readJson(await get(VALID_ID));
    // total = 3, but responders = 3 - 1 = 2
    expect(body.responders).toBe(2);
  });

  it("responders is 0 when only the creator has submitted (no friends yet)", async () => {
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(mkInfo()));
    ctx.redis!.zsets.set(`chal:${VALID_ID}`, new Map([["creator-uid-123", 55000 + 175]]));

    const { body } = await readJson(await get(VALID_ID));
    expect(body.responders).toBe(0);
  });

  it("hinted:true is reflected in the response", async () => {
    ctx.redis!.strings.set(
      `chal:${VALID_ID}:info`,
      JSON.stringify(mkInfo({ hinted: true })),
    );

    const { body } = await readJson(await get(VALID_ID));
    expect(body.hinted).toBe(true);
  });

  it("legacy challenge (no stored seed) falls back to h2h-<id>", async () => {
    // Legacy: info stored WITHOUT a seed field
    const legacyInfo = { ...mkInfo() };
    delete (legacyInfo as Record<string, unknown>).seed;
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(legacyInfo));

    const { body } = await readJson(await get(VALID_ID));
    expect(body.seed).toBe(`h2h-${VALID_ID}`);
  });

  it("response does NOT include uid, lineup, or raw name (public redaction)", async () => {
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(mkInfo()));

    const { body } = await readJson(await get(VALID_ID));
    // Private fields from ChallengeInfo that getChallengePublic explicitly omits
    expect(body.uid).toBeUndefined();
    expect(body.lineup).toBeUndefined();
    // The raw `name` field is projected to `creatorName` — `name` must not leak through
    expect(body.name).toBeUndefined();
    // Confirm the renamed field IS present under the public key
    expect(body.creatorName).toBe("Alice");
  });
});

describe("GET /api/challenge/[id] — rate limit", () => {
  it("429 when bucket is exhausted", async () => {
    exhaustRateLimit(`rl:chalget:9.9.9.9`, 120);
    // Populate info so the rate limit is the only thing blocking
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(mkInfo()));
    const { status } = await readJson(await get(VALID_ID, "9.9.9.9"));
    expect(status).toBe(429);
  });

  it("different IPs are bucketed independently", async () => {
    exhaustRateLimit(`rl:chalget:1.2.3.4`, 120);
    ctx.redis!.strings.set(`chal:${VALID_ID}:info`, JSON.stringify(mkInfo()));
    const { status } = await readJson(await get(VALID_ID, "5.6.7.8"));
    expect(status).toBe(200);
  });
});
