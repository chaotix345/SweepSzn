import { getMetrics, pct, intersectCount, bucketWins, sparkline } from "./metrics";
import type { Redis } from "@upstash/redis";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// --- pure helpers ---
assert(pct(0, 0) === 0, "pct guards divide-by-zero → 0 (not NaN)");
assert(pct(1, 4) === 0.25, "pct basic");
assert(intersectCount(["a", "b", "c"], ["b", "c", "d"]) === 2, "intersectCount counts shared members");
assert(intersectCount([], ["a"]) === 0, "intersectCount empty");
const buckets = bucketWins([82, 75, 65, 50, 80]);
assert(buckets.find(b => b.label === "78-82")!.count === 2, "bucketWins 78-82");
assert(buckets.find(b => b.label === "<60")!.count === 1, "bucketWins <60");
assert(sparkline([]) === "", "sparkline empty");
assert(sparkline([0, 10]).length === 2 && sparkline([0, 10])[1] === "█", "sparkline maps max to full block");

// --- getMetrics against a fake redis ---
// 3-day window ending 2026-06-09 → days asc: 2026-6-7, 2026-6-8, 2026-6-9
const now = new Date("2026-06-09T12:00:00Z");
const counters: Record<string, number> = {
  "ev:play:2026-6-7": 100, "ev:play:2026-6-8": 120, "ev:play:2026-6-9": 80,
  "ev:complete:2026-6-7": 60, "ev:complete:2026-6-8": 90, "ev:complete:2026-6-9": 50,
  "ev:share:2026-6-7": 12, "ev:share:2026-6-8": 18, "ev:share:2026-6-9": 10,
  "ev:signin:2026-6-7": 6, "ev:signin:2026-6-8": 9, "ev:signin:2026-6-9": 5,
  "ev:submit:2026-6-7": 30, "ev:submit:2026-6-8": 40, "ev:submit:2026-6-9": 20,
};
const sets: Record<string, string[]> = {
  "ev:active:2026-6-7": ["u1", "u2", "u3", "u4"],
  "ev:active:2026-6-8": ["u2", "u3", "u5"],   // 2 of day7's 4 returned
  "ev:active:2026-6-9": ["u3", "u6"],         // 1 of day8's 3 returned
};
const hashes: Record<string, Record<string, number>> = {
  "ev:mode:2026-6-7": { daily: 50, classic: 30, hoopiq: 15, challenge: 5 },
  "ev:mode:2026-6-8": { daily: 70, classic: 40, hoopiq: 8, challenge: 2 },
  "ev:mode:2026-6-9": { daily: 50, classic: 20, hoopiq: 8, challenge: 2 },
  "ev:totals": { play: 300, complete: 200, share: 40, signin: 20, submit: 90 },
};
const zsets: Record<string, (string | number)[]> = {
  // lb:<today> withScores interleaved [member, score, …]; score = encScore(wins, net)
  "lb:2026-6-9": ["u3", 80 * 1000 + 110, "u6", 65 * 1000 + 105],
};
const zcards: Record<string, number> = { "lb:2026-6-7": 28, "lb:2026-6-8": 40, "lb:2026-6-9": 20, "lb:week:2026-W24": 96, "lb:alltime": 1234 };

const fake = {
  mget: async (...keys: string[]) => keys.map(k => counters[k] ?? null),
  smembers: async (k: string) => sets[k] ?? [],
  hgetall: async (k: string) => hashes[k] ?? null,
  zcard: async (k: string) => zcards[k] ?? 0,
  zrange: async (k: string) => zsets[k] ?? [],
} as unknown as Redis;

(async () => {
  const m = await getMetrics(fake, { days: 3, now });
  assert(m.days.length === 3 && m.days[0] === "2026-6-7" && m.days[2] === "2026-6-9", "days ascending");
  assert(m.funnel.plays === 300 && m.funnel.completes === 200 && m.funnel.shares === 40, "funnel sums over window");
  assert(m.funnel.signins === 20 && m.funnel.submits === 90, "signin/submit sums");
  assert(Math.abs(m.rates.completion - 200 / 300) < 1e-9, "completion rate = completes/plays");
  assert(Math.abs(m.rates.shareRate - 40 / 200) < 1e-9, "share rate = shares/completes");
  assert(Math.abs(m.rates.capture - 20 / 200) < 1e-9, "capture rate = signins/completes");
  assert(JSON.stringify(m.dauByDay) === JSON.stringify([4, 3, 2]), "DAU per day = active-set sizes");
  // D1 retention: base = |day7| + |day8| = 4 + 3 = 7; returners = |7∩8| + |8∩9| = 2 + 1 = 3
  assert(Math.abs(m.d1 - 3 / 7) < 1e-9, "D1 retention = Σ(intersections)/Σ(bases) over consecutive days");
  assert(m.d7 === null, "d7 null for window < 8 days");
  assert(m.modeSplit.daily === 170 && m.modeSplit.challenge === 9, "mode split summed across window");
  assert(JSON.stringify(m.boardByDay) === JSON.stringify([28, 40, 20]), "board ZCARD per day");
  assert(m.boards.daily === 20 && m.boards.weekly === 96 && m.boards.alltime === 1234, "board snapshot");
  assert(m.winBuckets.find(b => b.label === "78-82")!.count === 1, "today win bucket 78-82 (u3=80)");
  assert(m.winBuckets.find(b => b.label === "60-69")!.count === 1, "today win bucket 60-69 (u6=65)");
  assert(m.totals.play === 300 && m.totals.submit === 90, "all-time totals from ev:totals");

  // null redis → safe empty
  const empty = await getMetrics(null, { days: 3, now });
  assert(empty.funnel.plays === 0 && empty.d1 === 0 && empty.days.length === 3, "null redis → zeroed metrics, no throw");

  console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL METRICS CHECKS PASSED");
  process.exit(fail ? 1 : 0);
})();
