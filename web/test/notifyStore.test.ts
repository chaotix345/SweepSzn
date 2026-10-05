import { describe, it, expect, beforeEach, vi } from "vitest";
import { enableRedisEnv, freshFake, ctx } from "@/test/routeHarness";
import type { Notif, ChallengeNotif, BadgeNotif } from "@/lib/types";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());

enableRedisEnv();
const { enqueueNotif } = await import("@/lib/notifyStore");
const { NOTIF_CAP } = await import("@/lib/notify");

beforeEach(() => { freshFake(); });

const mkNotif = (over: Partial<ChallengeNotif> = {}): Notif => ({
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
    await enqueueNotif("u1", mkNotif(), "resp-uid-1");
    const keys = [...ctx.redis!.strings.keys()].filter((k) => k.startsWith("notif:dedup:u1:c1:"));
    expect(keys.length).toBe(1);
    expect(ctx.redis!.ttls.has(keys[0])).toBe(true);
    // keyed on a hash of the responder uid (an anon uid is a bearer token) — never the raw uid or the name
    expect(keys[0]).not.toContain("resp-uid-1");
    expect(keys[0]).not.toContain("Bob");
  });

  it("returns true for a fresh item and false when deduped (the caller only pushes on fresh)", async () => {
    expect(await enqueueNotif("u1", mkNotif(), "resp-uid-1")).toBe(true);
    expect(await enqueueNotif("u1", mkNotif({ ts: 2000 }), "resp-uid-1")).toBe(false);
  });

  it("dedups on the responder uid, not the display name: two distinct 'Anonymous' friends are two items", async () => {
    await enqueueNotif("u1", mkNotif({ opponent: "Anonymous" }), "resp-uid-1");
    await enqueueNotif("u1", mkNotif({ opponent: "Anonymous" }), "resp-uid-2");
    expect(ctx.redis!.lists.get("notif:u1")?.length).toBe(2);
  });

  it("the same responder uid under a fresh display name is still deduped", async () => {
    await enqueueNotif("u1", mkNotif({ opponent: "Bob" }), "resp-uid-1");
    expect(await enqueueNotif("u1", mkNotif({ opponent: "B0b the 2nd" }), "resp-uid-1")).toBe(false);
    expect(ctx.redis!.lists.get("notif:u1")?.length).toBe(1);
  });

  it("caps the inbox at NOTIF_CAP (ltrim keeps the newest)", async () => {
    for (let i = 0; i < NOTIF_CAP + 10; i++) {
      await enqueueNotif("u1", mkNotif({ challengeId: `c${i}`, ts: 1000 + i }));
    }
    expect(ctx.redis!.lists.get("notif:u1")?.length).toBe(NOTIF_CAP);
  });
});

const mkBadge = (over: Partial<BadgeNotif> = {}): BadgeNotif => ({
  id: "badge:scorer", type: "badge_unlock", badge: "scorer", name: "Bucket Getter", ts: 1000, ...over,
});

describe("enqueueNotif dedup — badge unlocks (keyed by badge, not challenge)", () => {
  it("writes the first badge notification", async () => {
    await enqueueNotif("u1", mkBadge());
    expect(ctx.redis!.lists.get("notif:u1")?.length).toBe(1);
  });

  it("suppresses a repeat of the same badge", async () => {
    await enqueueNotif("u1", mkBadge({ ts: 1 }));
    await enqueueNotif("u1", mkBadge({ ts: 2 })); // same badge key → deduped
    expect(ctx.redis!.lists.get("notif:u1")?.length).toBe(1);
  });

  it("does NOT suppress a different badge key", async () => {
    await enqueueNotif("u1", mkBadge({ badge: "scorer", id: "badge:scorer" }));
    await enqueueNotif("u1", mkBadge({ badge: "glass", id: "badge:glass" }));
    expect(ctx.redis!.lists.get("notif:u1")?.length).toBe(2);
  });

  it("sets a badge-scoped dedup key (never collides with the challenge namespace)", async () => {
    await enqueueNotif("u1", mkBadge());
    expect(ctx.redis!.ttls.has("notif:dedup:u1:badge:scorer")).toBe(true);
  });
});
