import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx } from "@/test/routeHarness";
import { encodeLineup } from "@/lib/share";
import { encodeSurgeonCard } from "@/lib/surgeon";
import { getPlayersByIds } from "@/lib/data";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());

enableRedisEnv();
const store = await import("@/lib/profileStore");
const push = await import("@/lib/pushStore");
// the sync route's real-player filter (injected into syncResults)
const realIds = (ids: string[]) => getPlayersByIds(ids).map((p) => p.id);

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

describe("profileStore — dex set (unbounded collection)", () => {
  // real players.json ids — only real players enter the dex (a forged lineup can't inject ids)
  const DIDS = ["michael_jordan_chi_1980s_1988", "lebron_james_cle_2000s_2009", "david_robinson_sas_1990s_1994", "wilt_chamberlain_sfw_1960s_1963", "nikola_joki_den_2020s_2024"];
  it("syncResults records every fielded player in dex:{uid}; getDexIds reads them back", async () => {
    await store.syncResults("u-dex1", [{ encoded: encodeLineup(DIDS), mode: "classic", wins: 1, losses: 81, grade: "F", ts: 1 }], realIds);
    expect(new Set(await store.getDexIds("u-dex1"))).toEqual(new Set(DIDS));
  });
  it("is idempotent — re-syncing the same game keeps the set at 5", async () => {
    const e = { encoded: encodeLineup(DIDS), mode: "classic", wins: 1, losses: 81, grade: "F", ts: 1 };
    await store.syncResults("u-dex2", [e], realIds);
    await store.syncResults("u-dex2", [{ ...e, ts: 2 }], realIds);
    expect((await store.getDexIds("u-dex2")).length).toBe(5);
  });
  it("drops ids that aren't real players (a forged encoded lineup can't inject dex members)", async () => {
    await store.syncResults("u-dex3", [{ encoded: "zzz_fake,yyy_fake", mode: "classic", wins: 1, losses: 81, grade: "F", ts: 1 }], realIds);
    expect(await store.getDexIds("u-dex3")).toEqual([]);
    await store.syncResults("u-dex3", [{ encoded: `${DIDS[0]},zzz_fake`, mode: "classic", wins: 1, losses: 81, grade: "F", ts: 2 }], realIds);
    expect(await store.getDexIds("u-dex3")).toEqual([DIDS[0]]);
  });
  it("a Surgeon card records the drafted five plus the swapped-in player", async () => {
    const IN = "kevin_garnett_min_2000s_2004";
    await store.syncResults("u-dex4", [{ encoded: encodeSurgeonCard(DIDS, 4, IN), mode: "surgeon", wins: 60, losses: 22, grade: "A", ts: 1 }], realIds);
    expect(new Set(await store.getDexIds("u-dex4"))).toEqual(new Set([...DIDS, IN]));
  });
});

describe("profileStore — syncResults concurrency + atomicity", () => {
  const mk = (n: number) => ({ encoded: "e" + n, mode: "classic", wins: 50, losses: 32, grade: "B", ts: 1000 + n });
  const encs = async (uid: string) => (await store.getResults(uid)).map((e) => e.encoded);

  // Probe repro: two un-serialized read-merge-rewrites interleaved into "e11,e3,e2,e1,e10,e3,e2,e1".
  it("two concurrent syncs neither duplicate nor lose entries, and stay newest-first", async () => {
    await store.syncResults("u-race", [mk(1), mk(2), mk(3)], realIds);
    const added = await Promise.all([store.syncResults("u-race", [mk(10)], realIds), store.syncResults("u-race", [mk(11)], realIds)]);
    expect(added).toEqual([1, 1]);
    expect(await encs("u-race")).toEqual(["e11", "e10", "e3", "e2", "e1"]);
    expect(ctx.redis!.strings.has("results:lock:u-race")).toBe(false); // lock released
  });

  it("a failed rewrite never wipes the stored history (DEL+LPUSH are one transaction) and frees the lock", async () => {
    await store.syncResults("u-atomic", [mk(1), mk(2)], realIds);
    const realLpush = ctx.redis!.lpush;
    ctx.redis!.lpush = async () => { throw new Error("network down"); };
    try {
      await expect(store.syncResults("u-atomic", [mk(3)], realIds)).rejects.toThrow();
    } finally {
      ctx.redis!.lpush = realLpush;
    }
    expect(await encs("u-atomic")).toEqual(["e2", "e1"]);
    expect(await store.syncResults("u-atomic", [mk(3)], realIds)).toBe(1); // lock was released — no wait, no wedge
    expect(await encs("u-atomic")).toEqual(["e3", "e2", "e1"]);
  });

  it("a holder that overran the lock TTL doesn't release the NEXT holder's lock", async () => {
    const lock = "results:lock:u-stale";
    const realLrange = ctx.redis!.lrange;
    // mid-sync: our lock expires and another sync claims it
    ctx.redis!.lrange = async (...a: Parameters<typeof realLrange>) => {
      ctx.redis!.strings.set(lock, "next-holder");
      return realLrange(...a);
    };
    try {
      expect(await store.syncResults("u-stale", [mk(1)], realIds)).toBe(1);
    } finally {
      ctx.redis!.lrange = realLrange;
    }
    expect(ctx.redis!.strings.get(lock)).toBe("next-holder");
  });

  it("a lock that stays busy gives up after a bounded handful of SET NX trips", async () => {
    ctx.redis!.strings.set("results:lock:u-busy", "other");
    await expect(store.syncResults("u-busy", [mk(1)], realIds)).rejects.toBeInstanceOf(store.ResultsLockBusyError);
    expect(ctx.redis!.calls.filter((c) => c.startsWith("set results:lock:u-busy")).length).toBeLessThanOrEqual(11);
  }, 15_000);
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

  it("getStreakCount reads only the most-recent STREAK_CAP window (bounds the read on a huge ZSET)", async () => {
    const uid = "ubig";
    const now = Date.UTC(2026, 5, 15, 12);
    // Seed CAP+20 consecutive days ending today directly (record path doesn't trim by design).
    const z = new Map<string, number>();
    for (let i = 0; i < store.STREAK_CAP + 20; i++) {
      const ms = now - i * 86_400_000;
      const d = new Date(ms);
      z.set(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`, ms);
    }
    ctx.redis!.zsets.set(`streak:${uid}`, z);
    // The bounded read sees the newest STREAK_CAP consecutive days → streak reported as exactly CAP
    // (a longer run is implausible and the client also caps at 400).
    expect(await store.getStreakCount(uid, now)).toBe(store.STREAK_CAP);
  });

  it("syncStreakDates dedupes within the batch and drops out-of-range years (bounds the no-TTL ZSET)", async () => {
    const uid = "uyear";
    await store.syncStreakDates(uid, ["2026-6-1", "2026-6-1", "1999-1-1", "2101-1-1", "2026-6-2"]);
    const z = ctx.redis!.zsets.get(`streak:${uid}`)!;
    expect(z.size).toBe(2); // dupe collapsed, both out-of-range years rejected
    expect(z.has("2026-6-1")).toBe(true);
    expect(z.has("2026-6-2")).toBe(true);
    expect(z.has("1999-1-1")).toBe(false);
    expect(z.has("2101-1-1")).toBe(false);
  });

  it("syncStreakDates caps the streak ZSET at STREAK_CAP", async () => {
    const uid = "usync";
    const dates: string[] = [];
    const base = Date.UTC(2020, 0, 1);
    for (let i = 0; i < store.STREAK_CAP + 25; i++) {
      const d = new Date(base + i * 86_400_000);
      dates.push(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`);
    }
    await store.syncStreakDates(uid, dates);
    expect(ctx.redis!.zsets.get(`streak:${uid}`)!.size).toBe(store.STREAK_CAP);
  });

  it("syncResults dedupes by mode:encoded and preserves newest-first", async () => {
    const uid = "u2";
    await store.syncResults(uid, [{ encoded: "a", mode: "daily", wins: 1, losses: 1, grade: "", ts: 1 }], realIds);
    const added = await store.syncResults(uid, [
      { encoded: "a", mode: "daily", wins: 1, losses: 1, grade: "", ts: 1 }, // dupe
      { encoded: "b", mode: "daily", wins: 1, losses: 1, grade: "", ts: 2 }, // fresh
    ], realIds);
    expect(added).toBe(1);
    const list = await store.getResults(uid);
    expect(list.length).toBe(2);
    expect(list[0].encoded).toBe("b"); // newest fresh entry at the head
  });

  it("upsertProfileOnSignIn seeds the name once, refreshes picture, stamps createdAt once", async () => {
    const uid = "u3";
    expect(await store.upsertProfileOnSignIn(uid, "First", "pic1", 1000)).toBe("First");
    expect(await store.upsertProfileOnSignIn(uid, "Second", "pic2", 2000)).toBe("First");
    const h = ctx.redis!.hashes.get(`profile:${uid}`)!;
    expect(h.get("name")).toBe("First");
    expect(h.get("picture")).toBe("pic2");
    expect(Number(h.get("createdAt"))).toBe(1000);
  });

  // M14: a custom /api/profile/name handle must survive the next sign-in (new device / expiry)
  it("upsertProfileOnSignIn never reverts a custom handle to the Google name", async () => {
    const uid = "u4";
    await store.upsertProfileOnSignIn(uid, "Google", "pic", 1000);
    await store.setProfileName(uid, "Custom");
    expect(await store.upsertProfileOnSignIn(uid, "Google", "pic", 2000)).toBe("Custom");
    expect(await store.getProfileName(uid)).toBe("Custom");
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

describe("getReferralFlags", () => {
  it("reports referrer/referee membership from the referral sets", async () => {
    await ctx.redis!.sadd("ref:referrers", "alice");
    await ctx.redis!.sadd("ref:referred", "bob");
    expect(await store.getReferralFlags("alice")).toEqual({ isReferrer: true, isReferee: false });
    expect(await store.getReferralFlags("bob")).toEqual({ isReferrer: false, isReferee: true });
    expect(await store.getReferralFlags("carol")).toEqual({ isReferrer: false, isReferee: false });
  });
});
