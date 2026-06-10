import "server-only";
import { redis, isRedisEnabled, TTL, readSortedRows } from "./redis";
import type { FhRow, FhBoardRow, FhBoardView } from "./factorHunt";

// Factor Hunt daily board (Upstash sorted set + meta hash, lb:fh:* — new keys only).
// Daily-only: FH wins carry a cosmetic ×1.05 and must never bleed into the weekly/all-time
// aggregates, so there is no Lua delta path here — plain keep-best like the anon daily submit.
// Self-disabling via the shared redis module.

const keyZ = (d: string) => `lb:fh:${d}`;
const keyH = (d: string) => `lb:fh:${d}:meta`;

export function isFhBoardEnabled(): boolean { return isRedisEnabled(); }

export async function getFhLeaderboard(date: string, uid?: string): Promise<FhBoardView | null> {
  if (!redis) return null;
  const total = await redis.zcard(keyZ(date));
  const top = await readSortedRows<FhRow>(keyZ(date), keyH(date), 0, 99);
  let you: FhBoardRow | undefined;
  if (uid) {
    const rank = await redis.zrevrank(keyZ(date), uid);
    if (rank != null) {
      const inTop = top.find((r) => r.uid === uid);
      if (inTop) you = inTop;
      else {
        const meta = (await redis.hmget<Record<string, FhRow>>(keyH(date), uid)) ?? {};
        const m = meta[uid];
        if (m) you = { ...m, rank: rank + 1 };
      }
    }
  }
  return { date, total, top, you };
}

export async function submitFhScore(date: string, row: FhRow, sortScore: number): Promise<FhBoardView | null> {
  if (!redis) return null;
  if (!Number.isFinite(sortScore)) return getFhLeaderboard(date, row.uid);
  const prev = await redis.zscore(keyZ(date), row.uid);
  // keep-best: score AND meta only move together when this run beats the stored one
  if (prev == null || sortScore > Number(prev)) {
    await redis.zadd(keyZ(date), { score: sortScore, member: row.uid });
    await redis.hset(keyH(date), { [row.uid]: row });
    await redis.expire(keyZ(date), TTL);
    await redis.expire(keyH(date), TTL);
  }
  return getFhLeaderboard(date, row.uid);
}

// Claim cleanup: drop an anon row when the same player re-submits signed-in (mirrors daily).
export async function removeFhEntry(date: string, uid: string): Promise<void> {
  if (!redis) return;
  await redis.zrem(keyZ(date), uid);
  await redis.hdel(keyH(date), uid);
}
