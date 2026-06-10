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
import type { BpRow } from "@/lib/blueprint";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
authEnv();

const { GET } = await import("@/app/api/blueprint/leaderboard/route");

const DATE = "2026-6-10";

const get = (qs: string, ip = "9.9.9.9") => GET(req(`/api/blueprint/leaderboard?${qs}`, { ip }));

// Helper: seed a bp board directly without going through the submit route.
function seedBpBoard(
  date: string,
  bp: string,
  entries: { uid: string; name: string; wins: number; net: number; grade?: string; score?: number; lineup?: string }[],
) {
  const keyZ = `lb:bp:${date}:${bp}`;
  const keyH = `lb:bp:${date}:${bp}:meta`;
  const z = new Map<string, number>();
  const h = new Map<string, string>();
  for (const e of entries) {
    // encBpScore(wins, mult=1.0 for F, net): Math.round(wins * 1.0 * 100) * 1000 + clamp(net+100, 0, 999)
    const sortScore = Math.round(e.wins * 100) * 1000 + Math.max(0, Math.min(999, e.net + 100));
    z.set(e.uid, sortScore);
    const row: BpRow = {
      uid: e.uid,
      name: e.name,
      wins: e.wins,
      losses: 82 - e.wins,
      net: e.net,
      lineup: e.lineup ?? "p0,p1,p2,p3,p4",
      bp: bp as BpRow["bp"],
      grade: e.grade ?? "F",
      score: e.score ?? e.wins,
    };
    h.set(e.uid, JSON.stringify(row));
  }
  ctx.redis!.zsets.set(keyZ, z);
  ctx.redis!.hashes.set(keyH, h);
}

beforeEach(() => { freshFake(); });

// ---- Guard rails / validation ----
describe("GET /api/blueprint/leaderboard — guard rails", () => {
  it("returns 400 when date is missing", async () => {
    const { status } = await readJson(await get("bp=balanced"));
    expect(status).toBe(400);
  });

  it("returns 400 for a malformed date", async () => {
    const { status } = await readJson(await get("date=not-a-date&bp=balanced"));
    expect(status).toBe(400);
  });

  it("returns 400 for an unknown blueprint key", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}&bp=unknown`));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad blueprint/i);
  });

  it("returns 400 for a malformed uid", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}&bp=balanced&uid=bad uid!`));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });

  it("returns 400 for a uid that is too long", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}&bp=all&uid=${"a".repeat(65)}`));
    expect(status).toBe(400);
    expect(body.error).toMatch(/bad uid/i);
  });

  it("returns 429 after rate limit bucket is exhausted", async () => {
    exhaustRateLimit("rl:bpboard:5.5.5.5", 60);
    const { status } = await readJson(await get(`date=${DATE}&bp=balanced`, "5.5.5.5"));
    expect(status).toBe(429);
  });

  it("accepts a uid with uppercase letters (case-insensitive UID_RE)", async () => {
    const { status } = await readJson(await get(`date=${DATE}&bp=balanced&uid=ABCDEFGH`));
    expect(status).toBe(200);
  });

  it("defaults bp to 'all' when the bp param is absent", async () => {
    // The route defaults bpParam to "all" when the query param is missing.
    // "all" is a valid board key so it should return 200.
    const { status, body } = await readJson(await get(`date=${DATE}`));
    expect(status).toBe(200);
    expect(body.bp).toBe("all");
  });
});

// ---- Empty board ----
describe("GET /api/blueprint/leaderboard — empty board", () => {
  it("returns 200 with zero total and empty top for a date with no entries", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}&bp=balanced`));
    expect(status).toBe(200);
    expect(body.total).toBe(0);
    expect(Array.isArray(body.top)).toBe(true);
    expect((body.top as unknown[]).length).toBe(0);
    expect(body.you).toBeUndefined();
  });

  it("returns 200 for the combined 'all' board when no entries exist", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}&bp=all`));
    expect(status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.bp).toBe("all");
  });
});

// ---- Rows returned with correct ranks ----
describe("GET /api/blueprint/leaderboard — rows with ranks", () => {
  it("returns ranked rows in descending score order for a per-blueprint board", async () => {
    seedBpBoard(DATE, "balanced", [
      { uid: "uid-alice-12345678", name: "Alice", wins: 70, net: 12 },
      { uid: "uid-bob-123456789", name: "Bob",   wins: 60, net: 8  },
      { uid: "uid-carol-12345678", name: "Carol", wins: 50, net: 4  },
    ]);

    const { status, body } = await readJson(await get(`date=${DATE}&bp=balanced`));
    expect(status).toBe(200);
    expect(body.total).toBe(3);
    const top = body.top as Array<{ uid: string; rank: number }>;
    expect(top).toHaveLength(3);
    expect(top[0].uid).toBe("uid-alice-12345678");
    expect(top[0].rank).toBe(1);
    expect(top[1].uid).toBe("uid-bob-123456789");
    expect(top[1].rank).toBe(2);
    expect(top[2].uid).toBe("uid-carol-12345678");
    expect(top[2].rank).toBe(3);
  });

  it("returns ranked rows for the combined 'all' board", async () => {
    seedBpBoard(DATE, "all", [
      { uid: "uid-xray-123456789", name: "Xray", wins: 65, net: 10, bp: "spacing" } as never,
      { uid: "uid-yankee-12345678", name: "Yankee", wins: 55, net: 5, bp: "fortress" } as never,
    ]);

    const { status, body } = await readJson(await get(`date=${DATE}&bp=all`));
    expect(status).toBe(200);
    expect(body.total).toBe(2);
    const top = body.top as Array<{ uid: string; rank: number }>;
    expect(top[0].uid).toBe("uid-xray-123456789");
    expect(top[0].rank).toBe(1);
    expect(top[1].uid).toBe("uid-yankee-12345678");
    expect(top[1].rank).toBe(2);
  });

  it("date param is echoed back in the response", async () => {
    const { body } = await readJson(await get(`date=${DATE}&bp=balanced`));
    expect(body.date).toBe(DATE);
  });

  it("bp param is echoed back in the response", async () => {
    const { body } = await readJson(await get(`date=${DATE}&bp=rim`));
    expect(body.bp).toBe("rim");
  });
});

// ---- 'you' lookup ----
describe("GET /api/blueprint/leaderboard — you lookup", () => {
  it("returns you in the top window when the uid appears in the top 100", async () => {
    seedBpBoard(DATE, "discipline", [
      { uid: "uid-target-12345678", name: "Target", wins: 60, net: 5 },
      { uid: "uid-other-123456789", name: "Other",  wins: 50, net: 3 },
    ]);

    const { status, body } = await readJson(await get(`date=${DATE}&bp=discipline&uid=uid-target-12345678`));
    expect(status).toBe(200);
    const you = body.you as Record<string, unknown> | undefined;
    expect(you).toBeDefined();
    expect(you!.uid).toBe("uid-target-12345678");
    expect(you!.rank).toBe(1);
  });

  it("returns you=undefined when the uid is not on the board", async () => {
    const { status, body } = await readJson(await get(`date=${DATE}&bp=balanced&uid=notpresent01`));
    expect(status).toBe(200);
    expect(body.you).toBeUndefined();
  });

  it("returns 200 with no you when uid param is absent", async () => {
    seedBpBoard(DATE, "balanced", [{ uid: "uid-alice-12345678", name: "Alice", wins: 55, net: 5 }]);
    const { status, body } = await readJson(await get(`date=${DATE}&bp=balanced`));
    expect(status).toBe(200);
    expect(body.you).toBeUndefined();
  });

  it("returns you with correct rank when uid is beyond top 100", async () => {
    // Seed 101 entries on the spacing board; last uid gets rank 101
    const entries: { uid: string; name: string; wins: number; net: number }[] = [];
    for (let i = 1; i <= 100; i++) {
      entries.push({ uid: `topuser${String(i).padStart(3, "0")}-bp`, name: `U${i}`, wins: 100 + i, net: i });
    }
    const last = "lastplaceid0001";
    entries.push({ uid: last, wins: 5, net: -5, name: "Last" });
    seedBpBoard(DATE, "spacing", entries);

    const { status, body } = await readJson(await get(`date=${DATE}&bp=spacing&uid=${last}`));
    expect(status).toBe(200);
    expect(body.total).toBe(101);
    expect((body.top as unknown[]).length).toBe(100);
    const you = body.you as Record<string, unknown> | undefined;
    expect(you).toBeDefined();
    expect(you!.uid).toBe(last);
    expect(you!.rank).toBe(101);
  });
});

// ---- Each valid blueprint key accepted ----
describe("GET /api/blueprint/leaderboard — valid blueprint keys", () => {
  for (const bp of ["spacing", "fortress", "discipline", "rim", "balanced", "all"]) {
    it(`accepts bp=${bp}`, async () => {
      const { status } = await readJson(await get(`date=${DATE}&bp=${bp}`));
      expect(status).toBe(200);
    });
  }
});

// ---- Dates are independent ----
describe("GET /api/blueprint/leaderboard — different dates are independent", () => {
  it("returns data only for the requested date", async () => {
    seedBpBoard("2026-6-9",  "balanced", [{ uid: "uid-yesterday-1234", name: "Yesterday", wins: 60, net: 5 }]);
    seedBpBoard("2026-6-10", "balanced", [{ uid: "uid-today-12345678", name: "Today",     wins: 65, net: 6 }]);

    const { body: body9  } = await readJson(await get("date=2026-6-9&bp=balanced"));
    const { body: body10 } = await readJson(await get("date=2026-6-10&bp=balanced"));

    expect((body9.top  as Array<{ uid: string }>)[0].uid).toBe("uid-yesterday-1234");
    expect((body10.top as Array<{ uid: string }>)[0].uid).toBe("uid-today-12345678");
  });
});

// ---- 503 gate ----
describe("GET /api/blueprint/leaderboard — disabled board", () => {
  it.todo(
    "returns 503 when isBpBoardEnabled() is false (Redis env absent at module import time) — cannot be exercised in this file without a full vi.resetModules() flow because the redis singleton is already bound at module eval",
  );
});
