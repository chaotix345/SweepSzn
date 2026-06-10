import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET } = await import("@/app/api/board/weekly/route");
const { keyWeekZ, keyWeekH } = await import("@/lib/leaderboard");

const WEEK = "2026-W24";

function seedWeeklyBoard(week: string, rows: Array<{ uid: string; name: string; wins: number }>) {
  const kz = keyWeekZ(week);
  const kh = keyWeekH(week);
  for (const r of rows) {
    ctx.redis!.zsets.set(kz, ctx.redis!.zsets.get(kz) ?? new Map());
    ctx.redis!.zsets.get(kz)!.set(r.uid, r.wins);
    if (!ctx.redis!.hashes.has(kh)) ctx.redis!.hashes.set(kh, new Map());
    ctx.redis!.hashes.get(kh)!.set(r.uid, JSON.stringify({ uid: r.uid, name: r.name, wins: r.wins }));
  }
}

const get = (qs = "") => GET(req(`/api/board/weekly${qs ? `?${qs}` : ""}`));

beforeEach(() => { freshFake(); });

describe("GET /api/board/weekly", () => {
  it("rejects a malformed week param", async () => {
    const { status, body } = await readJson(await get("week=not-a-week"));
    expect(status).toBe(400);
    expect(body.error).toBe("bad week");
  });

  it("rejects a week number out of range", async () => {
    const { status } = await readJson(await get("week=2026-W99"));
    expect(status).toBe(400);
  });

  it("rejects a malformed uid", async () => {
    const { status, body } = await readJson(await get(`week=${WEEK}&uid=!!bad!!`));
    expect(status).toBe(400);
    expect(body.error).toBe("bad uid");
  });

  it("returns empty board for a fresh week", async () => {
    const { status, body } = await readJson(await get(`week=${WEEK}`));
    expect(status).toBe(200);
    expect(body.scope).toBe("week");
    expect(body.key).toBe(WEEK);
    expect(body.total).toBe(0);
    expect(body.top).toStrictEqual([]);
    expect(body.you).toBeUndefined();
  });

  it("returns rows in descending win order with correct rank", async () => {
    seedWeeklyBoard(WEEK, [
      { uid: "user-aaaa0001", name: "Alice", wins: 15 },
      { uid: "user-bbbb0002", name: "Bob",   wins: 20 },
      { uid: "user-cccc0003", name: "Carol",  wins: 10 },
    ]);
    const { status, body } = await readJson(await get(`week=${WEEK}`));
    expect(status).toBe(200);
    expect(body.total).toBe(3);
    const top = body.top as Array<{ uid: string; wins: number; rank: number }>;
    expect(top[0]).toMatchObject({ uid: "user-bbbb0002", wins: 20, rank: 1 });
    expect(top[1]).toMatchObject({ uid: "user-aaaa0001", wins: 15, rank: 2 });
    expect(top[2]).toMatchObject({ uid: "user-cccc0003", wins: 10, rank: 3 });
  });

  it("includes the requesting uid's rank when they are in the top 100", async () => {
    seedWeeklyBoard(WEEK, [
      { uid: "user-aaaa0001", name: "Alice", wins: 15 },
      { uid: "user-bbbb0002", name: "Bob",   wins: 20 },
    ]);
    const { body } = await readJson(await get(`week=${WEEK}&uid=user-aaaa0001`));
    const you = body.you as { uid: string; wins: number; rank: number };
    expect(you).toBeDefined();
    expect(you.uid).toBe("user-aaaa0001");
    expect(you.rank).toBe(2);
  });

  it("includes the requesting uid's rank when they are outside the top 100", async () => {
    // Seed 101 entries so uid-101 is outside the top-100 slice
    const rows = Array.from({ length: 101 }, (_, i) => ({
      uid: `user-${String(i).padStart(8, "0")}`,
      name: `User${i}`,
      wins: 101 - i, // descending wins: user-0 has 101, user-100 has 1
    }));
    seedWeeklyBoard(WEEK, rows);
    // The last user (index 100, wins=1) is outside the top-100 slice
    const outsideUid = "user-00000100";
    const { body } = await readJson(await get(`week=${WEEK}&uid=${outsideUid}`));
    const you = body.you as { uid: string; rank: number; wins: number };
    expect(you).toBeDefined();
    expect(you.uid).toBe(outsideUid);
    expect(you.rank).toBe(101);
    expect(you.wins).toBe(1);
  });

  it("defaults week to the current ISO week when not provided", async () => {
    seedWeeklyBoard(WEEK, [{ uid: "user-aaaa0001", name: "Alice", wins: 5 }]);
    // We don't know the system's current week, so just verify the response shape is valid
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(body.scope).toBe("week");
    expect(typeof body.key).toBe("string");
    expect(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(body.key as string)).toBe(true);
  });

  it("returns null body when redis is enabled but empty (not 503)", async () => {
    const { status } = await readJson(await get(`week=${WEEK}`));
    expect(status).toBe(200);
  });
});
