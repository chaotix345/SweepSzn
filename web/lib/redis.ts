import "server-only";
import { Redis } from "@upstash/redis";
import type { LeaderboardRow } from "./types";

// Shared Upstash Redis client + helpers for all leaderboard-style features (Daily board,
// H2H challenge board). Self-disabling: if the env vars aren't present, `redis` is null,
// isRedisEnabled() is false, and helpers no-op so the app runs fine without Redis.

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;
export function isRedisEnabled(): boolean { return !!redis; }

export const TTL = 60 * 60 * 24 * 31;                         // ~31 days, self-cleaning
export const encScore = (wins: number, net: number) => wins * 1000 + (net + 100); // wins primary, net tiebreak

export type StoredRow = Omit<LeaderboardRow, "rank">;

// zrange(rev, withScores) -> hmget meta -> merge with 1-based rank. Generic over the
// sorted-set + hash key pair so any feature (lb:<date>, chal:<id>) can reuse it.
export async function readSortedRows(keyZ: string, keyH: string, start: number, stop: number): Promise<LeaderboardRow[]> {
  if (!redis) return [];
  const z = await redis.zrange<(string | number)[]>(keyZ, start, stop, { rev: true, withScores: true });
  const uids: string[] = [];
  for (let i = 0; i < z.length; i += 2) uids.push(String(z[i]));
  if (!uids.length) return [];
  const meta = (await redis.hmget<Record<string, StoredRow>>(keyH, ...uids)) ?? {};
  return uids
    .map((uid, i) => { const m = meta[uid]; return m ? { ...m, rank: start + i + 1 } : null; })
    .filter((x): x is LeaderboardRow => !!x);
}
