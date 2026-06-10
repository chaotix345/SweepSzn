import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET } = await import("@/app/api/board/alltime/route");
const { keyAlltimeZ, keyAlltimeH } = await import("@/lib/leaderboard");

function seedAlltimeBoard(rows: Array<{ uid: string; name: string; wins: number }>) {
  const kz = keyAlltimeZ();
  const kh = keyAlltimeH();
  for (const r of rows) {
    if (!ctx.redis!.zsets.has(kz)) ctx.redis!.zsets.set(kz, new Map());
    ctx.redis!.zsets.get(kz)!.set(r.uid, r.wins);
    if (!ctx.redis!.hashes.has(kh)) ctx.redis!.hashes.set(kh, new Map());
    ctx.redis!.hashes.get(kh)!.set(r.uid, JSON.stringify({ uid: r.uid, name: r.name, wins: r.wins }));
  }
}

const get = (qs = "") => GET(req(`/api/board/alltime${qs ? `?${qs}` : ""}`));

beforeEach(() => { freshFake(); });

describe("GET /api/board/alltime", () => {
  it("rejects a malformed uid", async () => {
    const { status, body } = await readJson(await get("uid=!!bad!!"));
    expect(status).toBe(400);
    expect(body.error).toBe("bad uid");
  });

  it("returns empty board for a fresh alltime key", async () => {
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(body.scope).toBe("alltime");
    expect(body.key).toBe("alltime");
    expect(body.total).toBe(0);
    expect(body.top).toStrictEqual([]);
    expect(body.you).toBeUndefined();
  });

  it("returns rows in descending win order with correct rank", async () => {
    seedAlltimeBoard([
      { uid: "user-aaaa0001", name: "Alice", wins: 100 },
      { uid: "user-bbbb0002", name: "Bob",   wins: 250 },
      { uid: "user-cccc0003", name: "Carol",  wins: 175 },
    ]);
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(body.total).toBe(3);
    const top = body.top as Array<{ uid: string; wins: number; rank: number }>;
    expect(top[0]).toMatchObject({ uid: "user-bbbb0002", wins: 250, rank: 1 });
    expect(top[1]).toMatchObject({ uid: "user-cccc0003", wins: 175, rank: 2 });
    expect(top[2]).toMatchObject({ uid: "user-aaaa0001", wins: 100, rank: 3 });
  });

  it("includes the requesting uid's rank when they are in the top 100", async () => {
    seedAlltimeBoard([
      { uid: "user-aaaa0001", name: "Alice", wins: 100 },
      { uid: "user-bbbb0002", name: "Bob",   wins: 250 },
    ]);
    const { body } = await readJson(await get("uid=user-bbbb0002"));
    const you = body.you as { uid: string; wins: number; rank: number };
    expect(you).toBeDefined();
    expect(you.uid).toBe("user-bbbb0002");
    expect(you.rank).toBe(1);
    expect(you.wins).toBe(250);
  });

  it("includes the requesting uid's rank when they are outside the top 100", async () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({
      uid: `user-${String(i).padStart(8, "0")}`,
      name: `User${i}`,
      wins: 101 - i,
    }));
    seedAlltimeBoard(rows);
    const outsideUid = "user-00000100";
    const { body } = await readJson(await get(`uid=${outsideUid}`));
    const you = body.you as { uid: string; rank: number; wins: number };
    expect(you).toBeDefined();
    expect(you.uid).toBe(outsideUid);
    expect(you.rank).toBe(101);
    expect(you.wins).toBe(1);
  });

  it("omits you when uid is absent", async () => {
    seedAlltimeBoard([{ uid: "user-aaaa0001", name: "Alice", wins: 50 }]);
    const { body } = await readJson(await get());
    expect(body.you).toBeUndefined();
  });

  it("omits you when uid is valid format but not on the board", async () => {
    seedAlltimeBoard([{ uid: "user-aaaa0001", name: "Alice", wins: 50 }]);
    const { body } = await readJson(await get("uid=user-notfound0000"));
    expect(body.you).toBeUndefined();
  });

  it("accepts uid at max length boundary (64 chars)", async () => {
    const longUid = "a".repeat(64);
    const { status } = await readJson(await get(`uid=${longUid}`));
    expect(status).toBe(200);
  });

  it("rejects uid that is too short (7 chars)", async () => {
    // 7 chars is below the 8-char minimum
    const res = await get("uid=sssssss");
    const result = await readJson(res);
    expect(result.status).toBe(400);
  });
});
