import "server-only";
import { createHash } from "node:crypto";
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

// One immutable prediction lock per (uid, lineup) per day. The FIRST submission of a lineup
// locks its prediction — including a skip (the result card reveals the factor breakdown, so an
// unlocked replay of the same lineup could walk the four choices via direct POSTs until
// correct=true lands the ×1.05 through keep-best). SET NX makes the lock write-once, so there
// is no read-modify-write race to reset it; a NEW lineup (legit re-draft) locks fresh.
// Returns the prediction to grade: the requested one when this lineup is first seen, the locked
// one (null when the lock recorded a skip) otherwise.
const keyPred = (d: string, uid: string, lineup: string) =>
  `lb:fh:${d}:pred:${uid}:${createHash("sha256").update(lineup).digest("hex").slice(0, 16)}`;

export async function lockFhPrediction(date: string, uid: string, lineup: string, requested: string | null): Promise<string | null> {
  if (!redis) return requested;
  const key = keyPred(date, uid, lineup);
  const claimed = await redis.set(key, requested ?? "", { nx: true, ex: TTL });
  if (claimed) return requested;
  const locked = await redis.get<string>(key);
  return locked || null; // "" = a locked skip
}

// Claim cleanup: drop an anon row when the same player re-submits signed-in (mirrors daily).
export async function removeFhEntry(date: string, uid: string): Promise<void> {
  if (!redis) return;
  await redis.zrem(keyZ(date), uid);
  await redis.hdel(keyH(date), uid);
}
