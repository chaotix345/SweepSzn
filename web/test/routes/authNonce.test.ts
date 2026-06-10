import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, authEnv, req, readJson, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// nonce/route.ts rate-limits via lib/redis — enableRedisEnv() must run before the dynamic import.
// lib/auth is pure (no redis), so we can import it statically for constants.
import { NONCE_COOKIE } from "@/lib/auth";

enableRedisEnv();
const { POST } = await import("@/app/api/auth/nonce/route");

const post = (headers?: Record<string, string>) =>
  POST(req("/api/auth/nonce", { method: "POST", body: {}, headers }));

const goodHeaders = { "content-type": "application/json", "x-requested-with": "fetch" };

beforeEach(() => { freshFake(); });

describe("POST /api/auth/nonce", () => {
  it("503 when auth is not configured (no AUTH_SECRET)", async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const { status, body } = await readJson(await post(goodHeaders));
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "auth not configured" });
  });

  it("503 when AUTH_SECRET is too short", async () => {
    process.env.AUTH_SECRET = "short";
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
    const { status, body } = await readJson(await post(goodHeaders));
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "auth not configured" });
  });

  it("415 when content-type is not application/json", async () => {
    authEnv();
    const { status, body } = await readJson(
      await POST(req("/api/auth/nonce", { method: "POST", rawBody: "", headers: { "content-type": "text/plain", "x-requested-with": "fetch" } })),
    );
    expect(status).toBe(415);
    expect(body).toMatchObject({ error: "bad content-type" });
  });

  it("403 when x-requested-with header is missing", async () => {
    authEnv();
    const { status, body } = await readJson(
      await POST(req("/api/auth/nonce", { method: "POST", body: {}, headers: { "content-type": "application/json" } })),
    );
    expect(status).toBe(403);
    expect(body).toMatchObject({ error: "forbidden" });
  });

  it("403 when x-requested-with is not 'fetch'", async () => {
    authEnv();
    const { status, body } = await readJson(
      await POST(req("/api/auth/nonce", { method: "POST", body: {}, headers: { "content-type": "application/json", "x-requested-with": "xmlhttprequest" } })),
    );
    expect(status).toBe(403);
    expect(body).toMatchObject({ error: "forbidden" });
  });

  it("success: returns a nonce UUID and sets the nonce cookie", async () => {
    authEnv();
    const { status, body } = await readJson(await post(goodHeaders));
    expect(status).toBe(200);
    expect(typeof body.nonce).toBe("string");
    expect((body.nonce as string).length).toBeGreaterThan(0);
    // The cookie jar should contain a signed nonce cookie
    expect(ctx.cookies.has(NONCE_COOKIE)).toBe(true);
    const cookieValue = ctx.cookies.get(NONCE_COOKIE)!;
    expect(typeof cookieValue).toBe("string");
    expect(cookieValue.length).toBeGreaterThan(0);
  });

  it("success: the nonce cookie value is a signed JWT (not raw UUID)", async () => {
    authEnv();
    const { body } = await readJson(await post(goodHeaders));
    const cookieValue = ctx.cookies.get(NONCE_COOKIE)!;
    // JWT has 3 dot-separated parts; the raw nonce is just a UUID (has hyphens, no dots)
    expect(cookieValue.split(".").length).toBe(3);
    // Body nonce is the raw UUID, cookie is the signed token — they differ
    expect(cookieValue).not.toBe(body.nonce);
  });

  it("429 once the per-IP bucket is exhausted (nonce-cookie flooding)", async () => {
    authEnv();
    exhaustRateLimit("rl:nonce:9.9.9.9", 10);
    const { status, body } = await readJson(
      await POST(req("/api/auth/nonce", { method: "POST", body: {}, headers: goodHeaders, ip: "9.9.9.9" })),
    );
    expect(status).toBe(429);
    expect(body).toMatchObject({ error: "too many requests" });
    // another IP is unaffected
    const ok = await readJson(
      await POST(req("/api/auth/nonce", { method: "POST", body: {}, headers: goodHeaders, ip: "8.8.8.8" })),
    );
    expect(ok.status).toBe(200);
  });
});
