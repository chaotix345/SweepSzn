import { describe, it, expect, beforeEach, vi } from "vitest";
import { enableRedisEnv, freshFake, ctx } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());

enableRedisEnv();
const { getChallengeSeed, getChallengePublic } = await import("@/lib/challengeStore");

const ID = "abc12345";
const info = (over: Record<string, unknown> = {}) => JSON.stringify({
  uid: "creator-uid-123", name: "Alice", wins: 55, losses: 27, net: 7.5, grade: "B+",
  lineup: "p0pg,p1sg,p2sf,p3pf,p4c", hinted: false, ...over,
});

beforeEach(() => { freshFake(); });

describe("getChallengeSeed", () => {
  it("null when the challenge has no creator yet (first submitter may supply the seed)", async () => {
    expect(await getChallengeSeed(ID)).toBeNull();
  });

  it("returns the stored seed", async () => {
    ctx.redis!.strings.set(`chal:${ID}:info`, info({ seed: "daily-2026-6-10" }));
    expect(await getChallengeSeed(ID)).toBe("daily-2026-6-10");
  });

  it("a legacy challenge (info row without a seed) resolves to h2h-<id>, never null", async () => {
    // null would let a RESPONDER supply body.seed and be verified against a different draft
    ctx.redis!.strings.set(`chal:${ID}:info`, info());
    expect(await getChallengeSeed(ID)).toBe(`h2h-${ID}`);
  });
});

describe("getChallengePublic (/c/[id] page + OG)", () => {
  it("returns the redacted bar for a stored challenge", async () => {
    ctx.redis!.strings.set(`chal:${ID}:info`, info({ seed: "daily-2026-6-10" }));
    expect(await getChallengePublic(ID)).toMatchObject({ id: ID, creatorName: "Alice", wins: 55, seed: "daily-2026-6-10" });
  });

  it("a Redis error resolves null (the page's 'not available' branch, OG brand card) instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    ctx.redis!.get = async () => { throw new Error("upstash down"); };
    await expect(getChallengePublic(ID)).resolves.toBeNull();
  });

  it("a malformed id resolves null without touching Redis", async () => {
    for (const bad of ["ab", "ABCDEFGH", "abc12345:info", "x".repeat(17), "abc-1234"]) {
      expect(await getChallengePublic(bad)).toBeNull();
    }
    expect(ctx.redis!.calls).toEqual([]);
  });
});
