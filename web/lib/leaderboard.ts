import "server-only";
import { Redis } from "@upstash/redis";
import type { LineupResult, LeaderboardRow, LeaderboardView } from "./types";

// Daily leaderboard store (Upstash Redis sorted sets). Self-disabling: if the env vars aren't
// present, isLeaderboardEnabled() is false and every op no-ops, so the app runs fine without it.

type StoredRow = Omit<LeaderboardRow, "rank">;

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export function isLeaderboardEnabled(): boolean { return !!redis; }

const TTL = 60 * 60 * 24 * 31;                          // ~31 days, self-cleaning
const keyZ = (d: string) => `lb:${d}`;
const keyH = (d: string) => `lb:${d}:meta`;
const enc = (wins: number, net: number) => wins * 1000 + (net + 100); // wins primary, net tiebreak

async function readRows(r: Redis, date: string, start: number, stop: number): Promise<LeaderboardRow[]> {
  const z = await r.zrange<(string | number)[]>(keyZ(date), start, stop, { rev: true, withScores: true });
  const uids: string[] = [];
  for (let i = 0; i < z.length; i += 2) uids.push(String(z[i]));
  if (!uids.length) return [];
  const meta = (await r.hmget<Record<string, StoredRow>>(keyH(date), ...uids)) ?? {};
  return uids
    .map((uid, i) => { const m = meta[uid]; return m ? { ...m, rank: start + i + 1 } : null; })
    .filter((x): x is LeaderboardRow => !!x);
}

export async function getLeaderboard(date: string, uid?: string): Promise<LeaderboardView | null> {
  if (!redis) return null;
  const total = await redis.zcard(keyZ(date));
  const top = await readRows(redis, date, 0, 99);
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
  const score = enc(result.wins, result.netRtg);
  if (!Number.isFinite(score)) return getLeaderboard(date, row.uid);
  const prev = await redis.zscore(keyZ(date), row.uid);
  // keep-best: only overwrite score AND meta together when this run beats the stored one (stay consistent)
  if (prev == null || score > Number(prev)) {
    await redis.zadd(keyZ(date), { score, member: row.uid });
    await redis.hset(keyH(date), { [row.uid]: row });
    await redis.expire(keyZ(date), TTL);
    await redis.expire(keyH(date), TTL);
  }
  return getLeaderboard(date, row.uid);
}
