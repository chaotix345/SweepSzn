import { describe, it, expect } from "vitest";
import type { Redis } from "@upstash/redis";
import { createRedisFake } from "@/test/redisFake";
import { parseEvBody, bump, EV_TTL, EV_ACTIVE_CAP } from "./evServer";

// --- parseEvBody ---
describe("parseEvBody", () => {
  it("valid play parsed", () => {
    expect(parseEvBody({ ev: "play", uid: "abcdefgh", mode: "daily" })).toStrictEqual({ ev: "play", uid: "abcdefgh", mode: "daily" });
  });

  it("valid share parsed (no mode)", () => {
    expect(parseEvBody({ ev: "share", uid: "abcdefgh" })).toStrictEqual({ ev: "share", uid: "abcdefgh" });
  });

  it("non-beacon stage rejected", () => {
    expect(parseEvBody({ ev: "complete" })).toBe(null);
  });

  it("unknown ev rejected", () => {
    expect(parseEvBody({ ev: "nope" })).toBe(null);
  });

  it("non-object rejected", () => {
    expect(parseEvBody("garbage")).toBe(null);
  });

  it("malformed uid stripped", () => {
    expect(parseEvBody({ ev: "play", uid: "bad uid!" })?.uid).toBe(undefined);
  });

  it("bad mode stripped", () => {
    expect(parseEvBody({ ev: "play", uid: "abcdefgh", mode: "nope" })?.mode).toBe(undefined);
  });

  it("mode ignored for share", () => {
    expect(parseEvBody({ ev: "share", uid: "abcdefgh", mode: "daily" })?.mode).toBe(undefined);
  });

  it("visit / first_play / share_view parsed", () => {
    for (const e of ["visit", "first_play", "share_view"] as const) {
      expect(parseEvBody({ ev: e, uid: "abcdefgh" })).toStrictEqual({ ev: e, uid: "abcdefgh" });
    }
  });

  it("engagement events parsed", () => {
    for (const e of ["explore_open", "whatif_open", "compare_open", "compare_friend"] as const) {
      expect(parseEvBody({ ev: e, uid: "abcdefgh" })).toStrictEqual({ ev: e, uid: "abcdefgh" });
    }
  });

  it("server-authoritative stages are rejected from the client beacon", () => {
    expect(parseEvBody({ ev: "complete", uid: "abcdefgh" })).toBe(null);
    expect(parseEvBody({ ev: "signin", uid: "abcdefgh" })).toBe(null);
    expect(parseEvBody({ ev: "submit", uid: "abcdefgh" })).toBe(null);
  });

  it("mode is only attached for play (stripped for first_play and engagement)", () => {
    expect(parseEvBody({ ev: "first_play", uid: "abcdefgh", mode: "daily" })?.mode).toBe(undefined);
    expect(parseEvBody({ ev: "compare_open", uid: "abcdefgh", mode: "daily" })?.mode).toBe(undefined);
  });
});

// --- bump ---
describe("bump", () => {
  it("play with uid + mode: increments counters, sets, and expiries", async () => {
    const fake = createRedisFake();
    await bump(fake as unknown as Redis, "play", { uid: "abcdefgh", mode: "daily", day: "2026-6-9" });

    // play counter incremented
    expect(Number(fake.strings.get("ev:play:2026-6-9"))).toBe(1);
    // mode hash incremented
    expect(Number(fake.hashes.get("ev:mode:2026-6-9")?.get("daily"))).toBe(1);
    // uid added to active set
    expect(fake.sets.get("ev:active:2026-6-9")?.has("abcdefgh")).toBe(true);
    // totals.play incremented
    expect(Number(fake.hashes.get("ev:totals")?.get("play"))).toBe(1);
    // play key expired with EV_TTL
    expect(fake.calls.includes(`expire ev:play:2026-6-9 ${EV_TTL}`)).toBe(true);
    // active set expired with EV_TTL
    expect(fake.calls.includes(`expire ev:active:2026-6-9 ${EV_TTL}`)).toBe(true);
    // ev:totals is never expired (persistent)
    expect(fake.calls.some(c => c.startsWith("expire ev:totals"))).toBe(false);
  });

  it("complete (server stage, no uid/mode): increments counter and totals only", async () => {
    const fake = createRedisFake();
    await bump(fake as unknown as Redis, "complete", { day: "2026-6-9" });

    // complete counter incremented
    expect(Number(fake.strings.get("ev:complete:2026-6-9"))).toBe(1);
    // totals.complete incremented
    expect(Number(fake.hashes.get("ev:totals")?.get("complete"))).toBe(1);
    // complete does NOT touch active set
    expect(fake.sets.get("ev:active:2026-6-9")).toBe(undefined);
    // complete does NOT touch mode hash
    expect(fake.hashes.get("ev:mode:2026-6-9")).toBe(undefined);
  });

  it("submit with uid, no mode: increments counter and active set but not mode/submode hash", async () => {
    const fake = createRedisFake();
    await bump(fake as unknown as Redis, "submit", { uid: "abcdefgh", day: "2026-6-9" });

    // submit counter incremented
    expect(Number(fake.strings.get("ev:submit:2026-6-9"))).toBe(1);
    // submit adds uid to active set
    expect(fake.sets.get("ev:active:2026-6-9")?.has("abcdefgh")).toBe(true);
    // submit does NOT touch the play-mode hash
    expect(fake.hashes.get("ev:mode:2026-6-9")).toBe(undefined);
    // submit with no mode does NOT touch the submit-mode hash
    expect(fake.hashes.get("ev:submode:2026-6-9")).toBe(undefined);
  });

  it("submit with uid + mode: increments submode hash, counter, active set; leaves play-mode hash untouched", async () => {
    const fake = createRedisFake();
    await bump(fake as unknown as Redis, "submit", { uid: "abcdefgh", mode: "daily", day: "2026-6-9" });

    // submit counter incremented
    expect(Number(fake.strings.get("ev:submit:2026-6-9"))).toBe(1);
    // submit-mode hash incremented (distinct from the play-mode hash)
    expect(Number(fake.hashes.get("ev:submode:2026-6-9")?.get("daily"))).toBe(1);
    // uid added to active set
    expect(fake.sets.get("ev:active:2026-6-9")?.has("abcdefgh")).toBe(true);
    // the play-mode hash must NOT be written for a submit
    expect(fake.hashes.get("ev:mode:2026-6-9")).toBe(undefined);
    // submode hash carries EV_TTL
    expect(fake.calls.includes(`expire ev:submode:2026-6-9 ${EV_TTL}`)).toBe(true);
  });

  it("submit with an invalid mode: no submode hash written", async () => {
    const fake = createRedisFake();
    await bump(fake as unknown as Redis, "submit", { uid: "abcdefgh", mode: "nope", day: "2026-6-9" });
    expect(fake.hashes.get("ev:submode:2026-6-9")).toBe(undefined);
  });

  it("null redis no-ops without throwing", async () => {
    await bump(null, "play", { uid: "abcdefgh", day: "2026-6-9" });
    expect(true).toBe(true);
  });

  it("throwing redis is swallowed — bump never throws", async () => {
    const thrower = {
      incr: async () => { throw new Error("boom"); },
      sadd: async () => { throw new Error(); },
      hincrby: async () => { throw new Error(); },
      expire: async () => { throw new Error(); },
    };
    let threw = false;
    try { await bump(thrower as unknown as Redis, "complete", { day: "2026-6-9" }); } catch { threw = true; }
    expect(threw).toBe(false);
  });

  it("visit with uid: counter + totals but NOT the active set (visitors are not DAU)", async () => {
    const fake = createRedisFake();
    await bump(fake as unknown as Redis, "visit", { uid: "abcdefgh", day: "2026-6-9" });
    expect(Number(fake.strings.get("ev:visit:2026-6-9"))).toBe(1);
    expect(Number(fake.hashes.get("ev:totals")?.get("visit"))).toBe(1);
    expect(fake.sets.get("ev:active:2026-6-9")).toBe(undefined);
  });

  it("first_play with uid: counter + totals but NOT the active set (uid already active via play)", async () => {
    const fake = createRedisFake();
    await bump(fake as unknown as Redis, "first_play", { uid: "abcdefgh", day: "2026-6-9" });
    expect(Number(fake.strings.get("ev:first_play:2026-6-9"))).toBe(1);
    expect(Number(fake.hashes.get("ev:totals")?.get("first_play"))).toBe(1);
    expect(fake.sets.get("ev:active:2026-6-9")).toBe(undefined);
  });

  it("share_view with uid: counter + totals only, NOT the active set (recipients are not DAU)", async () => {
    const fake = createRedisFake();
    await bump(fake as unknown as Redis, "share_view", { uid: "abcdefgh", day: "2026-6-9" });
    expect(Number(fake.strings.get("ev:share_view:2026-6-9"))).toBe(1);
    expect(Number(fake.hashes.get("ev:totals")?.get("share_view"))).toBe(1);
    expect(fake.sets.get("ev:active:2026-6-9")).toBe(undefined);
  });

  it("engagement event (compare_friend) with uid: counter + totals, NOT the active set", async () => {
    const fake = createRedisFake();
    await bump(fake as unknown as Redis, "compare_friend", { uid: "abcdefgh", day: "2026-6-9" });
    expect(Number(fake.strings.get("ev:compare_friend:2026-6-9"))).toBe(1);
    expect(Number(fake.hashes.get("ev:totals")?.get("compare_friend"))).toBe(1);
    expect(fake.sets.get("ev:active:2026-6-9")).toBe(undefined);
  });

  it("share with uid: still added to the active set (allow-list preserved)", async () => {
    const fake = createRedisFake();
    await bump(fake as unknown as Redis, "share", { uid: "abcdefgh", day: "2026-6-9" });
    expect(fake.sets.get("ev:active:2026-6-9")?.has("abcdefgh")).toBe(true);
  });

  it("active-set cap skips sadd once the set is full (memory-exhaustion guard)", async () => {
    const fake = createRedisFake();
    // pretend today's active set is already at the cap
    fake.scard = async () => EV_ACTIVE_CAP;
    await bump(fake as unknown as Redis, "play", { uid: "abcdefgh", day: "2026-6-9" });

    // counter still increments at the active-set cap
    expect(Number(fake.strings.get("ev:play:2026-6-9"))).toBe(1);
    // sadd skipped when active set is at the cap
    expect(fake.sets.get("ev:active:2026-6-9")).toBe(undefined);
  });
});
