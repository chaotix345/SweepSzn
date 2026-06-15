import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx } from "@/test/routeHarness";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());

enableRedisEnv();
const store = await import("@/lib/profileStore");
const push = await import("@/lib/pushStore");

beforeEach(() => { freshFake(); });

describe("profileStore — pure helpers", () => {
  it("canonicalDay normalizes both padded and non-padded to the dayUTC form", () => {
    expect(store.canonicalDay("2026-06-05")).toBe("2026-6-5");
    expect(store.canonicalDay("2026-6-5")).toBe("2026-6-5");
    expect(store.canonicalDay("not-a-date")).toBeNull();
    expect(store.canonicalDay("2026-13-40")).toBeNull();
    expect(store.canonicalDay(42)).toBeNull();
  });

  it("streakFromDates counts the consecutive run ending today or yesterday", () => {
    const now = Date.UTC(2026, 5, 15, 12); // 2026-6-15 noon UTC
    expect(store.streakFromDates(["2026-6-15", "2026-6-14", "2026-6-13"], now)).toBe(3);
    expect(store.streakFromDates(["2026-6-14"], now)).toBe(1); // yesterday keeps the streak alive
    expect(store.streakFromDates(["2026-6-13"], now)).toBe(0); // two-day gap → broken
    expect(store.streakFromDates(["2026-6-15", "2026-6-13"], now)).toBe(1); // gap breaks the run at 1
    expect(store.streakFromDates([], now)).toBe(0);
  });
});

describe("profileStore — redis-backed", () => {
  it("recordStreakDate + getStreakCount round-trip and union (no double count)", async () => {
    const uid = "u1";
    const now = Date.UTC(2026, 5, 15, 12);
    await store.recordStreakDate(uid, "2026-6-15", now);
    await store.recordStreakDate(uid, "2026-6-14", now);
    await store.recordStreakDate(uid, "2026-6-15", now); // same day again — union, not a new member
    expect(ctx.redis!.zsets.get(`streak:${uid}`)!.size).toBe(2);
    expect(await store.getStreakCount(uid, now)).toBe(2);
  });

  it("syncResults dedupes by mode:encoded and preserves newest-first", async () => {
    const uid = "u2";
    await store.syncResults(uid, [{ encoded: "a", mode: "daily", wins: 1, losses: 1, grade: "", ts: 1 }]);
    const added = await store.syncResults(uid, [
      { encoded: "a", mode: "daily", wins: 1, losses: 1, grade: "", ts: 1 }, // dupe
      { encoded: "b", mode: "daily", wins: 1, losses: 1, grade: "", ts: 2 }, // fresh
    ]);
    expect(added).toBe(1);
    const list = await store.getResults(uid);
    expect(list.length).toBe(2);
    expect(list[0].encoded).toBe("b"); // newest fresh entry at the head
  });

  it("upsertProfileOnSignIn updates name on each sign-in but stamps createdAt only once", async () => {
    const uid = "u3";
    await store.upsertProfileOnSignIn(uid, "First", "pic1", 1000);
    await store.upsertProfileOnSignIn(uid, "Second", "pic2", 2000);
    const h = ctx.redis!.hashes.get(`profile:${uid}`)!;
    expect(h.get("name")).toBe("Second");
    expect(Number(h.get("createdAt"))).toBe(1000);
  });
});

describe("migratePushSubs (sign-in: carry anon subscriptions onto the account)", () => {
  it("copies anon push subscriptions onto the authed uid and drops the old key", async () => {
    ctx.redis!.hashes.set("push:anon1", new Map([["field1", JSON.stringify({ endpoint: "e", keys: {} })]]));
    await push.migratePushSubs("anon1", "authed1");
    expect(ctx.redis!.hashes.get("push:authed1")?.get("field1")).toBeTruthy();
    expect(ctx.redis!.hashes.has("push:anon1")).toBe(false);
  });

  it("is a no-op when from === to (signed-in user with no prior anon device)", async () => {
    await expect(push.migratePushSubs("same", "same")).resolves.toBeUndefined();
  });
});
