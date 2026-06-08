import "server-only";
import { redis, isRedisEnabled, TTL, encScore, readSortedRows, type StoredRow } from "./redis";
import type { LineupResult, LeaderboardRow, LeaderboardView } from "./types";

// Daily leaderboard store (Upstash sorted sets). Self-disabling via the shared redis module.

const keyZ = (d: string) => `lb:${d}`;
const keyH = (d: string) => `lb:${d}:meta`;

export function isLeaderboardEnabled(): boolean { return isRedisEnabled(); }

export async function getLeaderboard(date: string, uid?: string): Promise<LeaderboardView | null> {
  if (!redis) return null;
  const total = await redis.zcard(keyZ(date));
  const top = await readSortedRows(keyZ(date), keyH(date), 0, 99);
  let you: LeaderboardRow | undefined;
  if (uid) {
    const rank = await redis.zrevrank(keyZ(date), uid);
    if (rank != null) {
      const inTop = top.find((r) => r.uid === uid);
      if (inTop) you = inTop;
      else {
        const meta = (await redis.hmget<Record<string, StoredRow>>(keyH(date), uid)) ?? {};
        const m = meta[uid];
        if (m) you = { ...m, rank: rank + 1 };
      }
    }
  }
  return { date, total, top, you };
}

export async function submitScore(date: string, row: StoredRow, result: LineupResult): Promise<LeaderboardView | null> {
  if (!redis) return null;
  const score = encScore(result.wins, result.netRtg);
  if (!Number.isFinite(score)) return getLeaderboard(date, row.uid);
  const prev = await redis.zscore(keyZ(date), row.uid);
  // keep-best: only overwrite score AND meta together when this run beats the stored one
  if (prev == null || score > Number(prev)) {
    await redis.zadd(keyZ(date), { score, member: row.uid });
    await redis.hset(keyH(date), { [row.uid]: row });
    await redis.expire(keyZ(date), TTL);
    await redis.expire(keyH(date), TTL);
  }
  return getLeaderboard(date, row.uid);
}
