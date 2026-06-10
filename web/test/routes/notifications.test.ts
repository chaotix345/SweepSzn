import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enableRedisEnv,
  freshFake,
  ctx,
  req,
  readJson,
  signIn,
  exhaustRateLimit,
} from "@/test/routeHarness";
import type { Notif } from "@/lib/types";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { GET } = await import("@/app/api/notifications/route");

const UID = "abcdefgh-1234";

const makeNotif = (ts: number, id = "chal-1"): Notif => ({
  id: `${id}:${ts}:opponent`,
  type: "challenge_response",
  challengeId: id,
  opponent: "opponent",
  outcome: "beaten",
  tookLead: false,
  oppWins: 5,
  oppLosses: 3,
  yourWins: 4,
  yourLosses: 4,
  ts,
});

const get = (qs: string, ip = "9.9.9.9") => GET(req(`/api/notifications?${qs}`, { ip }));

beforeEach(() => { freshFake(); });

describe("GET /api/notifications — 503 without Redis", () => {
  it.todo(
    "returns 503 when notify is not enabled (no redis env) — cannot be covered: " +
    "lib/redis.ts evaluates the singleton at module load time; after enableRedisEnv() the " +
    "redis constant is always non-null in this worker. A separate vi.isolateModules test " +
    "that delays the import until after deleting the env vars would cover this path."
  );
});

describe("GET /api/notifications — uid fallback", () => {
  it("uses session uid when authenticated (ignores query uid)", async () => {
    await signIn({ uid: "session-uid-1234", name: "Alice" });
    // seed notifs for the session uid, nothing for the query uid
    await ctx.redis!.lpush("notif:session-uid-1234", makeNotif(1000));
    const { status, body } = await readJson(
      await GET(req("/api/notifications?uid=query-uid-abcd", { ip: "1.1.1.1" }))
    );
    expect(status).toBe(200);
    expect((body.items as Notif[]).length).toBe(1);
  });

  it("falls back to query uid when no session", async () => {
    await ctx.redis!.lpush(`notif:${UID}`, makeNotif(2000));
    const { status, body } = await readJson(await get(`uid=${UID}`));
    expect(status).toBe(200);
    expect((body.items as Notif[]).length).toBe(1);
  });

  it("returns 400 when no session and no valid uid", async () => {
    const { status, body } = await readJson(await get(""));
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: "bad uid" });
  });

  it("returns 400 when no session and uid fails UID_RE (too short)", async () => {
    const { status } = await readJson(await get("uid=short"));
    expect(status).toBe(400);
  });

  it("returns 400 when no session and uid fails UID_RE (invalid chars)", async () => {
    const { status } = await readJson(await get("uid=bad uid!!"));
    expect(status).toBe(400);
  });
});

describe("GET /api/notifications — list and unread count", () => {
  it("returns empty items and unread=0 for a fresh uid", async () => {
    const { status, body } = await readJson(await get(`uid=${UID}`));
    expect(status).toBe(200);
    expect(body).toStrictEqual({ items: [], unread: 0 });
  });

  it("returns all items newest-first with unread=count when no watermark", async () => {
    const n1 = makeNotif(1000);
    const n2 = makeNotif(2000);
    // lpush prepends, so push n1 first then n2 -> list is [n2, n1] (newest first)
    await ctx.redis!.lpush(`notif:${UID}`, n1);
    await ctx.redis!.lpush(`notif:${UID}`, n2);
    const { status, body } = await readJson(await get(`uid=${UID}`));
    expect(status).toBe(200);
    const items = body.items as Notif[];
    expect(items.length).toBe(2);
    expect(items[0].ts).toBe(2000);
    expect(items[1].ts).toBe(1000);
    expect(body.unread).toBe(2);
  });

  it("reflects unread count relative to read watermark", async () => {
    const n1 = makeNotif(1000);
    const n2 = makeNotif(2000);
    const n3 = makeNotif(3000);
    await ctx.redis!.lpush(`notif:${UID}`, n1);
    await ctx.redis!.lpush(`notif:${UID}`, n2);
    await ctx.redis!.lpush(`notif:${UID}`, n3);
    // watermark at ts=2000 -> only n3 (ts=3000) is unread
    await ctx.redis!.set(`notif:${UID}:read`, 2000);
    const { body } = await readJson(await get(`uid=${UID}`));
    expect(body.unread).toBe(1);
    expect((body.items as Notif[]).length).toBe(3);
  });

  it("unread=0 when all items are at or below the watermark", async () => {
    const n1 = makeNotif(1000);
    const n2 = makeNotif(2000);
    await ctx.redis!.lpush(`notif:${UID}`, n1);
    await ctx.redis!.lpush(`notif:${UID}`, n2);
    await ctx.redis!.set(`notif:${UID}:read`, 2000);
    const { body } = await readJson(await get(`uid=${UID}`));
    expect(body.unread).toBe(0);
  });
});

describe("GET /api/notifications — rate limit", () => {
  it("returns 429 when rate limit is exhausted", async () => {
    exhaustRateLimit("rl:notif:2.2.2.2", 120);
    const { status } = await readJson(await get(`uid=${UID}`, "2.2.2.2"));
    expect(status).toBe(429);
  });
});
