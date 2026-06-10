import "server-only";
import { createHash } from "node:crypto";
import { redis, isRedisEnabled, TTL, readSortedRows } from "./redis";
import type { SurgeonRow, SurgeonBoardRow, SurgeonBoardView } from "./surgeon";

// Surgeon daily board (Upstash sorted set + meta hash, lb:surgeon:* — new keys only).
// Daily-only: the delta score is a different unit from wins and must never bleed into the
// weekly/all-time aggregates, so there is no Lua delta path — plain keep-best like FH/BP.
// Self-disabling via the shared redis module.

const keyZ = (d: string) => `lb:surgeon:${d}`;
const keyH = (d: string) => `lb:surgeon:${d}:meta`;

export function isSurgeonBoardEnabled(): boolean { return isRedisEnabled(); }

export async function getSurgeonLeaderboard(date: string, uid?: string): Promise<SurgeonBoardView | null> {
  if (!redis) return null;
  const total = await redis.zcard(keyZ(date));
  const top = await readSortedRows<SurgeonRow>(keyZ(date), keyH(date), 0, 99);
  let you: SurgeonBoardRow | undefined;
  if (uid) {
    const rank = await redis.zrevrank(keyZ(date), uid);
    if (rank != null) {
      const inTop = top.find((r) => r.uid === uid);
      if (inTop) you = inTop;
      else {
        const meta = (await redis.hmget<Record<string, SurgeonRow>>(keyH(date), uid)) ?? {};
        const m = meta[uid];
        if (m) you = { ...m, rank: rank + 1 };
      }
    }
  }
  return { date, total, top, you };
}

export async function submitSurgeonScore(date: string, row: SurgeonRow, sortScore: number): Promise<SurgeonBoardView | null> {
  if (!redis) return null;
  if (!Number.isFinite(sortScore)) return getSurgeonLeaderboard(date, row.uid);
  const prev = await redis.zscore(keyZ(date), row.uid);
  // keep-best: score AND meta only move together when this run beats the stored one
  if (prev == null || sortScore > Number(prev)) {
    await redis.zadd(keyZ(date), { score: sortScore, member: row.uid });
    await redis.hset(keyH(date), { [row.uid]: row });
    await redis.expire(keyZ(date), TTL);
    await redis.expire(keyH(date), TTL);
  }
  return getSurgeonLeaderboard(date, row.uid);
}

// One immutable swap lock per (uid, lineup) per day — the Factor Hunt prediction-lock pattern.
// The FIRST submission of a lineup locks its swap: the submit response reveals the delta, so an
// unlocked replay of the same five could walk all 3×5 swap combos through keep-best until the
// optimum landed (the spec's brute-force hole). SET NX makes the lock write-once with no
// read-modify-write race; a NEW lineup (legit re-draft) locks fresh. Returns the swap to grade:
// the requested one when this lineup is first seen, the locked one otherwise.
const keySwap = (d: string, uid: string, lineup: string) =>
  `lb:surgeon:${d}:swap:${uid}:${createHash("sha256").update(lineup).digest("hex").slice(0, 16)}`;

export async function lockSurgeonSwap(
  date: string, uid: string, lineup: string, requested: { outId: string; inId: string },
): Promise<{ outId: string; inId: string }> {
  if (!redis) return requested;
  const key = keySwap(date, uid, lineup);
  const claimed = await redis.set(key, `${requested.outId}>${requested.inId}`, { nx: true, ex: TTL });
  if (claimed) return requested;
  const locked = await redis.get<string>(key);
  const [outId, inId] = (locked ?? "").split(">");
  return outId && inId ? { outId, inId } : requested;
}

// Claim cleanup: drop an anon row when the same player re-submits signed-in (mirrors daily/FH/BP).
export async function removeSurgeonEntry(date: string, uid: string): Promise<void> {
  if (!redis) return;
  await redis.zrem(keyZ(date), uid);
  await redis.hdel(keyH(date), uid);
}
