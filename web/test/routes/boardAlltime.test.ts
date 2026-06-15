import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, readJson, signIn } from "@/test/routeHarness";

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

const get = () => GET();

beforeEach(() => { freshFake(); });

describe("GET /api/board/alltime", () => {
  it("401 auth_required when signed out (board is now sign-in gated)", async () => {
    const { status, body } = await readJson(await get());
    expect(status).toBe(401);
    expect(body.error).toBe("auth_required");
  });

  it("private, no-store cache header on a gated response", async () => {
    await signIn({ uid: "user-aaaa0001", name: "Alice" });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns empty board for a fresh alltime key", async () => {
    await signIn({ uid: "user-aaaa0001", name: "Alice" });
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(body.scope).toBe("alltime");
    expect(body.key).toBe("alltime");
    expect(body.total).toBe(0);
    expect(body.top).toStrictEqual([]);
    expect(body.you).toBeUndefined();
  });

  it("returns rows in descending win order with correct rank", async () => {
    await signIn({ uid: "user-zzzz9999", name: "Zed" });
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

  it("highlights the signed-in user's rank when they are in the top 100", async () => {
    await signIn({ uid: "user-bbbb0002", name: "Bob" });
    seedAlltimeBoard([
      { uid: "user-aaaa0001", name: "Alice", wins: 100 },
      { uid: "user-bbbb0002", name: "Bob",   wins: 250 },
    ]);
    const { body } = await readJson(await get());
    const you = body.you as { uid: string; wins: number; rank: number };
    expect(you).toBeDefined();
    expect(you.uid).toBe("user-bbbb0002");
    expect(you.rank).toBe(1);
    expect(you.wins).toBe(250);
  });

  it("highlights the signed-in user's rank when they are outside the top 100", async () => {
    const outsideUid = "user-00000100";
    await signIn({ uid: outsideUid, name: "User100" });
    const rows = Array.from({ length: 101 }, (_, i) => ({
      uid: `user-${String(i).padStart(8, "0")}`,
      name: `User${i}`,
      wins: 101 - i,
    }));
    seedAlltimeBoard(rows);
    const { body } = await readJson(await get());
    const you = body.you as { uid: string; rank: number; wins: number };
    expect(you).toBeDefined();
    expect(you.uid).toBe(outsideUid);
    expect(you.rank).toBe(101);
    expect(you.wins).toBe(1);
  });

  it("omits you when the signed-in user is not on the board", async () => {
    await signIn({ uid: "user-notfound0000", name: "Ghost" });
    seedAlltimeBoard([{ uid: "user-aaaa0001", name: "Alice", wins: 50 }]);
    const { body } = await readJson(await get());
    expect(body.you).toBeUndefined();
  });
});
