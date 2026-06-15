import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, signIn } from "@/test/routeHarness";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { POST } = await import("@/app/api/profile/name/route");

const post = (body: unknown, headers?: Record<string, string>) =>
  POST(req("/api/profile/name", { method: "POST", body, headers: { "x-requested-with": "fetch", ...headers } }));

beforeEach(() => { freshFake(); });

describe("POST /api/profile/name", () => {
  it("403 without the CSRF header", async () => {
    await signIn({ uid: "g" + "a".repeat(31), name: "X" });
    const { status } = await readJson(await POST(req("/api/profile/name", { method: "POST", body: { name: "Y" } })));
    expect(status).toBe(403);
  });

  it("401 when signed out", async () => {
    const { status, body } = await readJson(await post({ name: "Y" }));
    expect(status).toBe(401);
    expect(body.error).toBe("auth_required");
  });

  it("400 on a blank/empty name", async () => {
    await signIn({ uid: "g" + "a".repeat(31), name: "X" });
    const { status, body } = await readJson(await post({ name: "   " }));
    expect(status).toBe(400);
    expect(body.error).toBe("bad name");
  });

  it("stores the handle and re-mints the session JWT with the new name (no re-login needed)", async () => {
    const uid = "g" + "b".repeat(31);
    await signIn({ uid, name: "Google Name" });
    const { status, body } = await readJson(await post({ name: "CourtVision" }));
    expect(status).toBe(200);
    expect(body.name).toBe("CourtVision");
    // canonical profile record updated
    expect(ctx.redis!.hashes.get(`profile:${uid}`)?.get("name")).toBe("CourtVision");
    // session cookie re-minted so submit routes (which read the JWT) see the new name immediately
    const tok = ctx.cookies.get(SESSION_COOKIE)!;
    const sess = await verifySession(tok);
    expect(sess?.uid).toBe(uid);
    expect(sess?.name).toBe("CourtVision");
  });

  it("sanitizes control / bidi-override characters via cleanName", async () => {
    await signIn({ uid: "g" + "c".repeat(31), name: "X" });
    const rlo = String.fromCharCode(0x202e); // right-to-left override — stripped by cleanName
    const { body } = await readJson(await post({ name: `A${rlo}B` }));
    expect(body.name).toBe("AB");
  });
});
