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

enableRedisEnv();
// push must be configured for the cron to operate (mirrors pushStore's isPushEnabled gate)
process.env.VAPID_PUBLIC_KEY = "test-public-key";
process.env.VAPID_PRIVATE_KEY = "test-private-key";
process.env.VAPID_SUBJECT = "mailto:test@example.com";
process.env.CRON_SECRET = "test-cron-secret";

// Freeze Date (only — timers stay real) so yesterday/today are deterministic across UTC midnight.
vi.useFakeTimers({ now: new Date("2026-06-15T21:00:00Z"), toFake: ["Date"] });

const { GET, NUDGE_CAP } = await import("@/app/api/cron/streak-saver/route");

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

beforeEach(() => { freshFake(); sendNotification.mockClear(); process.env.CRON_SECRET = "test-cron-secret"; });

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
});

describe("GET /api/cron/streak-saver — nudge selection", () => {
  it("nudges exactly the played-yesterday-not-today uids that have a subscription", async () => {
    seedZ(YESTERDAY, ["u1-aaaaaaaa", "u2-bbbbbbbb", "u3-cccccccc"]);
    seedZ(TODAY, ["u2-bbbbbbbb"]);          // u2 already played today — no nudge
    seedSub("u1-aaaaaaaa");                  // u1: candidate WITH a subscription
    // u3: candidate but never opted into push — claimed but not sent

    const { status, body } = await readJson(await run("Bearer test-cron-secret"));
    expect(status).toBe(200);
    expect(body).toMatchObject({ date: TODAY, candidates: 2, alreadyNudged: 0, sent: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload.title).toMatch(/streak/i);
    expect(payload.url).toBe("/play");
    // the claim set holds BOTH candidates (a re-run won't re-send to the sub-less one either)
    expect(ctx.redis!.sets.get(`streaknudge:${TODAY}`)?.size).toBe(2);
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
