import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import {
  enableRedisEnv,
  freshFake,
  ctx,
  req,
  readJson,
  exhaustRateLimit,
  signIn,
  authEnv,
} from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// VAPID env must be present for isPushEnabled() to return true.
// Set these before the dynamic import so pushStore module-level code sees them.
process.env.VAPID_PUBLIC_KEY = "BFakePublicKey1234567890abcdefghijklmnopqrstuvwxyz0123456789ABCDEF";
process.env.VAPID_PRIVATE_KEY = "FakePrivateKey1234567890abcdef12";
process.env.VAPID_SUBJECT = "mailto:test@example.com";

enableRedisEnv();
const { POST } = await import("@/app/api/push/subscribe/route");
const { PUSH_SUB_CAP } = await import("@/lib/pushStore");
const { TTL } = await import("@/lib/redis");

const UID = "testuid-abc123";

// A valid PushSubscription pointing at an allowed push host.
const validSub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/fake-device-token-1",
  keys: { p256dh: "BFakeP256DHKey1234567890abcdefghijklmnopqrstuvwxyz", auth: "FakeAuthKey123456" },
};

function hashField(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

const post = (body: unknown, ip = "1.2.3.4") => POST(req("/api/push/subscribe", { body, ip }));

beforeEach(() => { freshFake(); });

describe("POST /api/push/subscribe", () => {
  it.todo(
    "returns 503 when VAPID env is absent — tested in pushSubscribeDisabled.test.ts with a fresh dynamic import; cannot be done here because POST was already imported with VAPID env present and isPushEnabled() is called at request time using the module-level singleton that caches the configured state",
  );

  it("returns 400 for invalid subscription body — missing keys", async () => {
    const { status } = await readJson(await post({ uid: UID, subscription: { endpoint: "https://fcm.googleapis.com/fake" } }));
    expect(status).toBe(400);
  });

  it("returns 400 for subscription with a disallowed push host", async () => {
    const { status } = await readJson(await post({
      uid: UID,
      subscription: {
        endpoint: "https://evil.example.com/push/device",
        keys: { p256dh: "BFakeKey", auth: "FakeAuth" },
      },
    }));
    expect(status).toBe(400);
  });

  it("returns 400 for non-https endpoint in subscription", async () => {
    const { status } = await readJson(await post({
      uid: UID,
      subscription: {
        endpoint: "http://fcm.googleapis.com/fcm/send/device",
        keys: { p256dh: "BFakeP256DHKey", auth: "FakeAuthKey" },
      },
    }));
    expect(status).toBe(400);
  });

  it("returns 400 when session-less and uid is missing", async () => {
    const { status } = await readJson(await post({ subscription: validSub }));
    expect(status).toBe(400);
  });

  it("returns 400 when session-less and uid is invalid", async () => {
    const { status } = await readJson(await post({ uid: "bad uid!", subscription: validSub }));
    expect(status).toBe(400);
  });

  it("stores subscription in hash for a uid from body and returns ok:true", async () => {
    const { status, body } = await readJson(await post({ uid: UID, subscription: validSub }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const f = hashField(validSub.endpoint);
    expect(ctx.redis!.hashes.get(`push:${UID}`)?.has(f)).toBe(true);
  });

  it("sets a TTL on the push hash after storing", async () => {
    await post({ uid: UID, subscription: validSub });
    expect(ctx.redis!.ttls.get(`push:${UID}`)).toBe(TTL);
  });

  it("uses uid from session when authenticated (ignores body uid)", async () => {
    authEnv();
    await signIn({ uid: "session-uid-xyz", name: "Test User" });
    const { status, body } = await readJson(await post({ uid: "body-uid-ignored", subscription: validSub }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    // Session uid's hash should have the entry; body uid should not
    const f = hashField(validSub.endpoint);
    expect(ctx.redis!.hashes.get("push:session-uid-xyz")?.has(f)).toBe(true);
    expect(ctx.redis!.hashes.get("push:body-uid-ignored")).toBeUndefined();
  });

  it("allows re-storing an existing endpoint even when hash is at PUSH_SUB_CAP", async () => {
    // Pre-fill the hash to PUSH_SUB_CAP with distinct endpoints
    const h = new Map<string, string>();
    for (let i = 0; i < PUSH_SUB_CAP; i++) {
      const ep = `https://fcm.googleapis.com/fcm/send/device-${i}`;
      h.set(hashField(ep), JSON.stringify({ endpoint: ep, keys: { p256dh: "k1", auth: "k2" } }));
    }
    ctx.redis!.hashes.set(`push:${UID}`, h);

    // Re-storing one of the already-present endpoints should succeed (ok:true)
    const existingEndpoint = "https://fcm.googleapis.com/fcm/send/device-0";
    const reSub = { endpoint: existingEndpoint, keys: { p256dh: "newp256dh", auth: "newauth" } };
    const { status, body } = await readJson(await post({ uid: UID, subscription: reSub }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("rejects a NEW endpoint when hash is already at PUSH_SUB_CAP — returns 503", async () => {
    // Pre-fill to cap
    const h = new Map<string, string>();
    for (let i = 0; i < PUSH_SUB_CAP; i++) {
      const ep = `https://fcm.googleapis.com/fcm/send/device-${i}`;
      h.set(hashField(ep), JSON.stringify({ endpoint: ep, keys: { p256dh: "k1", auth: "k2" } }));
    }
    ctx.redis!.hashes.set(`push:${UID}`, h);

    // Brand-new endpoint should be rejected
    const newSub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/brand-new-device",
      keys: { p256dh: "BFakeP256DHKey1234567890abcdefghijklmnopqrstuvwxyz", auth: "FakeAuthKey123456" },
    };
    const { status, body } = await readJson(await post({ uid: UID, subscription: newSub }));
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
  });

  it("rate limits at 30 requests per IP", async () => {
    exhaustRateLimit("rl:pushsub:1.2.3.4", 30);
    const { status } = await readJson(await post({ uid: UID, subscription: validSub }, "1.2.3.4"));
    expect(status).toBe(429);
  });

  it("Mozilla autopush subdomain endpoint is valid", async () => {
    const mozSub = {
      endpoint: "https://updates.push.services.mozilla.com/push/v1/fake-token",
      keys: { p256dh: "BFakeP256DHKey1234567890abcdefghijklmnopqrstuvwxyz", auth: "FakeAuthKey123456" },
    };
    const { status, body } = await readJson(await post({ uid: UID, subscription: mozSub }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
