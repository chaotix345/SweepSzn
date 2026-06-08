import "server-only";
import { Redis } from "@upstash/redis";
import type { LeaderboardRow } from "./types";

// Shared Upstash Redis client + helpers for all leaderboard-style features (Daily board,
// weekly/all-time boards, H2H challenge board). Self-disabling: if the env vars aren't present,
// `redis` is null, isRedisEnabled() is false, and helpers no-op so the app runs fine without Redis.

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;
export function isRedisEnabled(): boolean { return !!redis; }

export const TTL = 60 * 60 * 24 * 31;                         // ~31 days, self-cleaning (daily + challenge)
export const TTL_WEEK = 60 * 60 * 24 * 35;                    // ~5 weeks of weekly history (all-time has no TTL)
export { encScore, decodeWins } from "./score";              // pure helpers (testable without server-only)

export type StoredRow = Omit<LeaderboardRow, "rank">;

// zrange(rev, withScores) -> hmget meta -> merge with 1-based rank. Generic over the meta row type
// so daily/challenge (StoredRow, with lineup) and weekly/all-time (AggRow, wins-only) can reuse it.
export async function readSortedRows<T extends { uid: string } = StoredRow>(
  keyZ: string, keyH: string, start: number, stop: number,
): Promise<(T & { rank: number })[]> {
  if (!redis) return [];
  const z = await redis.zrange<(string | number)[]>(keyZ, start, stop, { rev: true, withScores: true });
  const uids: string[] = [];
  for (let i = 0; i < z.length; i += 2) uids.push(String(z[i]));
  if (!uids.length) return [];
  const meta = (await redis.hmget<Record<string, T>>(keyH, ...uids)) ?? {};
  return uids
    .map((uid, i) => { const m = meta[uid]; return m ? { ...m, rank: start + i + 1 } : null; })
    .filter((x): x is T & { rank: number } => !!x);
}
