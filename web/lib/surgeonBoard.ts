import "server-only";
import { createHash } from "node:crypto";
import { redis, isRedisEnabled, TTL, readSortedRows } from "./redis";
import { BP_KEEP_BEST_LUA } from "./blueprintLua";
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
  // atomic keep-best (the bp boards' script — generic zset+meta semantics): compare, score, meta
  // row, and TTLs in ONE script, so a concurrent same-uid submit from a second tab (different
  // lineup → different sortScore) can't install its meta row under the winner's score.
  await redis.eval(BP_KEEP_BEST_LUA, [keyZ(date), keyH(date)], [row.uid, sortScore, JSON.stringify(row), TTL]);
  return getSurgeonLeaderboard(date, row.uid);
}

// Cross-lineup score-shopping cap: the per-lineup swap lock seals the 3x5 combo walk for ONE
// five, but a fresh lock per redraft + keep-best still lets a determined uid shop many valid
// lineups a day (each must pass verifyTrace, so this is a patience attack, not a script-kiddie
// one — review finding, medium). Cap fresh-lineup submissions per uid per day; generous enough
// that honest replayers never see it. The route rejects past the cap BEFORE any board write.
export const SURGEON_DAILY_CAP = 10;
export async function bumpSurgeonSubs(date: string, uid: string): Promise<number> {
  if (!redis) return 0;
  const k = `lb:surgeon:${date}:subs:${uid}`;
  const n = await redis.incr(k);
  await redis.expire(k, TTL);
  return n;
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
): Promise<{ outId: string; inId: string; claimed: boolean }> {
  if (!redis) return { ...requested, claimed: false };
  const key = keySwap(date, uid, lineup);
  const val = `${requested.outId}>${requested.inId}`;
  const claimed = await redis.set(key, val, { nx: true, ex: TTL });
  if (claimed) return { ...requested, claimed: true };
  const locked = await redis.get<string>(key);
  const [outId, inId] = (locked ?? "").split(">");
  if (outId && inId) return { outId, inId, claimed: false };
  // the lock vanished between NX and GET (expiry/eviction edge) — re-claim it with the swap
  // being graded rather than silently bypassing write-once
  await redis.set(key, val, { ex: TTL });
  return { ...requested, claimed: true };
}

// Undo a just-claimed lock when the submit is rejected for a non-swap reason (daily cap): the
// lineup must not stay bricked behind a lock that never produced a row.
export async function releaseSurgeonSwap(date: string, uid: string, lineup: string): Promise<void> {
  if (!redis) return;
  await redis.del(keySwap(date, uid, lineup));
}

// Claim cleanup: drop an anon row when the same player re-submits signed-in (mirrors daily/FH/BP).
export async function removeSurgeonEntry(date: string, uid: string): Promise<void> {
  if (!redis) return;
  await redis.zrem(keyZ(date), uid);
  await redis.hdel(keyH(date), uid);
}
