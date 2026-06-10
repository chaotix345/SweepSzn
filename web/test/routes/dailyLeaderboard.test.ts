import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enableRedisEnv,
  freshFake,
  ctx,
  req,
  readJson,
  authEnv,
} from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
authEnv();

const { GET } = await import("@/app/api/daily/leaderboard/route");

const get = (qs: string) => GET(req(`/api/daily/leaderboard?${qs}`));

// Helper: seed the fake directly so we can control the board without going through submit.
function seedBoard(date: string, entries: { uid: string; name: string; wins: number; net: number }[]) {
  const keyZ = `lb:${date}`;
  const keyH = `lb:${date}:meta`;
  const z = new Map<string, number>();
  const h = new Map<string, string>();
  for (const e of entries) {
    const score = e.wins * 1000 + Math.max(0, Math.min(999, e.net + 100));
    z.set(e.uid, score);
    h.set(e.uid, JSON.stringify({ uid: e.uid, name: e.name, wins: e.wins, losses: 82 - e.wins, net: e.net, lineup: "p0,p1,p2,p3,p4" }));
  }
  ctx.redis!.zsets.set(keyZ, z);
  ctx.redis!.hashes.set(keyH, h);
}

const DATE = "2026-6-10";

beforeEach(() => {
  freshFake();
});

describe("GET /api/daily/leaderboard — bad date", () => {
  it("returns 400 when date is missing", async () => {
    const { status } = await readJson(await get(""));
    expect(status).toBe(400);
  });

  it("returns 400 for a non-date string", async () => {
    const { status } = await readJson(await get("date=evil%3Cscript%3E"));
    expect(status).toBe(400);
  });

  it("returns 400 for a date missing the day component", async () => {
    const { status } = await readJson(await get("date=2026-06"));
    expect(status).toBe(400);
  });

  it("returns 400 for a uid that is too long / invalid", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}&uid=${"x".repeat(65)}`));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });
});

describe("GET /api/daily/leaderboard — 503 guard", () => {
  // isLeaderboardEnabled() === true because enableRedisEnv() set vars; 503 is not reachable here.
  it("returns 200 (not 503) when Redis env is set", async () => {
    seedBoard(DATE, [{ uid: "uid-aaa-12345678", name: "Alice", wins: 55, net: 7 }]);
    const { status } = await readJson(await get(`date=${DATE}`));
    expect(status).toBe(200);
  });
});

describe("GET /api/daily/leaderboard — empty board", () => {
  it("returns 200 with an empty top array and zero total for a date with no entries", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}`));
    expect(status).toBe(200);
    expect(body).toHaveProperty("total", 0);
    expect(Array.isArray(body.top)).toBe(true);
    expect((body.top as unknown[]).length).toBe(0);
  });
});

describe("GET /api/daily/leaderboard — seeded board", () => {
  const ENTRIES = [
    { uid: "uid-alice-12345678", name: "Alice", wins: 70, net: 12 },
    { uid: "uid-bob-123456789", name: "Bob", wins: 60, net: 8 },
    { uid: "uid-carol-12345678", name: "Carol", wins: 50, net: 4 },
  ];

  beforeEach(() => {
    seedBoard(DATE, ENTRIES);
  });

  it("returns 200 with correct total and ordered top rows", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}`));
    expect(status).toBe(200);
    expect(body.total).toBe(3);
    const top = body.top as Array<{ uid: string; rank: number }>;
    expect(top).toHaveLength(3);
    // sorted highest score first
    expect(top[0].uid).toBe("uid-alice-12345678");
    expect(top[0].rank).toBe(1);
    expect(top[1].uid).toBe("uid-bob-123456789");
    expect(top[1].rank).toBe(2);
    expect(top[2].uid).toBe("uid-carol-12345678");
    expect(top[2].rank).toBe(3);
  });

  it("returns the requesting uid's row in 'you' when they are in the top 100", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}&uid=uid-bob-123456789`));
    expect(status).toBe(200);
    const you = body.you as { uid: string; rank: number; wins: number } | undefined;
    expect(you).toBeDefined();
    expect(you!.uid).toBe("uid-bob-123456789");
    expect(you!.rank).toBe(2);
    expect(you!.wins).toBe(60);
  });

  it("returns 200 with you=undefined when uid is not on the board", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}&uid=uid-ghost-12345678`));
    expect(status).toBe(200);
    expect(body.you).toBeUndefined();
  });

  it("date param is forwarded correctly to the response", async () => {
    const { body } = await readJson(await get(`date=${DATE}`));
    expect(body.date).toBe(DATE);
  });
});

describe("GET /api/daily/leaderboard — uid outside top 100", () => {
  it("returns the uid's row with correct rank when uid is beyond position 100", async () => {
    // Seed 105 entries; the last one gets rank 105
    const many: { uid: string; name: string; wins: number; net: number }[] = [];
    for (let i = 0; i < 105; i++) {
      many.push({ uid: `uid-player${String(i).padStart(3, "0")}-12345`, name: `Player${i}`, wins: 105 - i, net: i });
    }
    seedBoard(DATE, many);
    const lastUid = "uid-player104-12345";

    const { status, body } = await readJson(await get(`date=${DATE}&uid=${lastUid}`));
    expect(status).toBe(200);
    const you = body.you as { uid: string; rank: number } | undefined;
    expect(you).toBeDefined();
    expect(you!.uid).toBe(lastUid);
    // rank should be 105 (1-based, last place)
    expect(you!.rank).toBe(105);
  });
});

describe("GET /api/daily/leaderboard — different dates are independent", () => {
  it("returns data only for the requested date", async () => {
    seedBoard("2026-6-9", [{ uid: "uid-yesterday-1234", name: "Yesterday", wins: 60, net: 5 }]);
    seedBoard("2026-6-10", [{ uid: "uid-today-12345678", name: "Today", wins: 65, net: 6 }]);

    const { body: body9 } = await readJson(await get("date=2026-6-9"));
    const { body: body10 } = await readJson(await get("date=2026-6-10"));

    expect((body9.top as Array<{ uid: string }>)[0].uid).toBe("uid-yesterday-1234");
    expect((body10.top as Array<{ uid: string }>)[0].uid).toBe("uid-today-12345678");
  });
});
