import "server-only";
import { redis, isRedisEnabled, TTL, TTL_WEEK, encScore, readBoardView, type StoredRow } from "./redis";
import { isoWeek } from "./isoweek";
import { KEEP_BEST_LUA, KEEP_BEST_ROW_LUA, TRIM_BOARD_LUA } from "./score";
import type { LineupResult, LeaderboardView } from "./types";

// Daily leaderboard store (Upstash sorted sets) + weekly/all-time aggregate boards.
// Self-disabling via the shared redis module.

const keyZ = (d: string) => `lb:${d}`;
const keyH = (d: string) => `lb:${d}:meta`;
export const keyWeekZ = (w: string) => `lb:week:${w}`;
export const keyWeekH = (w: string) => `lb:week:${w}:meta`;
export const keyAlltimeZ = () => "lb:alltime";
export const keyAlltimeH = () => "lb:alltime:meta";

// The all-time board has no TTL, so it is the one pair that would grow forever. Far above any
// plausible signed-in player count; only the lowest scorers are evicted once it's crossed.
export const ALLTIME_CAP = 10_000;

export function isLeaderboardEnabled(): boolean { return isRedisEnabled(); }

export async function getLeaderboard(date: string, uid?: string): Promise<LeaderboardView | null> {
  if (!redis) return null;
  const { total, top, you } = await readBoardView<StoredRow>(keyZ(date), keyH(date), uid);
  return { date, total, top, you };
}

export async function submitScore(date: string, row: StoredRow, result: LineupResult): Promise<LeaderboardView | null> {
  if (!redis) return null;
  const score = encScore(result.wins, result.netRtg);
  if (!Number.isFinite(score)) return getLeaderboard(date, row.uid);
  // atomic keep-best (shared KEEP_BEST_ROW_LUA): score and meta move together, so a two-tab race
  // can no longer install a worse run's meta under the better score. The script refreshes TTLs on
  // write; refresh on the no-improve path too so a repeat submit keeps the day's keys alive.
  const written = (await redis.eval(
    KEEP_BEST_ROW_LUA,
    [keyZ(date), keyH(date)],
    [row.uid, score, JSON.stringify(row), TTL],
  )) as number;
  if (!written) await redis.pipeline().expire(keyZ(date), TTL).expire(keyH(date), TTL).exec();
  return getLeaderboard(date, row.uid);
}

// Claim cleanup: drop a uid's row entirely (used when a signed-in user had posted anonymously today).
export async function removeEntry(date: string, uid: string): Promise<void> {
  if (!redis) return;
  await redis.pipeline().zrem(keyZ(date), uid).hdel(keyH(date), uid).exec();
}

// --- Weekly + all-time (signed-in submitters only) ---

// Authed submit: daily keep-best AND credit the win delta to this week + all-time, via the atomic
// KEEP_BEST_LUA (see score.ts). Returns the daily view for the submitter.
export async function submitScoreAuthed(date: string, row: StoredRow, result: LineupResult): Promise<LeaderboardView | null> {
  if (!redis) return null;
  const score = encScore(result.wins, result.netRtg);
  if (!Number.isFinite(score)) return getLeaderboard(date, row.uid);
  const week = isoWeek(date);
  const [changed, , ww, aw] = (await redis.eval(
    KEEP_BEST_LUA,
    [keyZ(date), keyWeekZ(week), keyAlltimeZ()],
    [row.uid, score, result.wins, TTL, TTL_WEEK],
  )) as [number, number, number, number];
  if (changed) {
    // agg meta is display-only (the sorted-set score is authoritative for ranking). Refresh it
    // whenever the daily best changes — incl. a net-only (delta 0) improvement — so the display
    // name stays current. ww/aw are the current totals returned by the Lua in both branches.
    // One pipeline: Upstash is HTTP, so these five writes were five sequential round trips.
    await redis.pipeline()
      .hset(keyH(date), { [row.uid]: row })
      .expire(keyH(date), TTL)
      .hset(keyWeekH(week), { [row.uid]: { uid: row.uid, name: row.name, wins: ww } })
      .hset(keyAlltimeH(), { [row.uid]: { uid: row.uid, name: row.name, wins: aw } })
      .expire(keyWeekH(week), TTL_WEEK) // all-time meta: persistent, no expire
      .exec();
    // the all-time pair has no TTL — cap it so it can't grow unboundedly (O(1) until full)
    await redis.eval(TRIM_BOARD_LUA, [keyAlltimeZ(), keyAlltimeH()], [ALLTIME_CAP]);
  }
  return getLeaderboard(date, row.uid);
}
