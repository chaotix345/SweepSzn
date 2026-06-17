import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enableRedisEnv,
  freshFake,
  ctx,
  req,
  readJson,
  exhaustRateLimit,
} from "@/test/routeHarness";
import type { ChallengeBoard } from "@/lib/types";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET } = await import("@/app/api/challenge/[id]/board/route");

const VALID_ID = "abc12345";

// Seed a challenge board the same way the engine would: a ranking zset + a per-uid meta hash whose
// rows still carry uid + lineup server-side (the route must strip both before responding).
function seedBoard() {
  const creatorRow = { uid: "creator-uid", name: "Alice", wins: 55, losses: 27, net: 7.5, lineup: "p0pg,p1sg,p2sf,p3pf,p4c" };
  const responderRow = { uid: "responder-uid", name: "Bob", wins: 48, losses: 34, net: 3.2, lineup: "q0pg,q1sg,q2sf,q3pf,q4c" };
  ctx.redis!.zsets.set(`chal:${VALID_ID}`, new Map([["creator-uid", 55175], ["responder-uid", 48132]]));
  ctx.redis!.hashes.set(`chal:${VALID_ID}:meta`, new Map([
    ["creator-uid", JSON.stringify(creatorRow)],
    ["responder-uid", JSON.stringify(responderRow)],
  ]));
}

const get = (id: string, ip = "8.8.8.8") =>
  GET(req(`/api/challenge/${id}/board`, { ip }), { params: Promise.resolve({ id }) });

beforeEach(() => { freshFake(); });

describe("GET /api/challenge/[id]/board — disabled", () => {
  it.todo("503 when Redis is unavailable — isChallengeEnabled() reads the import-time redis const");
});

describe("GET /api/challenge/[id]/board — id validation", () => {
  it("rejects a malformed id", async () => {
    expect((await readJson(await get("abc"))).status).toBe(400);
  });
});

describe("GET /api/challenge/[id]/board — rate limit", () => {
  it("429 when the per-ip bucket is exhausted", async () => {
    exhaustRateLimit(`rl:chalboard:1.2.3.4`, 120);
    expect((await readJson(await get(VALID_ID, "1.2.3.4"))).status).toBe(429);
  });
});

describe("GET /api/challenge/[id]/board — board read", () => {
  it("returns an empty board for an unknown challenge", async () => {
    const { status, body } = await readJson(await get(VALID_ID));
    expect(status).toBe(200);
    expect(body).toEqual({ total: 0, top: [] });
  });

  it("returns ranked records stripped of every uid and lineup", async () => {
    seedBoard();
    const { status, body } = await readJson(await get(VALID_ID));
    const b = body as unknown as ChallengeBoard;
    expect(status).toBe(200);
    expect(b.total).toBe(2);
    expect(b.top).toHaveLength(2);
    expect(b.top[0]).toEqual({ rank: 1, name: "Alice", wins: 55, losses: 27, net: 7.5 });
    expect(b.top[1].name).toBe("Bob");
    // security: the spectator board must never leak the identity token or anyone's five
    const json = JSON.stringify(body);
    expect(json).not.toContain("uid");
    expect(json).not.toContain("lineup");
    expect(json).not.toContain("creator-uid");
  });
});

describe("GET /api/challenge/[id]/board — CDN cache", () => {
  it("sets the public board cache header on a successful read (absorbs spectator polls)", async () => {
    const res = await get(VALID_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=10, stale-while-revalidate=30");
  });

  it("does NOT set a cache header on a 400 (error responses are never CDN-cached)", async () => {
    const res = await get("abc");
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBeNull();
  });
});
