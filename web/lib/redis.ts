import "server-only";
import { Redis } from "@upstash/redis";
import { logEvent } from "./log";
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

// The one board-read shape every leaderboard shares: total + top-100 + the caller's own row
// (in-window or looked up by rank). Upstash is HTTP, so zcard and the top read run in parallel;
// the you-lookup only costs extra round trips when the uid exists but sits below the window.
export async function readBoardView<T extends { uid: string } = StoredRow>(
  keyZ: string, keyH: string, uid?: string,
): Promise<{ total: number; top: (T & { rank: number })[]; you?: T & { rank: number } }> {
  if (!redis) return { total: 0, top: [] };
  const [total, top] = await Promise.all([redis.zcard(keyZ), readSortedRows<T>(keyZ, keyH, 0, 99)]);
  let you = uid ? top.find((r) => r.uid === uid) : undefined;
  if (uid && !you) {
    const rank = await redis.zrevrank(keyZ, uid);
    if (rank != null) {
      const meta = (await redis.hmget<Record<string, T>>(keyH, uid)) ?? {};
      const m = meta[uid];
      if (m) you = { ...m, rank: rank + 1 };
    }
  }
  return { total, top, you };
}

// Best-effort fixed-window rate limit (per bucket key). Returns true if the call is allowed.
// Self-disabling: when redis is null (local/dev without creds) it allows everything, and any
// transport error fails open — the limiter must never take down a route. Buckets stop trivial
// scripted floods (board stuffing, CPU/egress amplification) without affecting real play volume.
export async function rateLimit(bucket: string, max: number, windowSec: number): Promise<boolean> {
  if (!redis) return true;
  try {
    // INCR + EXPIRE NX in one pipeline: NX sets the TTL only when the key has none, so the window
    // is fixed from the bucket's first hit (a plain EXPIRE refreshed per call let a steady drip
    // just under the limit extend its window forever) while still healing an orphaned no-TTL key.
    const [n] = (await redis.pipeline().incr(bucket).expire(bucket, windowSec, "nx").exec()) as [number, number];
    return Number(n) <= max;
  } catch (err) {
    // fail open by design (availability > strictness for a game) — but make it VISIBLE: a burst
    // of these during a Redis outage means every limit is off across all routes simultaneously.
    logEvent("rateLimit.failopen", { bucket: bucket.split(":").slice(0, 2).join(":"), msg: err instanceof Error ? err.message : String(err) });
    return true;
  }
}

// Client IP from the proxy header (Vercel sets x-forwarded-for; leftmost entry is the client).
export function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}
