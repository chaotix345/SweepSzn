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
const { GET, POST } = await import("@/app/api/notifications/route");

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
// the anon read: uid in the POST body, never the URL (DESIGN.md §12)
const inbox = (uid: unknown, ip = "9.9.9.9") => POST(req("/api/notifications", { body: { uid }, ip }));

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

  it("falls back to the POST body uid when no session", async () => {
    await ctx.redis!.lpush(`notif:${UID}`, makeNotif(2000));
    const { status, body } = await readJson(await inbox(UID));
    expect(status).toBe(200);
    expect((body.items as Notif[]).length).toBe(1);
  });

  it("returns 400 when no session and no valid uid", async () => {
    const { status, body } = await readJson(await get(""));
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: "bad uid" });
  });

  it("returns 400 when no session and uid fails UID_RE (too short)", async () => {
    const { status } = await readJson(await inbox("short"));
    expect(status).toBe(400);
  });

  it("returns 400 when no session and uid fails UID_RE (invalid chars)", async () => {
    const { status } = await readJson(await inbox("bad uid!!"));
    expect(status).toBe(400);
  });
});

describe("GET /api/notifications — list and unread count", () => {
  it("returns empty items and unread=0 for a fresh uid", async () => {
    const { status, body } = await readJson(await inbox(UID));
    expect(status).toBe(200);
    expect(body).toStrictEqual({ items: [], unread: 0 });
  });

  it("returns all items newest-first with unread=count when no watermark", async () => {
    const n1 = makeNotif(1000);
    const n2 = makeNotif(2000);
    // lpush prepends, so push n1 first then n2 -> list is [n2, n1] (newest first)
    await ctx.redis!.lpush(`notif:${UID}`, n1);
    await ctx.redis!.lpush(`notif:${UID}`, n2);
    const { status, body } = await readJson(await inbox(UID));
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
    const { body } = await readJson(await inbox(UID));
    expect(body.unread).toBe(1);
    expect((body.items as Notif[]).length).toBe(3);
  });

  it("unread=0 when all items are at or below the watermark", async () => {
    const n1 = makeNotif(1000);
    const n2 = makeNotif(2000);
    await ctx.redis!.lpush(`notif:${UID}`, n1);
    await ctx.redis!.lpush(`notif:${UID}`, n2);
    await ctx.redis!.set(`notif:${UID}:read`, 2000);
    const { body } = await readJson(await inbox(UID));
    expect(body.unread).toBe(0);
  });
});

describe("GET /api/notifications — rate limit", () => {
  it("returns 429 when rate limit is exhausted", async () => {
    exhaustRateLimit("rl:notif:2.2.2.2", 120);
    const { status } = await readJson(await inbox(UID, "2.2.2.2"));
    expect(status).toBe(429);
  });
});

// H3: a cookie-less caller can't read a signed-in player's inbox by naming their g-uid.
describe("GET /api/notifications — Google-namespace uid on the anon path", () => {
  it("rejects a cookie-less read of a signed-in uid's inbox", async () => {
    const { authedUid } = await import("@/lib/auth");
    const victim = authedUid("123");
    await ctx.redis!.lpush(`notif:${victim}`, makeNotif(3000));
    const { status, body } = await readJson(await inbox(victim));
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: "bad uid" });
  });
});

// M2: the anon uid must never ride a URL (DESIGN.md §12 — it was polled every 45s into server logs).
// The anon inbox read is a POST with the uid in the body; GET serves only a session and ignores any
// uid query param.
describe("/api/notifications — the anon uid never rides a URL", () => {
  it("GET ignores a uid query param: no session → 400, never that uid's inbox", async () => {
    await ctx.redis!.lpush(`notif:${UID}`, makeNotif(2000));
    const { status, body } = await readJson(await get(`uid=${UID}`));
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: "bad uid" });
  });

  it("POST returns the body uid's inbox and is never cached", async () => {
    await ctx.redis!.lpush(`notif:${UID}`, makeNotif(2000));
    const res = await inbox(UID);
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect((body.items as Notif[]).length).toBe(1);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("POST prefers the session uid over the body uid", async () => {
    await signIn({ uid: "session-uid-1234", name: "Alice" });
    await ctx.redis!.lpush(`notif:${UID}`, makeNotif(2000));
    const { status, body } = await readJson(await inbox(UID));
    expect(status).toBe(200);
    expect((body.items as Notif[]).length).toBe(0);
  });

  it("POST shares the per-IP inbox bucket", async () => {
    exhaustRateLimit("rl:notif:3.3.3.3", 120);
    const { status } = await readJson(await inbox(UID, "3.3.3.3"));
    expect(status).toBe(429);
  });
});
