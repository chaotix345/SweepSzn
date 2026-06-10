import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enableRedisEnv,
  freshFake,
  ctx,
  req,
  readJson,
  exhaustRateLimit,
  authEnv,
} from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
authEnv();
const { GET } = await import("@/app/api/factorhunt/leaderboard/route");

const DATE = "2026-6-10";

const get = (qs: string, ip = "9.9.9.9") => GET(req(`/api/factorhunt/leaderboard?${qs}`, { ip }));

beforeEach(() => { freshFake(); });

describe("GET /api/factorhunt/leaderboard — guard rails", () => {
  it.todo(
    "returns 503 when isFhBoardEnabled() is false (Redis env absent at module import time) — cannot be exercised in this file without a full vi.resetModules() flow because the redis singleton is already bound at module eval",
  );

  it("rejects a missing date with 400", async () => {
    const { status } = await readJson(await get("uid=abcdefgh"));
    expect(status).toBe(400);
  });

  it("rejects a malformed date with 400", async () => {
    const { status } = await readJson(await get("date=not-a-date"));
    expect(status).toBe(400);
  });

  it("rejects an invalid uid with 400", async () => {
    const { status } = await readJson(await get(`date=${DATE}&uid=bad uid!`));
    expect(status).toBe(400);
  });

  it("rate limits with 429 after 60 calls", async () => {
    exhaustRateLimit(`rl:fhboard:9.9.9.9`, 60);
    const { status } = await readJson(await get(`date=${DATE}`, "9.9.9.9"));
    expect(status).toBe(429);
  });
});

describe("GET /api/factorhunt/leaderboard — response shape", () => {
  it("returns an empty board for a fresh date", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}`));
    expect(status).toBe(200);
    expect(body).toMatchObject({ date: DATE, total: 0, top: [] });
    expect(body.you).toBeUndefined();
  });

  it("returns a board with a row after one submit is seeded directly", async () => {
    const date = DATE;
    const keyZ = `lb:fh:${date}`;
    const keyH = `lb:fh:${date}:meta`;
    const row = {
      uid: "userabc123", name: "Alice", wins: 55, losses: 27, net: 3.5, lineup: "a,b,c,d,e",
      predicted: "Star offense", correct: true, score: 57.75,
    };
    ctx.redis!.zsets.set(keyZ, new Map([["userabc123", 57750 + 103]]));
    ctx.redis!.hashes.set(keyH, new Map([["userabc123", JSON.stringify(row)]]));

    const { status, body } = await readJson(await get(`date=${DATE}&uid=userabc123`));
    expect(status).toBe(200);
    expect(body.total).toBe(1);
    expect(Array.isArray(body.top)).toBe(true);
    expect((body.top as unknown[]).length).toBe(1);
    const top0 = (body.top as Record<string, unknown>[])[0];
    expect(top0.uid).toBe("userabc123");
    expect(top0.rank).toBe(1);
    // `you` should be the same entry (uid is in top-100)
    expect((body.you as Record<string, unknown> | undefined)?.uid).toBe("userabc123");
  });

  it("returns you outside top 100 with their rank", async () => {
    const date = DATE;
    const keyZ = `lb:fh:${date}`;
    const keyH = `lb:fh:${date}:meta`;
    // seed 101 users; uid "target_uid_x" is at rank 101
    for (let i = 1; i <= 100; i++) {
      const uid = `topuser${i.toString().padStart(3, "0")}`;
      if (!ctx.redis!.zsets.has(keyZ)) ctx.redis!.zsets.set(keyZ, new Map());
      ctx.redis!.zsets.get(keyZ)!.set(uid, 1000 + i);
      if (!ctx.redis!.hashes.has(keyH)) ctx.redis!.hashes.set(keyH, new Map());
      const r = { uid, name: `U${i}`, wins: i, losses: 0, net: 0, lineup: "a,b,c,d,e", predicted: null, correct: false, score: i };
      ctx.redis!.hashes.get(keyH)!.set(uid, JSON.stringify(r));
    }
    // the 101st user (lowest score = 500)
    const uid101 = "targetuidxx01";
    ctx.redis!.zsets.get(keyZ)!.set(uid101, 500);
    const r101 = { uid: uid101, name: "Outlier", wins: 5, losses: 77, net: -8, lineup: "a,b,c,d,e", predicted: null, correct: false, score: 5 };
    ctx.redis!.hashes.get(keyH)!.set(uid101, JSON.stringify(r101));

    const { status, body } = await readJson(await get(`date=${DATE}&uid=targetuidxx01`));
    expect(status).toBe(200);
    expect(body.total).toBe(101);
    // top should have 100 entries
    expect((body.top as unknown[]).length).toBe(100);
    // you should be present with rank 101
    const you = body.you as Record<string, unknown> | undefined;
    expect(you?.uid).toBe(uid101);
    expect(you?.rank).toBe(101);
  });

  it("omits you when the uid is not on the board", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}&uid=abcdefgh12`));
    expect(status).toBe(200);
    expect(body.you).toBeUndefined();
  });

  it("accepts a uid with uppercase letters (case-insensitive UID_RE)", async () => {
    const { status } = await readJson(await get(`date=${DATE}&uid=ABCDEFGH`));
    expect(status).toBe(200);
  });
});
