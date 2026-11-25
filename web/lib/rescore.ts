// Engine v4 migration helpers (DESIGN.md §14): move stored scores onto the new engine. Pure over a
// narrow Redis surface so the env-gated ops script (scripts/rescore_v4.ts) and the hermetic tests
// (test/rescore.test.ts, redisFake) run the same code. Idempotent: a second run changes nothing.
//
// Policy (spec §9.3): rescore what still holds a lineup — profile result history (no TTL) and live
// challenges (creator info + every board row). The weekly and all-time boards only keep running
// totals, so they are archived under a version suffix and restart empty. Closed daily/mode boards
// are left as they were (finished competitions that expire within 31 days).
import { encScore } from "./score";
import { decodeLineup } from "./share";
import { decodeSurgeonCard } from "./surgeon";
import type { LineupResult } from "./types";

export type Evaluate = (ids: string[]) => LineupResult | null;

export interface RescoreRedis {
  get<T>(k: string): Promise<T | null>;
  set(k: string, v: unknown, opts?: { ex?: number }): Promise<unknown>;
  hgetall<T>(k: string): Promise<Record<string, T> | null>;
  hset(k: string, obj: Record<string, unknown>): Promise<unknown>;
  zadd(k: string, ...entries: { score: number; member: string }[]): Promise<unknown>;
  zrange<T>(k: string, start: number, stop: number, opts?: { withScores?: boolean }): Promise<T>;
  lrange<T>(k: string, start: number, stop: number): Promise<T[]>;
  lpush(k: string, ...vs: unknown[]): Promise<unknown>;
  del(...ks: string[]): Promise<unknown>;
}

interface ProfileEntry { encoded: string; mode: string; wins: number; losses: number; grade: string; [k: string]: unknown }
interface BoardRow { uid: string; name: string; wins: number; losses: number; net: number; lineup: string; [k: string]: unknown }

function idsFor(mode: string, encoded: string): string[] | null {
  if (mode !== "surgeon") return decodeLineup(encoded);
  const card = decodeSurgeonCard(encoded);
  return card ? card.afterIds : null; // a Surgeon result records the after-swap five
}

export async function rescoreProfileResults(redis: RescoreRedis, uid: string, evaluate: Evaluate): Promise<number> {
  const key = `results:${uid}`;
  const raw = await redis.lrange<ProfileEntry | string>(key, 0, -1);
  if (!raw.length) return 0;
  let changed = 0;
  const next = raw.map((v) => {
    const e: ProfileEntry = typeof v === "string" ? JSON.parse(v) : v;
    const ids = idsFor(e.mode, e.encoded);
    const r = ids && ids.length === 5 ? evaluate(ids) : null;
    if (!r || (r.wins === e.wins && r.losses === e.losses && r.grade === e.grade)) return e;
    changed++;
    return { ...e, wins: r.wins, losses: r.losses, grade: r.grade };
  });
  if (changed) {
    await redis.del(key);
    await redis.lpush(key, ...[...next].reverse()); // lpush leaves its LAST arg at the head
  }
  return changed;
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
  const rows = (await redis.hgetall<BoardRow>(hKey)) ?? {};
  for (const [uid, row] of Object.entries(rows)) {
    const r = evaluate(decodeLineup(row.lineup));
    if (!r) continue;
    const net = Math.round(r.netRtg * 10) / 10;
    if (r.wins === row.wins && r.losses === row.losses && net === row.net) continue;
    await redis.hset(hKey, { [uid]: { ...row, wins: r.wins, losses: r.losses, net } });
    await redis.zadd(zKey, { score: encScore(r.wins, r.netRtg), member: uid });
    touched = true;
  }
  return touched;
}

// Copy a ZSET + its meta HASH under `<key>:v<version>` and clear the originals (no RENAME, so the
// same code runs against the hermetic fake). Skips when the archive already exists (idempotent).
export async function archiveBoard(redis: RescoreRedis, zKey: string, hKey: string, version: number): Promise<boolean> {
  const az = `${zKey}:v${version}`, ah = `${hKey}:v${version}`;
  const existing = await redis.zrange<(string | number)[]>(az, 0, 0);
  if (existing.length) return false;
  const z = await redis.zrange<(string | number)[]>(zKey, 0, -1, { withScores: true });
  if (!z.length) return false;
  const entries: { score: number; member: string }[] = [];
  for (let i = 0; i < z.length; i += 2) entries.push({ member: String(z[i]), score: Number(z[i + 1]) });
  await redis.zadd(az, ...entries);
  const h = await redis.hgetall<unknown>(hKey);
  if (h) await redis.hset(ah, h);
  await redis.del(zKey, hKey);
  return true;
}
