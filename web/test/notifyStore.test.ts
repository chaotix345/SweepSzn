import { describe, it, expect, beforeEach, vi } from "vitest";
import { enableRedisEnv, freshFake, ctx } from "@/test/routeHarness";
import type { Notif } from "@/lib/types";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());

enableRedisEnv();
const { enqueueNotif } = await import("@/lib/notifyStore");
const { NOTIF_CAP } = await import("@/lib/notify");

beforeEach(() => { freshFake(); });

const mkNotif = (over: Partial<Notif> = {}): Notif => ({
  id: "n1",
  type: "challenge_response",
  challengeId: "c1",
  opponent: "Bob",
  outcome: "beaten",
  tookLead: false,
  oppWins: 55,
  oppLosses: 27,
  yourWins: 50,
  yourLosses: 32,
  ts: 1000,
  ...over,
});

// The dedup nx key is the only gate stopping a friend's repeated improving submits from flooding the
// creator's inbox; the suppression branch was previously only exercised indirectly via the route.
describe("enqueueNotif dedup", () => {
  it("writes the first notification to the uid's list", async () => {
    await enqueueNotif("u1", mkNotif());
    expect(ctx.redis!.lists.get("notif:u1")?.length).toBe(1);
  });

  it("suppresses an identical-outcome ping for the same challenge+responder", async () => {
    await enqueueNotif("u1", mkNotif({ ts: 1000 }));
    await enqueueNotif("u1", mkNotif({ ts: 2000 })); // same challenge/opponent/outcome → deduped
    expect(ctx.redis!.lists.get("notif:u1")?.length).toBe(1);
  });

  it("does NOT suppress a different outcome from the same responder", async () => {
    await enqueueNotif("u1", mkNotif({ outcome: "beaten" }));
    await enqueueNotif("u1", mkNotif({ outcome: "held" }));
    expect(ctx.redis!.lists.get("notif:u1")?.length).toBe(2);
  });

  it("does NOT suppress the same outcome from a different challenge", async () => {
    await enqueueNotif("u1", mkNotif({ challengeId: "c1" }));
    await enqueueNotif("u1", mkNotif({ challengeId: "c2" }));
    expect(ctx.redis!.lists.get("notif:u1")?.length).toBe(2);
  });

  it("sets the dedup nx key with a TTL after the first enqueue", async () => {
    await enqueueNotif("u1", mkNotif());
    expect(ctx.redis!.ttls.has("notif:dedup:u1:c1:Bob:beaten")).toBe(true);
  });

  it("caps the inbox at NOTIF_CAP (ltrim keeps the newest)", async () => {
    for (let i = 0; i < NOTIF_CAP + 10; i++) {
      await enqueueNotif("u1", mkNotif({ challengeId: `c${i}`, ts: 1000 + i }));
    }
    expect(ctx.redis!.lists.get("notif:u1")?.length).toBe(NOTIF_CAP);
  });
});
