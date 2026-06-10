import { describe, it, expect, vi } from "vitest";
import { disableRedisEnv, req, readJson } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// disableRedisEnv() runs BEFORE any route import so lib/redis evaluates with no env vars → redis = null.
// No enableRedisEnv() anywhere in this file.
disableRedisEnv();

// Dynamically import every route handler after the Redis env is cleared.
const { GET: dailyLeaderboardGET } = await import("@/app/api/daily/leaderboard/route");
const { POST: dailySubmitPOST } = await import("@/app/api/daily/submit/route");
const { GET: challengeGetGET } = await import("@/app/api/challenge/[id]/route");
const { POST: challengeSubmitPOST } = await import("@/app/api/challenge/submit/route");
const { POST: challengeResultsPOST } = await import("@/app/api/challenge/[id]/results/route");
const { POST: fhChoicesPOST } = await import("@/app/api/factorhunt/choices/route");
const { GET: fhLeaderboardGET } = await import("@/app/api/factorhunt/leaderboard/route");
const { POST: fhSubmitPOST } = await import("@/app/api/factorhunt/submit/route");
const { GET: pickemGET, POST: pickemPOST } = await import("@/app/api/pickem/route");
const { POST: pushSubscribePOST } = await import("@/app/api/push/subscribe/route");
const { POST: pushUnsubscribePOST } = await import("@/app/api/push/unsubscribe/route");
const { GET: notificationsGET } = await import("@/app/api/notifications/route");
const { POST: notificationsReadPOST } = await import("@/app/api/notifications/read/route");
const { GET: boardAlltimeGET } = await import("@/app/api/board/alltime/route");
const { GET: boardWeeklyGET } = await import("@/app/api/board/weekly/route");
const { POST: evPOST } = await import("@/app/api/ev/route");
const { POST: spinPOST } = await import("@/app/api/spin/route");
const { POST: evaluatePOST } = await import("@/app/api/evaluate/route");
const { POST: authGooglePOST } = await import("@/app/api/auth/google/route");
const { POST: authNoncePOST } = await import("@/app/api/auth/nonce/route");
const { GET: authMeGET } = await import("@/app/api/auth/me/route");
const { POST: authSignoutPOST } = await import("@/app/api/auth/signout/route");

// Helpers for dynamic-segment handlers (Next 16: params is a Promise).
const chalParams = (id: string) => ({ params: Promise.resolve({ id }) });
const goodChalId = "abc123";

describe("self-disable 503: redis-gated routes return 503 when Redis env is absent", () => {
  // ── daily ──────────────────────────────────────────────────────────────────

  it("GET /api/daily/leaderboard → 503", async () => {
    const { status, body } = await readJson(
      await dailyLeaderboardGET(req("/api/daily/leaderboard?date=2026-6-10")),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "leaderboard not configured" });
  });

  it("POST /api/daily/submit → 503", async () => {
    const { status, body } = await readJson(
      await dailySubmitPOST(req("/api/daily/submit", { body: {} })),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "leaderboard not configured" });
  });

  // ── challenge ──────────────────────────────────────────────────────────────

  it("GET /api/challenge/[id] → 503", async () => {
    const { status, body } = await readJson(
      await challengeGetGET(req(`/api/challenge/${goodChalId}`), chalParams(goodChalId)),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "challenges not configured" });
  });

  it("POST /api/challenge/submit → 503", async () => {
    const { status, body } = await readJson(
      await challengeSubmitPOST(req("/api/challenge/submit", { body: {} })),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "challenges not configured" });
  });

  it("POST /api/challenge/[id]/results → 503", async () => {
    const { status, body } = await readJson(
      await challengeResultsPOST(req(`/api/challenge/${goodChalId}/results`, { body: { uid: "testuid-abc123" } }), chalParams(goodChalId)),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "challenges not configured" });
  });

  // ── factorhunt/leaderboard and submit (redis-gated) ────────────────────────

  it("GET /api/factorhunt/leaderboard → 503", async () => {
    const { status, body } = await readJson(
      await fhLeaderboardGET(req("/api/factorhunt/leaderboard?date=2026-6-10")),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "leaderboard not configured" });
  });

  it("POST /api/factorhunt/submit → 503", async () => {
    const { status, body } = await readJson(
      await fhSubmitPOST(req("/api/factorhunt/submit", { body: {} })),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "leaderboard not configured" });
  });

  // ── pickem (checks `if (!redis)` directly) ────────────────────────────────

  it("GET /api/pickem → 503", async () => {
    const { status, body } = await readJson(
      await pickemGET(req("/api/pickem?seed=daily-2026-6-10")),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "pickem not configured" });
  });

  it("POST /api/pickem → 503", async () => {
    const { status, body } = await readJson(
      await pickemPOST(req("/api/pickem", { body: { seed: "daily-2026-6-10", vote: "y" } })),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "pickem not configured" });
  });

  // ── push/unsubscribe (isRedisEnabled gate) ────────────────────────────────

  it("POST /api/push/unsubscribe → 503", async () => {
    const { status, body } = await readJson(
      await pushUnsubscribePOST(req("/api/push/unsubscribe", { body: { uid: "testuid-abc123", endpoint: "https://fcm.googleapis.com/fake" } })),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "not configured" });
  });

  // ── notifications (isNotifyEnabled = isRedisEnabled) ─────────────────────

  it("GET /api/notifications → 503", async () => {
    const { status, body } = await readJson(
      await notificationsGET(req("/api/notifications?uid=testuid-abc123")),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "notifications not configured" });
  });

  it("POST /api/notifications/read → 503", async () => {
    const { status, body } = await readJson(
      await notificationsReadPOST(req("/api/notifications/read", { body: { uid: "testuid-abc123" } })),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "notifications not configured" });
  });

  // ── board (isLeaderboardEnabled) ──────────────────────────────────────────

  it("GET /api/board/alltime → 503", async () => {
    const { status, body } = await readJson(
      await boardAlltimeGET(req("/api/board/alltime")),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "leaderboard not configured" });
  });

  it("GET /api/board/weekly → 503", async () => {
    const { status, body } = await readJson(
      await boardWeeklyGET(req("/api/board/weekly")),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "leaderboard not configured" });
  });
});

// ── NOT redis-gated: these routes have no isRedisEnabled/503 gate ─────────────

describe("non-redis-gated routes: expected behavior without Redis env", () => {
  // factorhunt/choices uses rateLimit (fails open when redis is null) and proceeds to body
  // validation. Without a valid body it returns 400 — not 503. This route is NOT redis-gated.
  it("POST /api/factorhunt/choices → not redis-gated (returns 400 for missing body, not 503)", async () => {
    const { status } = await readJson(
      await fhChoicesPOST(req("/api/factorhunt/choices", { body: {} })),
    );
    // 400 (bad seed) proves the rate limit passed and execution continued past it
    expect(status).toBe(400);
    expect(status).not.toBe(503);
  });

  // spin uses rateLimit (fails open) and isFitLockedSeed (fails open). Not redis-gated.
  it("POST /api/spin → not redis-gated (returns 200 for a valid body, not 503)", async () => {
    const { status } = await readJson(
      await spinPOST(req("/api/spin", { body: { seed: "classic", round: 0 } })),
    );
    expect(status).toBe(200);
    expect(status).not.toBe(503);
  });

  // evaluate uses redis only inside after()/bump() which is a no-op when redis is null.
  // A valid 5-player body should succeed.
  it("POST /api/evaluate → not redis-gated (returns 400 for bad body, not 503)", async () => {
    const { status } = await readJson(
      await evaluatePOST(req("/api/evaluate", { body: { ids: [] } })),
    );
    expect(status).toBe(400);
    expect(status).not.toBe(503);
  });

  // ev always returns 204 and never leaks errors; redis is irrelevant.
  it("POST /api/ev → not redis-gated (always 204)", async () => {
    const res = await evPOST(req("/api/ev", { body: { ev: "play", mode: "daily", uid: "testuid-abc123" } }));
    expect(res.status).toBe(204);
  });

  // push/subscribe is gated on VAPID env vars (not Redis). Without VAPID it 503s.
  // This is intentionally NOT a redis-gate — documented here for clarity.
  it("POST /api/push/subscribe → 503 (VAPID gate, not Redis gate)", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    const { status, body } = await readJson(
      await pushSubscribePOST(req("/api/push/subscribe", { body: { uid: "testuid-abc123", subscription: {} } })),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "push not configured" });
  });

  // auth/google is gated on AUTH env vars (not Redis). Without AUTH_SECRET/client_id it 503s.
  it("POST /api/auth/google → 503 (auth gate, not Redis gate)", async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const { status, body } = await readJson(
      await authGooglePOST(req("/api/auth/google", {
        body: { credential: "fake" },
        headers: { "content-type": "application/json", "x-requested-with": "fetch" },
      })),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "auth not configured" });
  });

  // auth/nonce is gated on AUTH env vars (not Redis).
  it("POST /api/auth/nonce → 503 (auth gate, not Redis gate)", async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const { status, body } = await readJson(
      await authNoncePOST(req("/api/auth/nonce", {
        method: "POST",
        body: {},
        headers: { "content-type": "application/json", "x-requested-with": "fetch" },
      })),
    );
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "auth not configured" });
  });

  // auth/me has no gate — it just reads the session cookie (or returns null). Not redis-gated.
  it("GET /api/auth/me → not gated (returns 200 with user:null when no session)", async () => {
    const { status, body } = await readJson(await authMeGET());
    expect(status).toBe(200);
    expect(body).toMatchObject({ user: null });
  });

  // auth/signout has no redis gate — it clears the session cookie. CSRF header still required.
  it("POST /api/auth/signout → not gated (200 with CSRF header)", async () => {
    const { status, body } = await readJson(
      await authSignoutPOST(req("/api/auth/signout", { method: "POST", headers: { "x-requested-with": "fetch" } })),
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true });
  });
});
