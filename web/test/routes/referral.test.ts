import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, signIn, ctx, req, readJson, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

enableRedisEnv();
const { POST } = await import("@/app/api/referral/route");
const { refCodeFor } = await import("@/lib/referralCode");

const ANON = "anon-uid-12345678";

beforeEach(() => { freshFake(); });

describe("POST /api/referral", () => {
  it("mints a code for an anon uid in the body and stores the reverse map", async () => {
    const { status, body } = await readJson(await POST(req("/api/referral", { body: { uid: ANON } })));
    expect(status).toBe(200);
    expect(body.code).toBe(refCodeFor(ANON));
    expect(body.credits).toBe(0);
    expect(ctx.redis!.strings.get(`ref:code:${body.code}`)).toBe(ANON);
  });

  it("is idempotent — the same uid always mints the same code", async () => {
    const a = await readJson(await POST(req("/api/referral", { body: { uid: ANON } })));
    const b = await readJson(await POST(req("/api/referral", { body: { uid: ANON } })));
    expect(a.body.code).toBe(b.body.code);
  });

  it("returns the referrer's all-time credit count", async () => {
    ctx.redis!.strings.set(`ref:credits:${ANON}`, "7");
    const { body } = await readJson(await POST(req("/api/referral", { body: { uid: ANON } })));
    expect(body.credits).toBe(7);
  });

  it("prefers the signed-in session uid over the body uid (cross-device durable)", async () => {
    const SESS = "g123456789012345678901234567890ab";
    await signIn({ uid: SESS, name: "Charlie" });
    const { body } = await readJson(await POST(req("/api/referral", { body: { uid: ANON } })));
    expect(body.code).toBe(refCodeFor(SESS)); // session wins
    expect(ctx.redis!.strings.get(`ref:code:${body.code}`)).toBe(SESS);
  });

  it("400s when there is no session and the body uid is missing or invalid", async () => {
    const bad = await POST(req("/api/referral", { body: { uid: "x" } })); // too short for UID_RE
    expect(bad.status).toBe(400);
    const none = await POST(req("/api/referral", { body: {} }));
    expect(none.status).toBe(400);
  });

  it("429s once the per-IP bucket is exhausted", async () => {
    exhaustRateLimit("rl:ref:9.9.9.9", 30);
    const res = await POST(req("/api/referral", { body: { uid: ANON }, ip: "9.9.9.9" }));
    expect(res.status).toBe(429);
  });
});
