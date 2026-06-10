import { describe, it, expect, vi, beforeEach } from "vitest";
import { freshFake, ctx, signIn, readJson } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

import { SESSION_COOKIE } from "@/lib/auth";

const { POST } = await import("@/app/api/auth/signout/route");

const post = () => POST(); // the handler takes no Request: it only clears the session cookie

beforeEach(() => { freshFake(); });

describe("POST /api/auth/signout", () => {
  it("returns ok:true even when no session exists", async () => {
    const { status, body } = await readJson(await post());
    expect(status).toBe(200);
    expect(body).toStrictEqual({ ok: true });
  });

  it("clears the session cookie when a session is active", async () => {
    await signIn({ uid: "g123456789012345678901234567890ab", name: "Alice" });
    // Verify the cookie exists before signout
    expect(ctx.cookies.has(SESSION_COOKIE)).toBe(true);

    const { status, body } = await readJson(await post());
    expect(status).toBe(200);
    expect(body).toStrictEqual({ ok: true });
    // Cookie should be gone from the jar
    expect(ctx.cookies.has(SESSION_COOKIE)).toBe(false);
  });

  it("returns ok:true and cookie remains absent on repeated signout", async () => {
    await signIn({ uid: "g123456789012345678901234567890ab", name: "Alice" });
    await post(); // first signout
    const { status, body } = await readJson(await post()); // second signout
    expect(status).toBe(200);
    expect(body).toStrictEqual({ ok: true });
    expect(ctx.cookies.has(SESSION_COOKIE)).toBe(false);
  });
});
