import "server-only";
import { redis, isRedisEnabled, TTL, encScore, readSortedRows, type StoredRow } from "./redis";
import type { ChallengeInfo, ChallengePublic, ChallengeBoard, LineupResult, LeaderboardRow } from "./types";

// Per-challenge persistence. Keys: chal:<id> (sorted set, ranking), chal:<id>:meta (hash,
// per-uid row payload), chal:<id>:info (the creator's bar, write-once). 31-day TTL refreshed
// on each write. Self-disabling via the shared redis module.

const keyZ = (id: string) => `chal:${id}`;
const keyH = (id: string) => `chal:${id}:meta`;
const keyInfo = (id: string) => `chal:${id}:info`;

export function isChallengeEnabled(): boolean { return isRedisEnabled(); }

async function board(id: string, uid?: string): Promise<ChallengeBoard> {
  if (!redis) return { total: 0, top: [] };
  const total = await redis.zcard(keyZ(id));
  const top = await readSortedRows(keyZ(id), keyH(id), 0, 99);
  let you: LeaderboardRow | undefined = top.find((r) => r.uid === uid);
  if (uid && !you) {
    const rank = await redis.zrevrank(keyZ(id), uid);
    if (rank != null) {
      const meta = (await redis.hmget<Record<string, StoredRow>>(keyH(id), uid)) ?? {};
      const m = meta[uid];
      if (m) you = { ...m, rank: rank + 1 };
    }
  }
  return { total, top, you };
}

// Redacted read for the public landing page — never exposes any lineup.
export async function getChallengePublic(id: string): Promise<ChallengePublic | null> {
  if (!redis) return null;
  const info = await redis.get<ChallengeInfo>(keyInfo(id));
  if (!info) return null;
  const attempts = await redis.zcard(keyZ(id));
  return { id, creatorName: info.name, wins: info.wins, losses: info.losses, net: info.net, grade: info.grade, attempts };
}

// Submit a verified attempt. The first submitter claims the creator slot (write-once via set-nx);
// everyone else is a responder. Always keep-best adds the row to the board. Returns the role, the
// authoritative creator info (incl lineup, for the reveal/verdict), and the fresh board.
export async function submitChallenge(
  id: string,
  row: StoredRow,
  result: LineupResult,
  grade: string,
): Promise<{ role: "creator" | "responder"; creator: ChallengeInfo; board: ChallengeBoard } | null> {
  if (!redis) return null;
  const info: ChallengeInfo = { uid: row.uid, name: row.name, wins: row.wins, losses: row.losses, net: row.net, grade, lineup: row.lineup };
  const claimed = await redis.set(keyInfo(id), info, { nx: true, ex: TTL });
  const role: "creator" | "responder" = claimed === "OK" ? "creator" : "responder";
  const creator = role === "creator" ? info : ((await redis.get<ChallengeInfo>(keyInfo(id))) ?? info);

  const score = encScore(result.wins, result.netRtg);
  if (Number.isFinite(score)) {
    const prev = await redis.zscore(keyZ(id), row.uid);
    if (prev == null || score > Number(prev)) {
      await redis.zadd(keyZ(id), { score, member: row.uid });
      await redis.hset(keyH(id), { [row.uid]: row });
    }
    await redis.expire(keyZ(id), TTL);
    await redis.expire(keyH(id), TTL);
    await redis.expire(keyInfo(id), TTL);
  }
  return { role, creator, board: await board(id, row.uid) };
}
