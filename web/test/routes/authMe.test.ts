import { describe, it, expect, vi, beforeEach } from "vitest";
import { freshFake, signIn, readJson } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

const { GET } = await import("@/app/api/auth/me/route");

const get = () => GET(); // the handler takes no Request: identity comes from the cookie jar

beforeEach(() => { freshFake(); });

describe("GET /api/auth/me", () => {
  it("returns null user when there is no session cookie", async () => {
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(body).toStrictEqual({ user: null });
  });

  it("returns null user when session cookie is absent even if auth is configured", async () => {
    process.env.AUTH_SECRET = "test-secret-0123456789abcdef-0123456789abcdef";
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(body).toStrictEqual({ user: null });
  });

  it("returns the user fields after signIn()", async () => {
    await signIn({ uid: "g123456789012345678901234567890ab", name: "Alice" });
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    const user = body.user as Record<string, unknown>;
    expect(user).not.toBeNull();
    expect(user.uid).toBe("g123456789012345678901234567890ab");
    expect(user.name).toBe("Alice");
  });

  it("does not expose the anon field in the response", async () => {
    await signIn({ uid: "g123456789012345678901234567890ab", name: "Alice", anon: "anon-uid-1234567890" });
    const { body } = await readJson(await get());
    const user = body.user as Record<string, unknown>;
    expect(user).not.toBeNull();
    expect(user.anon).toBeUndefined();
  });

  it("returns null when the session cookie is tampered", async () => {
    process.env.AUTH_SECRET = "test-secret-0123456789abcdef-0123456789abcdef";
    const { SESSION_COOKIE } = await import("@/lib/auth");
    const { ctx } = await import("@/test/routeHarness");
    ctx.cookies.set(SESSION_COOKIE, "not.a.valid.jwt");
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(body).toStrictEqual({ user: null });
  });
});
