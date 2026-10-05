import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, req, readJson, exhaustRateLimit } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));

// lib/redis reads env at module eval: enableRedisEnv() MUST run before anything that imports it,
// so the route (and TTL) are imported dynamically — never statically import @/lib/redis here.
enableRedisEnv();
const { GET, POST } = await import("@/app/api/pickem/route");
const { TTL } = await import("@/lib/redis");

const seed = "daily-2026-6-10";
const get = (qs: string, ip = "9.9.9.9") => GET(req(`/api/pickem?${qs}`, { ip }));
const post = (body: unknown, ip = "9.9.9.9") => POST(req("/api/pickem", { body, ip }));

beforeEach(() => { freshFake(); });

describe("GET /api/pickem", () => {
  it("rejects a malformed seed", async () => {
    const { status } = await readJson(await get("seed=evil..seed"));
    expect(status).toBe(400);
  });

  it("returns zero counts and a null vote for a fresh seed", async () => {
    const { status, body } = await readJson(await get(`seed=${seed}`));
    expect(status).toBe(200);
    expect(body).toStrictEqual({ y: 0, n: 0, vote: null });
  });

  it("reflects this uid's stored vote and live counts (POST read: uid in the body, no vote)", async () => {
    await post({ seed, vote: "y", uid: "abcdefgh" });
    await post({ seed, vote: "n", uid: "ijklmnop" });
    const { body } = await readJson(await post({ seed, uid: "abcdefgh" }));
    expect(body).toStrictEqual({ y: 1, n: 1, vote: "y" });
  });

  it("rate limits on the g: bucket with a 429", async () => {
    exhaustRateLimit("rl:pickem:g:1.2.3.4", 60);
    const { status } = await readJson(await get(`seed=${seed}`, "1.2.3.4"));
    expect(status).toBe(429);
  });
});

describe("POST /api/pickem", () => {
  it("rejects bad seed, bad vote, and a non-JSON body", async () => {
    expect((await readJson(await post({ seed: "nope", vote: "y" }))).status).toBe(400);
    expect((await readJson(await post({ seed, vote: "maybe" }))).status).toBe(400);
    const raw = await POST(req("/api/pickem", { rawBody: "not json", method: "POST" }));
    expect((await readJson(raw)).status).toBe(400);
  });

  it("first vote claims and counts (atomic Lua path)", async () => {
    const { status, body } = await readJson(await post({ seed, vote: "y", uid: "abcdefgh" }));
    expect(status).toBe(200);
    expect(body).toStrictEqual({ y: 1, n: 0, vote: "y", already: false });
  });

  it("flipped-vote replay returns the original pick with already:true and no double count", async () => {
    await post({ seed, vote: "y", uid: "abcdefgh" });
    const { body } = await readJson(await post({ seed, vote: "n", uid: "abcdefgh" }));
    expect(body).toStrictEqual({ y: 1, n: 0, vote: "y", already: true });
  });

  it("a second voter counts independently", async () => {
    await post({ seed, vote: "y", uid: "abcdefgh" });
    const { body } = await readJson(await post({ seed, vote: "n", uid: "ijklmnop" }));
    expect(body).toStrictEqual({ y: 1, n: 1, vote: "n", already: false });
  });

  it("falls back to a hashed-IP voter when uid is absent or invalid", async () => {
    await post({ seed, vote: "y" }, "5.5.5.5");
    const replay = await readJson(await post({ seed, vote: "n" }, "5.5.5.5"));
    expect(replay.body).toStrictEqual({ y: 1, n: 0, vote: "y", already: true });
    const other = await readJson(await post({ seed, vote: "n", uid: "not a uid!" }, "6.6.6.6"));
    expect(other.body).toStrictEqual({ y: 1, n: 1, vote: "n", already: false });
    const rawIpKeys = [...ctx.redis!.strings.keys()].filter((k) => k.includes(":voted:"));
    expect(rawIpKeys.every((k) => /:voted:ip:[0-9a-f]{16}$/.test(k))).toBe(true); // never the raw IP
  });

  it("vote keys carry the shared ~31d TTL", async () => {
    await post({ seed, vote: "y", uid: "abcdefgh" });
    expect(ctx.redis!.ttls.get(`pickems:${seed}:voted:u:abcdefgh`)).toBe(TTL);
    expect(ctx.redis!.ttls.get(`pickems:${seed}:y`)).toBe(TTL);
  });

  it("rate limits on the p: bucket, separately from g:", async () => {
    exhaustRateLimit("rl:pickem:p:7.7.7.7", 30);
    expect((await readJson(await post({ seed, vote: "y", uid: "abcdefgh" }, "7.7.7.7"))).status).toBe(429);
    // the g: bucket is untouched: GET from the same IP still works
    expect((await readJson(await get(`seed=${seed}`, "7.7.7.7"))).status).toBe(200);
    // and an exhausted g: bucket does not block POSTs
    freshFake();
    exhaustRateLimit("rl:pickem:g:8.8.8.8", 60);
    expect((await readJson(await post({ seed, vote: "y", uid: "abcdefgh" }, "8.8.8.8"))).status).toBe(200);
  });
});

// H3: a g-uid (signed-in namespace) is not an acceptable anonymous voter id — it falls back to the
// hashed-IP voter like any other invalid uid, so it can't cast or read a signed-in player's vote.
describe("POST /api/pickem — Google-namespace uid", () => {
  it("never keys a vote on a signed-in uid", async () => {
    const { authedUid } = await import("@/lib/auth");
    const victim = authedUid("123");
    await post({ seed, vote: "y", uid: victim });
    const keys = [...ctx.redis!.strings.keys()].filter((k) => k.includes(":voted:"));
    expect(keys.some((k) => k.endsWith(`:u:${victim}`))).toBe(false);
    expect(keys.every((k) => /:voted:ip:[0-9a-f]{16}$/.test(k))).toBe(true);
  });
});

// M2: the anon uid must never ride a URL (DESIGN.md §12). The personalized crowd read is a POST with
// no `vote` (uid in the body); GET ignores any uid query param and reads the hashed-IP voter.
describe("/api/pickem — the anon uid never rides a URL", () => {
  it("GET ignores a uid query param (the uid's vote is not read back)", async () => {
    await post({ seed, vote: "y", uid: "abcdefgh" }, "1.1.1.1");
    const { status, body } = await readJson(await get(`seed=${seed}&uid=abcdefgh`, "2.2.2.2"));
    expect(status).toBe(200);
    expect(body).toStrictEqual({ y: 1, n: 0, vote: null });
  });

  it("POST without a vote is the personalized read: never counts, never cached", async () => {
    await post({ seed, vote: "n", uid: "abcdefgh" });
    const res = await post({ seed, uid: "abcdefgh" });
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body).toStrictEqual({ y: 0, n: 1, vote: "n" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const again = await readJson(await post({ seed, uid: "abcdefgh" }));
    expect(again.body).toStrictEqual({ y: 0, n: 1, vote: "n" });
  });

  it("the POST read rejects a bad seed and uses the GET (g:) bucket, not the vote bucket", async () => {
    expect((await readJson(await post({ seed: "nope", uid: "abcdefgh" }))).status).toBe(400);
    exhaustRateLimit("rl:pickem:g:4.4.4.4", 60);
    expect((await readJson(await post({ seed, uid: "abcdefgh" }, "4.4.4.4"))).status).toBe(429);
    expect((await readJson(await post({ seed, vote: "y", uid: "abcdefgh" }, "4.4.4.4"))).status).toBe(200);
  });
});
