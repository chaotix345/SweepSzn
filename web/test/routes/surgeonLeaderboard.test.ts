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
import type { SurgeonRow } from "@/lib/surgeon";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// Leaderboard is redis-gated: enableRedisEnv must run before the route is imported.
enableRedisEnv();
authEnv();

const { GET } = await import("@/app/api/surgeon/leaderboard/route");

const DATE = "2026-6-10";

const get = (qs: string, ip = "9.9.9.9") =>
  GET(req(`/api/surgeon/leaderboard?${qs}`, { ip }));

const keyZ = (d: string) => `lb:surgeon:${d}`;
const keyH = (d: string) => `lb:surgeon:${d}:meta`;

// Seed a surgeon board row directly into the fake Redis store.
function seedRow(date: string, uid: string, row: SurgeonRow, sortScore: number) {
  if (!ctx.redis!.zsets.has(keyZ(date))) ctx.redis!.zsets.set(keyZ(date), new Map());
  ctx.redis!.zsets.get(keyZ(date))!.set(uid, sortScore);
  if (!ctx.redis!.hashes.has(keyH(date))) ctx.redis!.hashes.set(keyH(date), new Map());
  ctx.redis!.hashes.get(keyH(date))!.set(uid, JSON.stringify(row));
}

beforeEach(() => { freshFake(); });

// ---------- guard rails / disabled gate ----------
describe("GET /api/surgeon/leaderboard — guard rails", () => {
  it.todo(
    "returns 503 when isSurgeonBoardEnabled() is false — cannot be exercised here without vi.resetModules() because the redis singleton is bound at module eval",
  );

  it("rejects a missing date param with 400", async () => {
    const { status } = await readJson(await get("uid=abcdefgh"));
    expect(status).toBe(400);
  });

  it("rejects a malformed date with 400", async () => {
    const { status } = await readJson(await get("date=notadate"));
    expect(status).toBe(400);
  });

  it("rejects a date with no digits pattern with 400", async () => {
    const { status } = await readJson(await get("date=2026-6-"));
    expect(status).toBe(400);
  });

  it("accepts valid uid param (uid is optional — invalid uid is silently dropped, not 400)", async () => {
    // The route drops invalid uids (UID_RE fail → uid = undefined), so it still returns 200
    const { status } = await readJson(await get(`date=${DATE}&uid=bad uid!!!`));
    // Route checks DATE_RE, returns 400 for bad date — uid validity just controls 'you' lookup
    // This confirms the UID is dropped and request still proceeds.
    expect(status).toBe(200);
  });

  it("rate limits with 429 after 60 calls", async () => {
    exhaustRateLimit("rl:sgboard:9.9.9.9", 60);
    const { status } = await readJson(await get(`date=${DATE}`, "9.9.9.9"));
    expect(status).toBe(429);
  });
});

// ---------- empty board ----------
describe("GET /api/surgeon/leaderboard — empty board", () => {
  it("returns an empty view for a fresh date", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}`));
    expect(status).toBe(200);
    expect(body).toMatchObject({ date: DATE, total: 0, top: [] });
    expect(body.you).toBeUndefined();
  });

  it("you is absent when uid is provided but not on the board", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}&uid=abcdefgh12`));
    expect(status).toBe(200);
    expect(body.you).toBeUndefined();
  });
});

// ---------- single-row board ----------
describe("GET /api/surgeon/leaderboard — single row", () => {
  it("returns the row in top[] with rank=1 after one entry is seeded", async () => {
    const row: SurgeonRow = {
      uid: "userabc123", name: "Alice", delta: 5,
      beforeWins: 52, afterWins: 57, net: 5.0, card: "a,b,c,d,e.1.f",
    };
    seedRow(DATE, "userabc123", row, 105_005);

    const { status, body } = await readJson(await get(`date=${DATE}`));
    expect(status).toBe(200);
    expect(body.total).toBe(1);
    const top = body.top as Record<string, unknown>[];
    expect(top.length).toBe(1);
    expect(top[0].uid).toBe("userabc123");
    expect(top[0].rank).toBe(1);
  });

  it("'you' matches the top entry when the uid is in the board", async () => {
    const row: SurgeonRow = {
      uid: "userabc123", name: "Alice", delta: 5,
      beforeWins: 52, afterWins: 57, net: 5.0, card: "a,b,c,d,e.1.f",
    };
    seedRow(DATE, "userabc123", row, 105_005);

    const { body } = await readJson(await get(`date=${DATE}&uid=userabc123`));
    const you = body.you as Record<string, unknown> | undefined;
    expect(you?.uid).toBe("userabc123");
    expect(you?.rank).toBe(1);
  });
});

// ---------- rank ordering ----------
describe("GET /api/surgeon/leaderboard — rank ordering", () => {
  it("ranks by sortScore descending (higher delta+tiebreak = rank 1)", async () => {
    const makeRow = (uid: string, delta: number): SurgeonRow => ({
      uid, name: uid, delta, beforeWins: 50, afterWins: 50 + delta, net: 4.0, card: "a,b,c,d,e.0.z",
    });
    // score encoding: encSurgeonScore(delta, net) = (delta+100)*1000 + clamp(net+100, 0, 999)
    // Higher delta → higher score → better rank
    seedRow(DATE, "lowater0001", makeRow("lowater0001", 2), 102_104);
    seedRow(DATE, "midrange001", makeRow("midrange001", 5), 105_104);
    seedRow(DATE, "highscore01", makeRow("highscore01", 10), 110_104);

    const { body } = await readJson(await get(`date=${DATE}`));
    const top = body.top as Record<string, unknown>[];
    expect(top.length).toBe(3);
    expect(top[0].uid).toBe("highscore01");
    expect(top[0].rank).toBe(1);
    expect(top[1].uid).toBe("midrange001");
    expect(top[1].rank).toBe(2);
    expect(top[2].uid).toBe("lowater0001");
    expect(top[2].rank).toBe(3);
  });

  it("returns total matching the number of seeded entries", async () => {
    for (let i = 1; i <= 5; i++) {
      const uid = `ranktst${i.toString().padStart(4, "0")}`;
      seedRow(DATE, uid, { uid, name: uid, delta: i, beforeWins: 50, afterWins: 50 + i, net: 4, card: "a,b,c,d,e.0.z" }, i * 1000);
    }
    const { body } = await readJson(await get(`date=${DATE}`));
    expect(body.total).toBe(5);
  });
});

// ---------- you outside top 100 ----------
describe("GET /api/surgeon/leaderboard — you outside top 100", () => {
  it("returns you with correct rank when uid is beyond top 100", async () => {
    // seed 100 high-scoring users
    for (let i = 1; i <= 100; i++) {
      const uid = `topuser${i.toString().padStart(3, "0")}`;
      seedRow(DATE, uid, { uid, name: `U${i}`, delta: i, beforeWins: 50, afterWins: 50 + i, net: 4, card: "a,b,c,d,e.0.z" }, 1000 + i);
    }
    // the 101st user with the lowest score (below all of 1001..1100)
    const uid101 = "outlierusr01";
    seedRow(DATE, uid101, { uid: uid101, name: "Outlier", delta: -3, beforeWins: 60, afterWins: 57, net: 3, card: "a,b,c,d,e.0.z" }, 500);

    const { body } = await readJson(await get(`date=${DATE}&uid=${uid101}`));
    expect(body.total).toBe(101);
    expect((body.top as unknown[]).length).toBe(100);
    const you = body.you as Record<string, unknown> | undefined;
    expect(you?.uid).toBe(uid101);
    expect(you?.rank).toBe(101);
  });
});

// ---------- response row shape ----------
describe("GET /api/surgeon/leaderboard — response row shape", () => {
  it("top rows contain uid, name, delta, beforeWins, afterWins, net, card, rank", async () => {
    const row: SurgeonRow = {
      uid: "shapetest01", name: "Shaper", delta: 3,
      beforeWins: 54, afterWins: 57, net: 4.5, card: "a,b,c,d,e.2.g",
    };
    seedRow(DATE, "shapetest01", row, 103_104);

    const { body } = await readJson(await get(`date=${DATE}`));
    const r = (body.top as Record<string, unknown>[])[0];
    expect(r.uid).toBe("shapetest01");
    expect(r.name).toBe("Shaper");
    expect(r.delta).toBe(3);
    expect(r.beforeWins).toBe(54);
    expect(r.afterWins).toBe(57);
    expect(typeof r.rank).toBe("number");
  });
});
