import type { Redis } from "@upstash/redis";
import { decodeWins } from "./score";
import { isoWeek } from "./isoweek";
import { recentDays } from "./day";

export interface Metrics {
  days: string[];                              // ascending date-keys
  funnel: { visits: number; firstPlays: number; plays: number; completes: number; shares: number; signins: number; submits: number };
  engagement: { shareViews: number; exploreOpen: number; whatifOpen: number; compareOpen: number; compareFriend: number; claimNudgeShown: number; claimNudgeTap: number };
  rates: { firstPlay: number; completion: number; shareRate: number; capture: number }; // 0..1
  dauByDay: number[];                          // distinct active uids per day (ascending)
  d1: number;                                  // next-day return rate, 0..1
  d7: number | null;                           // 7-day return rate, null if window < 8
  modeSplit: Record<string, number>;           // mode → play count over the window
  submitSplit: Record<string, number>;         // mode → submit count over the window (play→submit numerator)
  nudgeSplit: { shown: Record<string, number>; tap: Record<string, number> }; // mode → sign-in-nudge shown/tap count
  sourceSplit: { firstPlay: Record<string, number>; visit: Record<string, number> }; // utm source → count
  boardByDay: number[];                        // ZCARD lb:<day> (ascending)
  boards: { daily: number; weekly: number; alltime: number };
  winBuckets: { label: string; count: number }[]; // this week's leaderboard win distribution
  totals: Record<string, number>;              // all-time ev:totals
}

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const pct = (a: number, b: number): number => (b > 0 ? a / b : 0);
export const intersectCount = (a: string[], b: string[]): number => {
  const s = new Set(a); let c = 0; for (const x of b) if (s.has(x)) c++; return c;
};

// Fold a window of per-day source hashes (ev:src:<stage>:<day>) into one label→total map.
const foldHashes = (hashes: (Record<string, string | number> | null)[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const h of hashes) if (h) for (const [k, v] of Object.entries(h)) out[k] = (out[k] ?? 0) + num(v);
  return out;
};

const WIN_BUCKETS = [
  { label: "78-82", min: 78, max: 82 },
  { label: "70-77", min: 70, max: 77 },
  { label: "60-69", min: 60, max: 69 },
  { label: "<60", min: 0, max: 59 },
];
export const bucketWins = (wins: number[]): { label: string; count: number }[] =>
  WIN_BUCKETS.map(b => ({ label: b.label, count: wins.filter(w => w >= b.min && w <= b.max).length }));

const SPARK = "▁▂▃▄▅▆▇█";
export const sparkline = (vals: number[]): string => {
  if (!vals.length) return "";
  const max = Math.max(...vals, 1);
  return vals.map(v => SPARK[Math.min(SPARK.length - 1, Math.floor((v / max) * (SPARK.length - 1)))]).join("");
};

// Read order is irrelevant — counts are indexed back by stage name below.
const STAGES = [
  "visit", "first_play", "play", "complete", "share", "share_view", "signin", "submit",
  "explore_open", "whatif_open", "compare_open", "compare_friend",
  "claim_nudge_shown", "claim_nudge_tap",
] as const;

export async function getMetrics(redis: Redis | null, opts: { days?: number; now?: Date } = {}): Promise<Metrics> {
  const n = opts.days ?? 14;
  const days = recentDays(n, opts.now).slice().reverse(); // ascending: oldest … today
  const today = days[days.length - 1];

  if (!redis) {
    return {
      days,
      funnel: { visits: 0, firstPlays: 0, plays: 0, completes: 0, shares: 0, signins: 0, submits: 0 },
      engagement: { shareViews: 0, exploreOpen: 0, whatifOpen: 0, compareOpen: 0, compareFriend: 0, claimNudgeShown: 0, claimNudgeTap: 0 },
      rates: { firstPlay: 0, completion: 0, shareRate: 0, capture: 0 },
      dauByDay: days.map(() => 0), d1: 0, d7: null, modeSplit: {}, submitSplit: {},
      nudgeSplit: { shown: {}, tap: {} },
      sourceSplit: { firstPlay: {}, visit: {} },
      boardByDay: days.map(() => 0), boards: { daily: 0, weekly: 0, alltime: 0 },
      winBuckets: bucketWins([]), totals: {},
    };
  }

  const [counts, modeHashes, submodeHashes, nudgeShownHashes, nudgeTapHashes, srcFpHashes, srcVisitHashes, activeSets, boardCards, weekZ, totalsHash, weekCard, allCard] = await Promise.all([
    Promise.all(STAGES.map(s => redis.mget<(string | number | null)[]>(...days.map(d => `ev:${s}:${d}`)))),
    Promise.all(days.map(d => redis.hgetall<Record<string, string | number>>(`ev:mode:${d}`))),
    Promise.all(days.map(d => redis.hgetall<Record<string, string | number>>(`ev:submode:${d}`))),
    Promise.all(days.map(d => redis.hgetall<Record<string, string | number>>(`ev:nudge:claim_nudge_shown:${d}`))),
    Promise.all(days.map(d => redis.hgetall<Record<string, string | number>>(`ev:nudge:claim_nudge_tap:${d}`))),
    Promise.all(days.map(d => redis.hgetall<Record<string, string | number>>(`ev:src:first_play:${d}`))),
    Promise.all(days.map(d => redis.hgetall<Record<string, string | number>>(`ev:src:visit:${d}`))),
    Promise.all(days.map(d => redis.smembers(`ev:active:${d}`))),
    Promise.all(days.map(d => redis.zcard(`lb:${d}`))),
    redis.zrange<(string | number)[]>(`lb:week:${isoWeek(today)}`, 0, -1, { withScores: true }),
    redis.hgetall<Record<string, string | number>>("ev:totals"),
    redis.zcard(`lb:week:${isoWeek(today)}`),
    redis.zcard("lb:alltime"),
  ]);

  const sumDays = (arr: (string | number | null)[]) => arr.reduce<number>((a, v) => a + num(v), 0);
  const byStage: Record<(typeof STAGES)[number], number> = Object.fromEntries(
    STAGES.map((s, i) => [s, sumDays(counts[i])]),
  ) as Record<(typeof STAGES)[number], number>;
  const funnel = {
    visits: byStage.visit, firstPlays: byStage.first_play, plays: byStage.play,
    completes: byStage.complete, shares: byStage.share, signins: byStage.signin, submits: byStage.submit,
  };
  const engagement = {
    shareViews: byStage.share_view, exploreOpen: byStage.explore_open, whatifOpen: byStage.whatif_open,
    compareOpen: byStage.compare_open, compareFriend: byStage.compare_friend,
    claimNudgeShown: byStage.claim_nudge_shown, claimNudgeTap: byStage.claim_nudge_tap,
  };
  const rates = {
    firstPlay: pct(funnel.firstPlays, funnel.visits),
    completion: pct(funnel.completes, funnel.plays),
    shareRate: pct(funnel.shares, funnel.completes),
    capture: pct(funnel.signins, funnel.completes),
  };

  const active = activeSets as string[][];
  const dauByDay = active.map(s => s.length);
  let baseSum = 0, retSum = 0, base7 = 0, ret7 = 0;
  for (let i = 0; i + 1 < active.length; i++) { baseSum += active[i].length; retSum += intersectCount(active[i], active[i + 1]); }
  for (let i = 0; i + 7 < active.length; i++) { base7 += active[i].length; ret7 += intersectCount(active[i], active[i + 7]); }
  const d1 = pct(retSum, baseSum);
  const d7 = days.length >= 8 && base7 > 0 ? pct(ret7, base7) : null;

  const modeSplit: Record<string, number> = {};
  for (const h of modeHashes) if (h) for (const [k, v] of Object.entries(h)) modeSplit[k] = (modeSplit[k] ?? 0) + num(v);
  const submitSplit: Record<string, number> = {};
  for (const h of submodeHashes) if (h) for (const [k, v] of Object.entries(h)) submitSplit[k] = (submitSplit[k] ?? 0) + num(v);
  const nudgeSplit = { shown: foldHashes(nudgeShownHashes), tap: foldHashes(nudgeTapHashes) };
  const sourceSplit = { firstPlay: foldHashes(srcFpHashes), visit: foldHashes(srcVisitHashes) };

  const wins: number[] = [];
  for (let i = 1; i < weekZ.length; i += 2) wins.push(decodeWins(num(weekZ[i])));

  const boardByDay = (boardCards as number[]).map(num);
  return {
    days, funnel, engagement, rates, dauByDay, d1, d7, modeSplit, submitSplit, nudgeSplit, sourceSplit, boardByDay,
    boards: { daily: boardByDay[boardByDay.length - 1] ?? 0, weekly: num(weekCard), alltime: num(allCard) },
    winBuckets: bucketWins(wins),
    totals: Object.fromEntries(Object.entries(totalsHash ?? {}).map(([k, v]) => [k, num(v)])),
  };
}
