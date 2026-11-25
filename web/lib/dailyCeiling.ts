import "server-only";
import { spinPool, getPlayersByIds, getCoefficients, getAllPlayers } from "./data";
import { evaluateLineup } from "./engine";
import { bestFive } from "./ceiling";
import { redis } from "./redis";
import { strSeed } from "./rng";
import { encodeLineup } from "./share";
import type { Slot } from "./types";

// The Daily ceiling (W2): the best five from a Daily's five base spins, on the seed date's pool (D4).
// The base spins are pick-independent (every TEAM|DECADE bucket has 8+ cards, so four exclusions never
// empty one), so the five buckets are exactly what spinPool returns with nothing drafted. Re-spins are
// ignored by design ("best five from today's spins"). Cached per date in memory and in Redis.
//
// DESIGN.md §12: this module only computes. Who may see what is the route's job
// (app/api/daily/ceiling): today's record only after a verified submit, the lineup only once the
// Daily has rolled over.

export interface CeilingRecord {
  date: string;
  wins: number;
  losses: number;
  netRtg: number;
  grade: string;
  label: string;
  lineup: { id: string; name: string; team: string; decade: string; slot: Slot }[];
  seg: string; // /r/<seg> permalink of the five
}

const MEM_CAP = 64;
const mem = new Map<string, CeilingRecord>();
const TTL_SEC = 60 * 60 * 24 * 400;

// Coefficients and card data are both part of the answer: a refit or a data-only card fix (ratings,
// eligibility) must not serve a stale ceiling from Redis. Engine code changes bump the version by hand.
// The public past-day GET is CDN-cached (1d + 7d stale), so a key change takes up to ~8 days to show there.
let _key: string | null = null;
const h36 = (s: string) => (strSeed(s) >>> 0).toString(36);
const keyPrefix = () => (_key ??= `ceiling:v1:${h36(JSON.stringify(getCoefficients()))}:${h36(JSON.stringify(getAllPlayers()))}:`);

export function computeDailyCeiling(date: string): CeilingRecord | null {
  const seed = `daily-${date}`;
  const buckets = [0, 1, 2, 3, 4].map((r) => getPlayersByIds(spinPool(seed, r).ids));
  const c = getCoefficients();
  const five = bestFive(buckets, c);
  if (!five) return null;
  const players = five.picks.map((x) => x.player);
  const r = evaluateLineup(players, c);
  return {
    date, wins: r.wins, losses: r.losses, netRtg: Math.round(r.netRtg * 10) / 10, grade: r.grade, label: r.label,
    lineup: five.picks.map(({ player: p, slot }) => ({ id: p.id, name: p.name, team: p.team, decade: p.decade, slot })),
    seg: encodeLineup(players.map((p) => p.id)),
  };
}

function remember(rec: CeilingRecord) {
  mem.set(rec.date, rec);
  if (mem.size > MEM_CAP) mem.delete(mem.keys().next().value as string);
}

export async function getDailyCeiling(date: string): Promise<CeilingRecord | null> {
  const hit = mem.get(date);
  if (hit) return hit;
  const key = keyPrefix() + date;
  if (redis) {
    try {
      const stored = await redis.get<CeilingRecord>(key);
      if (stored && typeof stored === "object" && stored.date === date) { remember(stored); return stored; }
    } catch { /* fall through to compute */ }
  }
  const rec = computeDailyCeiling(date);
  if (!rec) return null;
  remember(rec);
  if (redis) {
    try { await redis.set(key, rec, { ex: TTL_SEC }); } catch { /* cache only */ }
  }
  return rec;
}

export function _resetCeilingMemo(): void { mem.clear(); }
