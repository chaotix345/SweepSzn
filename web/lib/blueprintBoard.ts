import "server-only";
import { redis, isRedisEnabled, TTL, readBoardView } from "./redis";
import { KEEP_BEST_ROW_LUA } from "./score";
import type { BlueprintKey, BpRow, BpBoardView } from "./blueprint";

// Blueprint daily boards (Upstash sorted set + meta hash per blueprint, lb:bp:* — new keys only).
// Five stratified boards plus a combined "all" board (best blueprint-adjusted score across the
// five — the PRIMARY view, since five separate boards would feel empty at current player counts).
// Daily-only: bp scores carry a cosmetic execution multiplier and must never bleed into the
// weekly/all-time aggregates, so there is no Lua delta path — plain keep-best like Factor Hunt.
// Self-disabling via the shared redis module.

const keyZ = (d: string, bp: string) => `lb:bp:${d}:${bp}`;
const keyH = (d: string, bp: string) => `lb:bp:${d}:${bp}:meta`;
const BOARDS: (BlueprintKey | "all")[] = ["spacing", "fortress", "discipline", "rim", "balanced", "all"];

export function isBpBoardEnabled(): boolean { return isRedisEnabled(); }

export async function getBpLeaderboard(date: string, bp: BlueprintKey | "all", uid?: string): Promise<BpBoardView | null> {
  if (!redis) return null;
  const { total, top, you } = await readBoardView<BpRow>(keyZ(date, bp), keyH(date, bp), uid);
  return { date, bp, total, top, you };
}

// keep-best on one board: compare + score + meta + TTLs run as ONE Lua script, so the sorted-set
// score and the meta row always move together — a non-atomic zadd{gt}+hset let a concurrent
// lower-scoring submit (e.g. a different blueprint racing onto the combined board) install its
// meta (wrong bp chip, wrong lineup link) under the winner's score.
async function keepBest(date: string, bp: string, row: BpRow, sortScore: number): Promise<void> {
  if (!redis) return;
  await redis.eval(
    KEEP_BEST_ROW_LUA,
    [keyZ(date, bp), keyH(date, bp)],
    [row.uid, sortScore, JSON.stringify(row), TTL],
  );
}

// One submit lands on two boards: its own blueprint's, and the combined board (where the row
// keeps its bp tag, so the combined view can show WHICH objective earned the score).
export async function submitBpScore(date: string, row: BpRow, sortScore: number): Promise<BpBoardView | null> {
  if (!redis) return null;
  if (!Number.isFinite(sortScore)) return getBpLeaderboard(date, row.bp, row.uid);
  await keepBest(date, row.bp, row, sortScore);
  await keepBest(date, "all", row, sortScore);
  return getBpLeaderboard(date, row.bp, row.uid);
}

// Claim cleanup: drop an anon row when the same player re-submits signed-in (mirrors daily/FH).
// The anon uid may sit on any of the six boards — sweep them all in ONE pipeline (this used to be
// 12 sequential Upstash round trips on every sign-in claim).
export async function removeBpEntry(date: string, uid: string): Promise<void> {
  if (!redis) return;
  const p = redis.pipeline();
  for (const bp of BOARDS) p.zrem(keyZ(date, bp), uid).hdel(keyH(date, bp), uid);
  await p.exec();
}
