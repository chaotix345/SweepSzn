import "server-only";
import { redis, isRedisEnabled, TTL, encScore, readSortedRows, type StoredRow } from "./redis";
import { challengeSeed, buildOwnerView } from "./challenge";
import { getPlayersByIds } from "./data";
import type { ChallengeInfo, ChallengePublic, ChallengeBoard, ChallengeBoardRow, ChallengeOwnerView, LineupResult, LeaderboardRow } from "./types";

// Per-challenge persistence. Keys: chal:<id> (sorted set, ranking), chal:<id>:meta (hash,
// per-uid row payload), chal:<id>:info (the creator's bar + draft seed, write-once). 31-day TTL
// refreshed on each write. Self-disabling via the shared redis module.

const keyZ = (id: string) => `chal:${id}`;
const keyH = (id: string) => `chal:${id}:meta`;
const keyInfo = (id: string) => `chal:${id}:info`;
const keyFitLock = (seed: string) => `chal:fitlock:${seed}`;

export function isChallengeEnabled(): boolean { return isRedisEnabled(); }

// /api/spin serves fit grades for a classic free-play seed. Once a classic game is CONVERTED to a
// challenge its seed is exposed to responders (via getChallengePublic), so we mark it here and the
// spin route refuses fit for a marked seed — closing the "read the seed, craft a fit:true /api/spin"
// hole. Free-play classic seeds are random and never marked. Fails open when redis is unavailable.
export async function isFitLockedSeed(seed: string): Promise<boolean> {
  if (!redis) return false;
  try { return (await redis.exists(keyFitLock(seed))) === 1; } catch { return false; }
}

// strip lineup AND uid: the challenge board ranks records but never exposes anyone's five, and
// never leaks uids (which are the only identity token and would otherwise be harvestable from the
// board JSON and replayed to impersonate another player on submit).
const strip = (r: LeaderboardRow): ChallengeBoardRow => ({ rank: r.rank, name: r.name, wins: r.wins, losses: r.losses, net: r.net });

async function board(id: string, uid?: string): Promise<ChallengeBoard> {
  if (!redis) return { total: 0, top: [] };
  const total = await redis.zcard(keyZ(id));
  const raw = await readSortedRows(keyZ(id), keyH(id), 0, 99); // includes uid (server-side only)
  const top = raw.map(strip);
  // identify "you" from the raw rows (which still carry uid) BEFORE stripping
  let you: ChallengeBoardRow | undefined;
  const meIdx = uid ? raw.findIndex((r) => r.uid === uid) : -1;
  if (meIdx >= 0) {
    you = top[meIdx];
  } else if (uid) {
    const rank = await redis.zrevrank(keyZ(id), uid);
    if (rank != null) {
      const meta = (await redis.hmget<Record<string, StoredRow>>(keyH(id), uid)) ?? {};
      const m = meta[uid];
      if (m) you = { rank: rank + 1, name: m.name, wins: m.wins, losses: m.losses, net: m.net };
    }
  }
  return { total, top, you };
}

// Redacted read for the public landing page / responder bootstrap — exposes the bar (record +
// grade), the draft seed (so the responder replays the SAME spins), and whether the creator used
// hints, but never any lineup or uid.
export async function getChallengePublic(id: string): Promise<ChallengePublic | null> {
  if (!redis) return null;
  const info = await redis.get<ChallengeInfo>(keyInfo(id));
  if (!info) return null;
  const attempts = await redis.zcard(keyZ(id));
  return {
    id, creatorName: info.name, wins: info.wins, losses: info.losses, net: info.net, grade: info.grade,
    responders: Math.max(0, attempts - 1), // the creator occupies one board slot; count only friends
    seed: info.seed ?? challengeSeed(id),  // legacy challenges (no stored seed) used h2h-<id>
    hinted: !!info.hinted,
  };
}

// The creator's own dashboard: their five plus every responder's five + verdict. Gated to the creator
// — `uid` must equal the write-once creator uid (info.uid). That uid lives only on the creator's
// device (the board strips uids), so this match is as strong as identity gets in the anonymous model,
// and it stays consistent with "you only see a five once you've played": creating IS the creator's
// play. Responders use their own reveal flow; they are not the creator and get `forbidden` here.
export type ChallengeOwnerResult =
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "ok"; view: ChallengeOwnerView };

export async function getChallengeOwnerView(id: string, uid: string): Promise<ChallengeOwnerResult | null> {
  if (!redis) return null;
  const info = await redis.get<ChallengeInfo>(keyInfo(id));
  if (!info) return { status: "not_found" };
  if (info.uid !== uid) return { status: "forbidden" };
  const total = await redis.zcard(keyZ(id));
  const rows = await readSortedRows(keyZ(id), keyH(id), 0, 99); // server-side rows still carry uid + lineup
  const view = buildOwnerView(id, info, rows, total, (pid) => {
    const p = getPlayersByIds([pid])[0];
    return p ? { id: p.id, name: p.name, team: p.team, decade: p.decade } : null;
  });
  return { status: "ok", view };
}

// The stored draft seed for an existing challenge, or null if the challenge has no creator yet
// (or predates seed storage). The submit route uses null to decide whether the first submitter may
// supply the seed (converting a finished game) vs. falling back to the legacy h2h-<id>.
export async function getChallengeSeed(id: string): Promise<string | null> {
  if (!redis) return null;
  const info = await redis.get<ChallengeInfo>(keyInfo(id));
  return info?.seed ?? null;
}

// Submit a verified attempt. The first submitter claims the creator slot (write-once via set-nx);
// everyone else is a responder. `meta` (seed + hinted) is recorded only on the creator claim — it
// describes the challenge itself. Always keep-best adds the row to the board. Returns the role, the
// authoritative creator info (incl lineup, for the reveal/verdict), and the fresh board.
export async function submitChallenge(
  id: string,
  row: StoredRow,
  result: LineupResult,
  grade: string,
  meta: { seed: string; hinted: boolean },
): Promise<{ role: "creator" | "responder"; creator: ChallengeInfo; improved: boolean; board: ChallengeBoard } | null> {
  if (!redis) return null;
  const info: ChallengeInfo = { uid: row.uid, name: row.name, wins: row.wins, losses: row.losses, net: row.net, grade, lineup: row.lineup, seed: meta.seed, hinted: meta.hinted };
  const claimed = await redis.set(keyInfo(id), info, { nx: true, ex: TTL });
  let role: "creator" | "responder";
  let creator: ChallengeInfo;
  if (claimed === "OK") {
    role = "creator"; creator = info;
  } else {
    const existing = await redis.get<ChallengeInfo>(keyInfo(id));
    if (!existing) return null; // key vanished between NX and GET — bail rather than mislabel the requester's own data
    creator = existing;
    role = existing.uid === row.uid ? "creator" : "responder"; // the creator re-submitting stays the creator (idempotent)
  }

  let improved = false; // a new personal best for this uid (drives the "your challenge got beaten" notification)
  const score = encScore(result.wins, result.netRtg);
  if (Number.isFinite(score)) {
    const prev = await redis.zscore(keyZ(id), row.uid);
    if (prev == null || score > Number(prev)) {
      improved = true;
      await redis.zadd(keyZ(id), { score, member: row.uid });
      await redis.hset(keyH(id), { [row.uid]: row });
    }
    await redis.expire(keyZ(id), TTL);
    await redis.expire(keyH(id), TTL);
    await redis.expire(keyInfo(id), TTL);
  }
  // a classic-originated challenge exposes its classic seed to responders — lock fit on it (see isFitLockedSeed)
  if (meta.seed.startsWith("classic")) await redis.set(keyFitLock(meta.seed), "1", { ex: TTL });
  return { role, creator, improved, board: await board(id, row.uid) };
}
