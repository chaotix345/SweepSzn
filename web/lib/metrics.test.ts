import { describe, it, expect } from "vitest";
import { getMetrics, pct, intersectCount, bucketWins, sparkline } from "./metrics";
import type { Redis } from "@upstash/redis";
import { createRedisFake } from "@/test/redisFake";

// --- pure helpers ---
describe("pct", () => {
  it("guards divide-by-zero → 0 (not NaN)", () => {
    expect(pct(0, 0)).toBe(0);
  });
  it("pct basic", () => {
    expect(pct(1, 4)).toBe(0.25);
  });
});

describe("intersectCount", () => {
  it("counts shared members", () => {
    expect(intersectCount(["a", "b", "c"], ["b", "c", "d"])).toBe(2);
  });
  it("empty", () => {
    expect(intersectCount([], ["a"])).toBe(0);
  });
});

describe("bucketWins", () => {
  const buckets = bucketWins([82, 75, 65, 50, 80]);
  it("78-82", () => {
    expect(buckets.find(b => b.label === "78-82")!.count).toBe(2);
  });
  it("<60", () => {
    expect(buckets.find(b => b.label === "<60")!.count).toBe(1);
  });
});

describe("sparkline", () => {
  it("sparkline empty", () => {
    expect(sparkline([])).toBe("");
  });
  it("maps max to full block", () => {
    expect(sparkline([0, 10]).length).toBe(2);
    expect(sparkline([0, 10])[1]).toBe("█");
  });
});

// --- getMetrics against a fake redis ---
// 3-day window ending 2026-06-09 → days asc: 2026-6-7, 2026-6-8, 2026-6-9
describe("getMetrics", () => {
  const now = new Date("2026-06-09T12:00:00Z");

  const counters: Record<string, number> = {
    "ev:visit:2026-6-7": 500, "ev:visit:2026-6-8": 600, "ev:visit:2026-6-9": 400,        // Σ 1500
    "ev:first_play:2026-6-7": 50, "ev:first_play:2026-6-8": 60, "ev:first_play:2026-6-9": 40, // Σ 150
    "ev:play:2026-6-7": 100, "ev:play:2026-6-8": 120, "ev:play:2026-6-9": 80,
    "ev:complete:2026-6-7": 60, "ev:complete:2026-6-8": 90, "ev:complete:2026-6-9": 50,
    "ev:share:2026-6-7": 12, "ev:share:2026-6-8": 18, "ev:share:2026-6-9": 10,
    "ev:share_view:2026-6-7": 5, "ev:share_view:2026-6-8": 8, "ev:share_view:2026-6-9": 2, // Σ 15
    "ev:signin:2026-6-7": 6, "ev:signin:2026-6-8": 9, "ev:signin:2026-6-9": 5,
    "ev:submit:2026-6-7": 30, "ev:submit:2026-6-8": 40, "ev:submit:2026-6-9": 20,
    "ev:explore_open:2026-6-7": 10, "ev:explore_open:2026-6-8": 12, "ev:explore_open:2026-6-9": 8, // Σ 30
    "ev:whatif_open:2026-6-7": 4, "ev:whatif_open:2026-6-8": 6, "ev:whatif_open:2026-6-9": 2,       // Σ 12
    "ev:compare_open:2026-6-7": 3, "ev:compare_open:2026-6-8": 3, "ev:compare_open:2026-6-9": 1,    // Σ 7
    "ev:compare_friend:2026-6-7": 1, "ev:compare_friend:2026-6-8": 2, "ev:compare_friend:2026-6-9": 1, // Σ 4
  };
  const setsData: Record<string, string[]> = {
    "ev:active:2026-6-7": ["u1", "u2", "u3", "u4"],
    "ev:active:2026-6-8": ["u2", "u3", "u5"],   // 2 of day7's 4 returned
    "ev:active:2026-6-9": ["u3", "u6"],         // 1 of day8's 3 returned
  };
  const hashesData: Record<string, Record<string, number>> = {
    "ev:mode:2026-6-7": { daily: 50, classic: 30, hoopiq: 15, challenge: 5 },
    "ev:mode:2026-6-8": { daily: 70, classic: 40, hoopiq: 8, challenge: 2 },
    "ev:mode:2026-6-9": { daily: 50, classic: 20, hoopiq: 8, challenge: 2 },
    "ev:submode:2026-6-7": { daily: 20, challenge: 3, factorhunt: 5 },
    "ev:submode:2026-6-8": { daily: 25, challenge: 1 },
    "ev:submode:2026-6-9": { daily: 15 },
    "ev:src:first_play:2026-6-7": { x_launch: 5, reddit: 2 },
    "ev:src:first_play:2026-6-9": { x_launch: 3 }, // same channel a 2nd day → exercises the cross-day fold
    "ev:src:visit:2026-6-8": { x_launch: 40, reddit: 10 },
    "ev:totals": { play: 300, complete: 200, share: 40, signin: 20, submit: 90 },
  };
  const zcards: Record<string, number> = { "lb:2026-6-7": 28, "lb:2026-6-8": 40, "lb:2026-6-9": 20, "lb:week:2026-W24": 96, "lb:alltime": 1234 };
  // lb:<today> withScores interleaved [member, score, …]; score = encScore(wins, net)
  const todayZEntries: [string, number][] = [["u3", 80 * 1000 + 110], ["u6", 65 * 1000 + 105]];

  function buildFake() {
    const fake = createRedisFake();

    // Populate string counters for mget
    for (const [k, v] of Object.entries(counters)) {
      fake.strings.set(k, String(v));
    }

    // Populate sets for smembers
    for (const [k, members] of Object.entries(setsData)) {
      for (const m of members) fake.sets.set(k, (fake.sets.get(k) ?? new Set<string>()).add(m));
    }
    // Re-use sadd to properly populate sets
    for (const [k, members] of Object.entries(setsData)) {
      fake.sets.delete(k);
      for (const m of members) {
        const s = fake.sets.get(k) ?? new Set<string>();
        s.add(m);
        fake.sets.set(k, s);
      }
    }

    // Populate hashes for hgetall
    for (const [k, fields] of Object.entries(hashesData)) {
      const h = new Map<string, string>();
      for (const [f, v] of Object.entries(fields)) h.set(f, String(v));
      fake.hashes.set(k, h);
    }

    // Populate today's leaderboard zset for zrange withScores
    for (const [member, score] of todayZEntries) {
      const z = fake.zsets.get("lb:2026-6-9") ?? new Map<string, number>();
      z.set(member, score);
      fake.zsets.set("lb:2026-6-9", z);
    }

    // Override zcard since we can't easily populate arbitrary-count zsets
    fake.zcard = async (k: string) => zcards[k] ?? 0;

    return fake;
  }

  it("days ascending", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.days.length).toBe(3);
    expect(m.days[0]).toBe("2026-6-7");
    expect(m.days[2]).toBe("2026-6-9");
  });

  it("funnel sums over window", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.funnel.plays).toBe(300);
    expect(m.funnel.completes).toBe(200);
    expect(m.funnel.shares).toBe(40);
  });

  it("visit + first_play sums (the top of the north-star funnel)", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.funnel.visits).toBe(1500);
    expect(m.funnel.firstPlays).toBe(150);
  });

  it("firstPlay rate = firstPlays / visits (the north star)", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(Math.abs(m.rates.firstPlay - 150 / 1500)).toBeLessThan(1e-9);
  });

  it("engagement sums (share_view + the 4 PR-#70 deep-tool opens)", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.engagement.shareViews).toBe(15);
    expect(m.engagement.exploreOpen).toBe(30);
    expect(m.engagement.whatifOpen).toBe(12);
    expect(m.engagement.compareOpen).toBe(7);
    expect(m.engagement.compareFriend).toBe(4);
  });

  it("signin/submit sums", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.funnel.signins).toBe(20);
    expect(m.funnel.submits).toBe(90);
  });

  it("completion rate = completes/plays", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(Math.abs(m.rates.completion - 200 / 300)).toBeLessThan(1e-9);
  });

  it("share rate = shares/completes", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(Math.abs(m.rates.shareRate - 40 / 200)).toBeLessThan(1e-9);
  });

  it("capture rate = signins/completes", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(Math.abs(m.rates.capture - 20 / 200)).toBeLessThan(1e-9);
  });

  it("DAU per day = active-set sizes", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.dauByDay).toStrictEqual([4, 3, 2]);
  });

  it("D1 retention = Σ(intersections)/Σ(bases) over consecutive days", async () => {
    // D1 retention: base = |day7| + |day8| = 4 + 3 = 7; returners = |7∩8| + |8∩9| = 2 + 1 = 3
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(Math.abs(m.d1 - 3 / 7)).toBeLessThan(1e-9);
  });

  it("d7 null for window < 8 days", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.d7).toBe(null);
  });

  it("mode split summed across window", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.modeSplit.daily).toBe(170);
    expect(m.modeSplit.challenge).toBe(9);
  });

  it("submit split summed across window (the per-mode play→submit numerator)", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.submitSplit.daily).toBe(60);       // 20 + 25 + 15
    expect(m.submitSplit.challenge).toBe(4);     // 3 + 1
    expect(m.submitSplit.factorhunt).toBe(5);    // 5
    expect(m.submitSplit.classic ?? 0).toBe(0);  // classic has no submit beacon
  });

  it("source split summed across window (utm acquisition; folds the same channel across days)", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.sourceSplit.firstPlay.x_launch).toBe(8); // 5 (6-7) + 3 (6-9) — the cross-day fold
    expect(m.sourceSplit.firstPlay.reddit).toBe(2);
    expect(m.sourceSplit.visit.x_launch).toBe(40);
    expect(m.sourceSplit.visit.reddit).toBe(10);
  });

  it("board ZCARD per day", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.boardByDay).toStrictEqual([28, 40, 20]);
  });

  it("board snapshot", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.boards.daily).toBe(20);
    expect(m.boards.weekly).toBe(96);
    expect(m.boards.alltime).toBe(1234);
  });

  it("today win bucket 78-82 (u3=80)", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.winBuckets.find(b => b.label === "78-82")!.count).toBe(1);
  });

  it("today win bucket 60-69 (u6=65)", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.winBuckets.find(b => b.label === "60-69")!.count).toBe(1);
  });

  it("all-time totals from ev:totals", async () => {
    const fake = buildFake();
    const m = await getMetrics(fake as unknown as Redis, { days: 3, now });
    expect(m.totals.play).toBe(300);
    expect(m.totals.submit).toBe(90);
  });

  it("null redis → zeroed metrics, no throw", async () => {
    const empty = await getMetrics(null, { days: 3, now });
    expect(empty.funnel.plays).toBe(0);
    expect(empty.funnel.visits).toBe(0);
    expect(empty.funnel.firstPlays).toBe(0);
    expect(empty.engagement.shareViews).toBe(0);
    expect(empty.engagement.compareFriend).toBe(0);
    expect(empty.rates.firstPlay).toBe(0);
    expect(empty.d1).toBe(0);
    expect(empty.days.length).toBe(3);
    expect(empty.sourceSplit.firstPlay).toStrictEqual({});
    expect(empty.sourceSplit.visit).toStrictEqual({});
  });
});
