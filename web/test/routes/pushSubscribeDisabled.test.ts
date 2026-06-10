import { describe, it, expect, vi } from "vitest";
import { disableRedisEnv, req, readJson } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// This file imports the subscribe route with VAPID env vars absent so isPushEnabled() returns
// false and the route immediately returns 503. A separate file is required because the route
// module is resolved once per worker process — if the same worker already imported it with VAPID
// vars present (as pushSubscribe.test.ts does), re-importing would return the cached module.
// Vitest isolates modules per file, so this file gets a fresh import graph with no VAPID env.

// Ensure VAPID vars are absent and Redis env is also absent before the import.
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.VAPID_SUBJECT;
disableRedisEnv();

const { POST } = await import("@/app/api/push/subscribe/route");

const validSub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/fake-device-token-1",
  keys: { p256dh: "BFakeP256DHKey1234567890abcdefghijklmnopqrstuvwxyz", auth: "FakeAuthKey123456" },
};

const post = (body: unknown, ip = "1.2.3.4") => POST(req("/api/push/subscribe", { body, ip }));

describe("POST /api/push/subscribe — push disabled (no VAPID env)", () => {
  it("returns 503 when VAPID env vars are absent", async () => {
    const { status, body } = await readJson(await post({ uid: "testuid-abc123", subscription: validSub }));
    expect(status).toBe(503);
    expect(body.error).toBe("push not configured");
  });

  it("returns 503 for any body shape — the guard fires before body parsing", async () => {
    const { status } = await readJson(await post({}));
    expect(status).toBe(503);
  });
});
