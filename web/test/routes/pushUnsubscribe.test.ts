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

enableRedisEnv();
const { POST } = await import("@/app/api/push/unsubscribe/route");

const UID = "testuid-abc123";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/fake-device-token-1";

function hashField(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

const post = (body: unknown, ip = "1.2.3.4") => POST(req("/api/push/unsubscribe", { body, ip }));

beforeEach(() => { freshFake(); });

describe("POST /api/push/unsubscribe", () => {
  it("returns 400 when session-less and uid is missing", async () => {
    const { status } = await readJson(await post({ endpoint: ENDPOINT }));
    expect(status).toBe(400);
  });

  it("returns 400 when session-less and uid is invalid", async () => {
    const { status } = await readJson(await post({ uid: "bad uid!!", endpoint: ENDPOINT }));
    expect(status).toBe(400);
  });

  it("returns 400 when endpoint is missing", async () => {
    const { status } = await readJson(await post({ uid: UID }));
    expect(status).toBe(400);
  });

  it("returns 400 when endpoint is not an https URL", async () => {
    const { status } = await readJson(await post({ uid: UID, endpoint: "http://fcm.googleapis.com/push" }));
    expect(status).toBe(400);
  });

  it("returns 400 when endpoint exceeds 1024 characters", async () => {
    const longEndpoint = "https://fcm.googleapis.com/" + "a".repeat(1000);
    const { status } = await readJson(await post({ uid: UID, endpoint: longEndpoint }));
    expect(status).toBe(400);
  });

  it("returns 400 for non-JSON body", async () => {
    const raw = await POST(req("/api/push/unsubscribe", { rawBody: "not json", method: "POST" }));
    const { status } = await readJson(raw);
    // No session, no uid in non-JSON body, so 400 for bad uid
    expect(status).toBe(400);
  });

  it("removes the endpoint field from the push hash (hdel observable)", async () => {
    // Pre-seed the hash with an existing subscription
    const f = hashField(ENDPOINT);
    const h = new Map<string, string>();
    h.set(f, JSON.stringify({ endpoint: ENDPOINT, keys: { p256dh: "k1", auth: "k2" } }));
    ctx.redis!.hashes.set(`push:${UID}`, h);

    const { status, body } = await readJson(await post({ uid: UID, endpoint: ENDPOINT }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    // The field should be gone from the hash
    expect(ctx.redis!.hashes.get(`push:${UID}`)?.has(f)).toBeFalsy();
  });

  it("is idempotent — removing a non-existent endpoint still returns ok:true", async () => {
    const { status, body } = await readJson(await post({ uid: UID, endpoint: ENDPOINT }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("uses uid from session when authenticated (ignores body uid)", async () => {
    authEnv();
    await signIn({ uid: "session-uid-xyz", name: "Test User" });

    // Pre-seed for the session uid
    const f = hashField(ENDPOINT);
    const h = new Map<string, string>();
    h.set(f, JSON.stringify({ endpoint: ENDPOINT, keys: { p256dh: "k1", auth: "k2" } }));
    ctx.redis!.hashes.set("push:session-uid-xyz", h);

    const { status, body } = await readJson(await post({ uid: "body-uid-ignored", endpoint: ENDPOINT }));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    // Session uid's hash should have the field removed
    expect(ctx.redis!.hashes.get("push:session-uid-xyz")?.has(f)).toBeFalsy();
    // Body uid should be untouched
    expect(ctx.redis!.hashes.get("push:body-uid-ignored")).toBeUndefined();
  });

  it("only removes the targeted endpoint field, not others for the same uid", async () => {
    const ep2 = "https://fcm.googleapis.com/fcm/send/other-device";
    const f1 = hashField(ENDPOINT);
    const f2 = hashField(ep2);

    const h = new Map<string, string>();
    h.set(f1, JSON.stringify({ endpoint: ENDPOINT, keys: { p256dh: "k1", auth: "k2" } }));
    h.set(f2, JSON.stringify({ endpoint: ep2, keys: { p256dh: "k3", auth: "k4" } }));
    ctx.redis!.hashes.set(`push:${UID}`, h);

    await post({ uid: UID, endpoint: ENDPOINT });

    // f1 removed, f2 remains
    expect(ctx.redis!.hashes.get(`push:${UID}`)?.has(f1)).toBeFalsy();
    expect(ctx.redis!.hashes.get(`push:${UID}`)?.has(f2)).toBe(true);
  });

  it("rate limits at 30 requests per IP", async () => {
    exhaustRateLimit("rl:pushuns:1.2.3.4", 30);
    const { status } = await readJson(await post({ uid: UID, endpoint: ENDPOINT }, "1.2.3.4"));
    expect(status).toBe(429);
  });
});
