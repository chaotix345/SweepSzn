import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { SESSION_COOKIE, signSession } from "@/lib/auth";

// next/headers' cookies() is what marks a render request-time (dynamic). A spy jar lets the test
// see whether getSession() touched it.
const cookieCalls = vi.hoisted(() => ({ n: 0, jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => {
    cookieCalls.n++;
    return { get: (k: string) => (cookieCalls.jar.has(k) ? { name: k, value: cookieCalls.jar.get(k)! } : undefined) };
  },
}));

const { getSession } = await import("@/lib/authServer");
const ENV = { secret: process.env.AUTH_SECRET, client: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID };

beforeEach(() => {
  cookieCalls.n = 0;
  cookieCalls.jar.clear();
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
});
afterAll(() => { process.env.AUTH_SECRET = ENV.secret; process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = ENV.client; });

describe("getSession with auth unconfigured", () => {
  it("returns null for a session signed with a too-short AUTH_SECRET", async () => {
    process.env.AUTH_SECRET = "short";
    cookieCalls.jar.set(SESSION_COOKIE, await signSession({ uid: "g123", name: "Charlie" }));
    expect(await getSession()).toBeNull();
  });

  // Pages gated on getSession (e.g. /admin) must stay request-time: if getSession skipped cookies()
  // when auth is off at build time, the page would prerender as a static 404 baked into the deploy.
  it("still reads cookies() so callers stay request-time (never prerendered)", async () => {
    delete process.env.AUTH_SECRET;
    expect(await getSession()).toBeNull();
    expect(cookieCalls.n).toBe(1);
  });
});
