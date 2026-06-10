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
const { POST } = await import("@/app/api/notifications/read/route");

const UID = "abcdefgh-1234";

const makeNotif = (ts: number): Notif => ({
  id: `chal-1:${ts}:opp`,
  type: "challenge_response",
  challengeId: "chal-1",
  opponent: "opp",
  outcome: "beaten",
  tookLead: false,
  oppWins: 3,
  oppLosses: 1,
  yourWins: 2,
  yourLosses: 2,
  ts,
});

const post = (body: unknown, ip = "9.9.9.9") =>
  POST(req("/api/notifications/read", { body, ip }));

beforeEach(() => { freshFake(); });

describe("POST /api/notifications/read — 503 without Redis", () => {
  it.todo(
    "returns 503 when notify is not enabled — cannot be covered: " +
    "lib/redis.ts evaluates the singleton at module load time; after enableRedisEnv() the " +
    "redis constant is always non-null in this worker. A separate vi.isolateModules test " +
    "that delays the import until after deleting the env vars would cover this path."
  );
});

describe("POST /api/notifications/read — uid fallback", () => {
  it("uses session uid when authenticated (body uid ignored)", async () => {
    await signIn({ uid: "session-uid-1234", name: "Alice" });
    await ctx.redis!.lpush("notif:session-uid-1234", makeNotif(5000));
    const { status, body } = await readJson(
      await POST(req("/api/notifications/read", { body: { uid: "other-uid-abcd" }, ip: "1.1.1.1" }))
    );
    expect(status).toBe(200);
    expect(body).toHaveProperty("unread");
    // watermark should be set for the session uid, not the body uid
    expect(ctx.redis!.strings.has("notif:session-uid-1234:read")).toBe(true);
    expect(ctx.redis!.strings.has("notif:other-uid-abcd:read")).toBe(false);
  });

  it("falls back to body uid when no session", async () => {
    await ctx.redis!.lpush(`notif:${UID}`, makeNotif(3000));
    const { status, body } = await readJson(await post({ uid: UID }));
    expect(status).toBe(200);
    expect(body).toHaveProperty("unread");
  });

  it("returns 400 when no session and body uid is absent", async () => {
    const { status, body } = await readJson(await post({}));
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: "bad uid" });
  });

  it("returns 400 when no session and body uid fails UID_RE (too short)", async () => {
    const { status } = await readJson(await post({ uid: "short" }));
    expect(status).toBe(400);
  });

  it("returns 400 when no session and body uid has invalid chars", async () => {
    const { status } = await readJson(await post({ uid: "bad uid!!" }));
    expect(status).toBe(400);
  });

  it("returns 400 when body is not JSON", async () => {
    const { status } = await readJson(
      await POST(req("/api/notifications/read", { rawBody: "not json", method: "POST" }))
    );
    // non-JSON body -> body.uid is undefined -> 400
    expect(status).toBe(400);
  });
});

describe("POST /api/notifications/read — watermark behavior", () => {
  it("sets watermark to newest item ts and returns unread:0", async () => {
    const n1 = makeNotif(1000);
    const n2 = makeNotif(4000);
    await ctx.redis!.lpush(`notif:${UID}`, n1);
    await ctx.redis!.lpush(`notif:${UID}`, n2);

    const { status, body } = await readJson(await post({ uid: UID }));
    expect(status).toBe(200);
    expect(body).toStrictEqual({ unread: 0 });

    // watermark key should be set to the newest ts (4000)
    expect(ctx.redis!.strings.get(`notif:${UID}:read`)).toBe("4000");
    // watermark should carry a TTL
    expect(ctx.redis!.ttls.has(`notif:${UID}:read`)).toBe(true);
  });

  it("returns unread:0 on an empty inbox (no watermark set)", async () => {
    const { status, body } = await readJson(await post({ uid: UID }));
    expect(status).toBe(200);
    expect(body).toStrictEqual({ unread: 0 });
    // no notifs -> ts=0 -> no set call
    expect(ctx.redis!.strings.has(`notif:${UID}:read`)).toBe(false);
  });

  it("calling read twice is idempotent (watermark stays at newest ts)", async () => {
    await ctx.redis!.lpush(`notif:${UID}`, makeNotif(7000));

    await post({ uid: UID });
    await post({ uid: UID });

    expect(ctx.redis!.strings.get(`notif:${UID}:read`)).toBe("7000");
  });
});

describe("POST /api/notifications/read — rate limit", () => {
  it("returns 429 when rate limit is exhausted", async () => {
    exhaustRateLimit("rl:notifrd:3.3.3.3", 120);
    const { status } = await readJson(await post({ uid: UID }, "3.3.3.3"));
    expect(status).toBe(429);
  });
});
