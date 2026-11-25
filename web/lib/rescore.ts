// Engine v4 migration helpers (DESIGN.md §14): move stored scores onto the new engine. Pure over a
// narrow Redis surface so the env-gated ops script (scripts/rescore_v4.ts) and the hermetic tests
// (test/rescore.test.ts, redisFake) run the same code. Idempotent: a second run changes nothing.
//
// Policy (spec §9.3): rescore what still holds a lineup — profile result history (no TTL), live
// challenges (creator info + every board row) and today's still-open Daily board. The weekly and
// all-time boards only keep running totals, so they are archived under a version suffix and restart
// empty. Closed daily boards and the mode boards (Factor Hunt / Blueprint / Surgeon, scored from more
// than the record) are left as they were: finished competitions that expire within 31 days.
import { encScore, RELEASE_LOCK_LUA } from "./score";
import { decodeLineup } from "./share";
import { decodeDuelCard, outcomeFromWinner } from "./duel";
import { compareResults } from "./challenge";
import { decodeSurgeonCard } from "./surgeon";
import type { LineupResult } from "./types";

export type Evaluate = (ids: string[]) => LineupResult | null;

export interface RescoreMulti {
  del(...ks: string[]): RescoreMulti;
  lpush(k: string, ...vs: unknown[]): RescoreMulti;
  rename(src: string, dst: string): RescoreMulti;
  expire(k: string, sec: number): RescoreMulti;
  exec(): Promise<unknown>;
}
export interface RescoreRedis {
  get<T>(k: string): Promise<T | null>;
  set(k: string, v: unknown, opts?: { ex?: number; nx?: boolean }): Promise<unknown>;
  exists(...ks: string[]): Promise<number>;
  hgetall<T>(k: string): Promise<Record<string, T> | null>;
  hset(k: string, obj: Record<string, unknown>): Promise<unknown>;
  zadd(k: string, ...entries: { score: number; member: string }[]): Promise<unknown>;
  zrange<T>(k: string, start: number, stop: number, opts?: { withScores?: boolean }): Promise<T>;
  lrange<T>(k: string, start: number, stop: number): Promise<T[]>;
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
  multi(): RescoreMulti;
}

interface ProfileEntry { encoded: string; mode: string; wins: number; losses: number; grade: string; [k: string]: unknown }
interface BoardRow { uid: string; name: string; wins: number; losses: number; net: number; lineup: string; [k: string]: unknown }

const RESULTS_LOCK_SEC = 5;

function idsFor(mode: string, encoded: string): string[] | null {
  if (mode === "duel") return decodeDuelCard(encoded)?.youIds ?? null; // the player's own five
  if (mode !== "surgeon") return decodeLineup(encoded);
  const card = decodeSurgeonCard(encoded);
  return card ? card.afterIds : null; // a Surgeon result records the after-swap five
}

function duelOutcome(encoded: string, you: LineupResult, evaluate: Evaluate) {
  const botIds = decodeDuelCard(encoded)?.botIds;
  const bot = botIds && botIds.length === 5 ? evaluate(botIds) : null;
  return bot ? outcomeFromWinner(compareResults(you, bot).winner) : undefined;
}

// Same protocol as profileStore.syncResults: hold results:lock:{uid} (NX + token, owner-checked
// release) so a concurrent /api/profile/sync can't interleave, and rewrite the list in ONE MULTI so a
// failure mid-rewrite can never leave the no-TTL history deleted. Returns -1 if the lock stays busy.
export async function rescoreProfileResults(redis: RescoreRedis, uid: string, evaluate: Evaluate, token = randomToken()): Promise<number> {
  const key = `results:${uid}`, lock = `results:lock:${uid}`;
  let got = false;
  for (let i = 0; i < 10 && !got; i++) {
    got = (await redis.set(lock, token, { nx: true, ex: RESULTS_LOCK_SEC })) === "OK";
    if (!got) await new Promise((r) => setTimeout(r, 50 * (i + 1)));
  }
  if (!got) return -1;
  try {
    const raw = await redis.lrange<ProfileEntry | string>(key, 0, -1);
    if (!raw.length) return 0;
    let changed = 0;
    const next = raw.map((v) => {
      const e: ProfileEntry = typeof v === "string" ? JSON.parse(v) : v;
      const ids = idsFor(e.mode, e.encoded);
      const r = ids && ids.length === 5 ? evaluate(ids) : null;
      if (!r) return e;
      // a duel's outcome depends on both fives, so a rescore re-decides it against the bot's five too
      const outcome = e.mode === "duel" ? duelOutcome(e.encoded, r, evaluate) : undefined;
      if (r.wins === e.wins && r.losses === e.losses && r.grade === e.grade && (outcome === undefined || outcome === e.outcome)) return e;
      changed++;
      return { ...e, wins: r.wins, losses: r.losses, grade: r.grade, ...(outcome !== undefined && { outcome }) };
    });
    // lpush leaves its LAST arg at the head, so push the reverse to keep newest-first
    if (changed) await redis.multi().del(key).lpush(key, ...[...next].reverse()).exec();
    return changed;
  } finally {
    try { await redis.eval(RELEASE_LOCK_LUA, [lock], [token]); } catch { /* expires on its own */ }
  }
}

function randomToken(): string {
  return `rescore-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function rescoreChallenge(redis: RescoreRedis, id: string, evaluate: Evaluate, ttl: number): Promise<boolean> {
  const infoKey = `chal:${id}:info`, zKey = `chal:${id}`, hKey = `chal:${id}:meta`;
  let touched = false;
  const info = await redis.get<BoardRow & { grade: string }>(infoKey);
  if (info) {
    const r = evaluate(decodeLineup(info.lineup));
    if (r && (r.wins !== info.wins || r.losses !== info.losses || Math.round(r.netRtg * 10) / 10 !== info.net)) {
      await redis.set(infoKey, { ...info, wins: r.wins, losses: r.losses, net: Math.round(r.netRtg * 10) / 10, grade: r.grade }, { ex: ttl });
      touched = true;
    }
  }
  if ((await rescoreBoard(redis, zKey, hKey, evaluate)) > 0) touched = true;
  // keep the challenge's three keys expiring together (as submitChallenge does), so a rewritten info
  // key can't outlive its board and leave a ghost /c/<id> page
  if (touched) await redis.multi().expire(zKey, ttl).expire(hKey, ttl).expire(infoKey, ttl).exec();
  return touched;
}

// Rescore every row of a lineup-carrying board (meta HASH of StoredRow + score ZSET): the challenge
// boards and the still-open daily board (lb:{today}), whose rows keep the encoded lineup. hset/zadd
// leave the keys' TTLs untouched.
export async function rescoreBoard(redis: RescoreRedis, zKey: string, hKey: string, evaluate: Evaluate): Promise<number> {
  const rows = (await redis.hgetall<BoardRow>(hKey)) ?? {};
  let changed = 0;
  for (const [uid, row] of Object.entries(rows)) {
    if (!row?.lineup) continue;
    const r = evaluate(decodeLineup(row.lineup));
    if (!r) continue;
    const net = Math.round(r.netRtg * 10) / 10;
    if (r.wins === row.wins && r.losses === row.losses && net === row.net) continue;
    await redis.hset(hKey, { [uid]: { ...row, wins: r.wins, losses: r.losses, net } });
    await redis.zadd(zKey, { score: encScore(r.wins, r.netRtg), member: uid });
    changed++;
  }
  return changed;
}

// Move a ZSET + its meta HASH to `<key>:v<version>` with RENAME in one MULTI: atomic, O(1), and no
// submit can land between a copy and a delete. Runs only when the archive is absent and the live board
// exists, so a rerun is a no-op and a failed run (nothing applied) can simply be retried. `ttl` (the
// weekly board's) is applied to the archive; the all-time archive keeps no TTL like its source.
export async function archiveBoard(redis: RescoreRedis, zKey: string, hKey: string, version: number, ttl?: number): Promise<boolean> {
  const az = `${zKey}:v${version}`, ah = `${hKey}:v${version}`;
  if ((await redis.exists(az)) || !(await redis.exists(zKey))) return false;
  const tx = redis.multi().rename(zKey, az);
  const hasMeta = (await redis.exists(hKey)) > 0;
  if (hasMeta) tx.rename(hKey, ah);
  if (ttl) { tx.expire(az, ttl); if (hasMeta) tx.expire(ah, ttl); }
  await tx.exec();
  return true;
}
