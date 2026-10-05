import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// web-push is stubbed so the cron's fan-out is observable without network.
const sendNotification = vi.fn<(sub: unknown, body: string) => Promise<{ statusCode: number }>>(
  async () => ({ statusCode: 201 }),
);
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (sub: unknown, body: string) => sendNotification(sub, body) },
}));
// observe that the bearer check goes through a constant-time compare (L10)
const timingSafeEqualSpy = vi.fn();
vi.mock("node:crypto", async (orig) => {
  const m = await orig<typeof import("node:crypto")>();
  return { ...m, timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => { timingSafeEqualSpy(); return m.timingSafeEqual(a, b); } };
});

enableRedisEnv();
// push must be configured for the cron to operate (mirrors pushStore's isPushEnabled gate)
process.env.VAPID_PUBLIC_KEY = "test-public-key";
process.env.VAPID_PRIVATE_KEY = "test-private-key";
process.env.VAPID_SUBJECT = "mailto:test@example.com";
process.env.CRON_SECRET = "test-cron-secret";

// Freeze Date (only — timers stay real) so yesterday/today are deterministic across UTC midnight.
vi.useFakeTimers({ now: new Date("2026-06-15T21:00:00Z"), toFake: ["Date"] });

const { GET, NUDGE_CAP } = await import("@/app/api/cron/streak-saver/route");
const { sendRawPushToUid } = await import("@/lib/pushStore");
const { TTL } = await import("@/lib/redis");

const YESTERDAY = "2026-6-14";
const TODAY = "2026-6-15";

const run = (auth?: string) =>
  GET(req("/api/cron/streak-saver", { headers: auth ? { authorization: auth } : {} }));

function seedZ(date: string, uids: string[]) {
  ctx.redis!.zsets.set(`lb:${date}`, new Map(uids.map((u, i) => [u, 60000 + i])));
}
function seedSub(uid: string) {
  ctx.redis!.hashes.set(`push:${uid}`, new Map([["f1", JSON.stringify({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "k", auth: "a" } })]]));
}

beforeEach(() => { freshFake(); sendNotification.mockClear(); timingSafeEqualSpy.mockClear(); process.env.CRON_SECRET = "test-cron-secret"; });

describe("GET /api/cron/streak-saver — gates", () => {
  it("503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const { status, body } = await readJson(await run());
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "cron not configured" });
  });

  it("401 without the Bearer secret (cron header missing or wrong)", async () => {
    expect((await readJson(await run())).status).toBe(401);
    expect((await readJson(await run("Bearer wrong"))).status).toBe(401);
  });

  it("401 on a wrong-length bearer (length mismatch short-circuits before the compare)", async () => {
    expect((await readJson(await run("Bearer test-cron-secret-but-longer"))).status).toBe(401);
    expect((await readJson(await run("test-cron-secret"))).status).toBe(401);
  });

  it("401 on a same-length wrong bearer, compared in constant time", async () => {
    const forged = "Bearer test-cron-secreT"; // same length as the real header, last char differs
    expect(forged.length).toBe("Bearer test-cron-secret".length);
    expect((await readJson(await run(forged))).status).toBe(401);
    expect(timingSafeEqualSpy).toHaveBeenCalled();
  });

  it("the correct bearer is accepted via the constant-time compare", async () => {
    expect((await readJson(await run("Bearer test-cron-secret"))).status).toBe(200);
    expect(timingSafeEqualSpy).toHaveBeenCalled();
  });
});

describe("GET /api/cron/streak-saver — nudge selection", () => {
  it("nudges exactly the played-yesterday-not-today uids that have a subscription", async () => {
    seedZ(YESTERDAY, ["u1-aaaaaaaa", "u2-bbbbbbbb", "u3-cccccccc"]);
    seedZ(TODAY, ["u2-bbbbbbbb"]);          // u2 already played today — no nudge
    seedSub("u1-aaaaaaaa");                  // u1: candidate WITH a subscription
    // u3: candidate but never opted into push — neither claimed nor sent

    const { status, body } = await readJson(await run("Bearer test-cron-secret"));
    expect(status).toBe(200);
    expect(body).toMatchObject({ date: TODAY, candidates: 2, alreadyNudged: 0, sent: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload.title).toMatch(/streak/i);
    expect(payload.url).toBe("/play");
    // only the SUBSCRIBED candidate is claimed — non-subscribers never consume the claim (or the cap)
    expect([...(ctx.redis!.sets.get(`streaknudge:${TODAY}`) ?? [])]).toEqual(["u1-aaaaaaaa"]);
    expect(ctx.redis!.ttls.has(`streaknudge:${TODAY}`)).toBe(true);
  });

  it("is idempotent: a second run claims nothing and sends nothing", async () => {
    seedZ(YESTERDAY, ["u1-aaaaaaaa"]);
    seedSub("u1-aaaaaaaa");
    await run("Bearer test-cron-secret");
    sendNotification.mockClear();

    const { status, body } = await readJson(await run("Bearer test-cron-secret"));
    expect(status).toBe(200);
    expect(body).toMatchObject({ candidates: 1, alreadyNudged: 1, sent: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("empty boards mean zero candidates and zero sends", async () => {
    const { status, body } = await readJson(await run("Bearer test-cron-secret"));
    expect(status).toBe(200);
    expect(body).toMatchObject({ candidates: 0, sent: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("exports a sane fan-out cap", () => {
    expect(NUDGE_CAP).toBeGreaterThan(0);
  });

  // Probe repro: claiming + capping ALL candidates let non-subscribers fill the cap, and the claim then
  // barred the lone real subscriber (index 599) from every later run.
  it("non-subscribers don't consume the cap: 600 candidates, only #599 subscribed -> sent 1", async () => {
    const uids = Array.from({ length: 600 }, (_, i) => `u${String(i).padStart(4, "0")}-aaaaaaaa`);
    seedZ(YESTERDAY, uids);
    seedSub(uids[599]);
    const { status, body } = await readJson(await run("Bearer test-cron-secret"));
    expect(status).toBe(200);
    expect(body).toMatchObject({ candidates: 600, sent: 1, capped: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(ctx.redis!.sets.get(`streaknudge:${TODAY}`)?.size).toBe(1);
  });

  it("caps the fan-out at NUDGE_CAP SUBSCRIBERS and leaves the overflow unclaimed", async () => {
    const uids = Array.from({ length: NUDGE_CAP + 5 }, (_, i) => `s${String(i).padStart(4, "0")}-aaaaaaaa`);
    seedZ(YESTERDAY, uids);
    for (const u of uids) seedSub(u);
    const { body } = await readJson(await run("Bearer test-cron-secret"));
    expect(body).toMatchObject({ candidates: NUDGE_CAP + 5, sent: NUDGE_CAP, capped: 5 });
    expect(ctx.redis!.sets.get(`streaknudge:${TODAY}`)?.size).toBe(NUDGE_CAP);
  });

  it("sends with bounded concurrency (never all at once, never strictly one-by-one)", async () => {
    const uids = Array.from({ length: 50 }, (_, i) => `c${String(i).padStart(4, "0")}-aaaaaaaa`);
    seedZ(YESTERDAY, uids);
    for (const u of uids) seedSub(u);
    let inFlight = 0, peak = 0;
    sendNotification.mockImplementation(async () => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return { statusCode: 201 };
    });
    try {
      const { body } = await readJson(await run("Bearer test-cron-secret"));
      expect(body).toMatchObject({ sent: 50 });
      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(20);
    } finally {
      sendNotification.mockImplementation(async () => ({ statusCode: 201 }));
    }
  });
});

describe("GET /api/cron/streak-saver — multi-mode union", () => {
  function seedBoard(key: string, uids: string[]) {
    ctx.redis!.zsets.set(key, new Map(uids.map((u, i) => [u, 60000 + i])));
  }

  it("nudges a player who played Factor Hunt yesterday but no mode today", async () => {
    seedBoard(`lb:fh:${YESTERDAY}`, ["fh1-aaaaaa01"]);
    seedSub("fh1-aaaaaa01");
    const { status, body } = await readJson(await run("Bearer test-cron-secret"));
    expect(status).toBe(200);
    expect(body).toMatchObject({ candidates: 1, sent: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("nudges a player who played Surgeon or Blueprint yesterday but no mode today", async () => {
    seedBoard(`lb:surgeon:${YESTERDAY}`, ["sg1-aaaaaa01"]);
    seedBoard(`lb:bp:${YESTERDAY}:all`, ["bp1-aaaaaa01"]);
    seedSub("sg1-aaaaaa01");
    seedSub("bp1-aaaaaa01");
    const { body } = await readJson(await run("Bearer test-cron-secret"));
    expect(body).toMatchObject({ candidates: 2, sent: 2 });
  });

  it("does NOT nudge a player who played a DIFFERENT mode today (today union across boards)", async () => {
    seedBoard(`lb:${YESTERDAY}`, ["x1-aaaaaa01"]);      // daily yesterday
    seedBoard(`lb:surgeon:${TODAY}`, ["x1-aaaaaa01"]);  // but played Surgeon today
    seedSub("x1-aaaaaa01");
    const { body } = await readJson(await run("Bearer test-cron-secret"));
    expect(body).toMatchObject({ candidates: 0, sent: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("counts a player on multiple yesterday boards only once", async () => {
    seedBoard(`lb:${YESTERDAY}`, ["y1-aaaaaa01"]);
    seedBoard(`lb:bp:${YESTERDAY}:all`, ["y1-aaaaaa01"]);
    seedSub("y1-aaaaaa01");
    const { body } = await readJson(await run("Bearer test-cron-secret"));
    expect(body).toMatchObject({ candidates: 1, sent: 1 });
  });
});

// push:<uid> carries a 31-day TTL set only at subscribe time; without a refresh on use, an active
// subscriber's devices silently vanished 31 days after opt-in.
describe("sendRawPushToUid — TTL refresh on a successful send", () => {
  const payload = { title: "t", body: "b", url: "/play" };

  it("resets the push:<uid> TTL to the full TTL after a delivered send", async () => {
    seedSub("ttl-user-0001");
    ctx.redis!.ttls.set("push:ttl-user-0001", 5); // about to expire
    expect(await sendRawPushToUid("ttl-user-0001", payload)).toBe(true);
    expect(ctx.redis!.ttls.get("push:ttl-user-0001")).toBe(TTL);
  });

  it("does NOT refresh the TTL when no device accepted the push", async () => {
    seedSub("ttl-user-0002");
    ctx.redis!.ttls.set("push:ttl-user-0002", 5);
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("boom"), { statusCode: 500 }));
    await sendRawPushToUid("ttl-user-0002", payload);
    expect(ctx.redis!.ttls.get("push:ttl-user-0002")).toBe(5);
  });
});
