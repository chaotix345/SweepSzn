import "server-only";
import { getResults, getDexIds, getReferralFlags, fieldedIds } from "./profileStore";
import { getPlayersByIds } from "./data";
import { playerTraits } from "./traits";
import { computeBadges, type DexPlayer, type BadgeKey } from "./dex";

// A result as the Dex needs it: which five took the floor (mode + encoded) and its grade (sTier badge).
export interface DexResult { mode: string; encoded: string; grade: string }

// The Drafted Dex state: every player-variant ever fielded plus the earned achievement badges. All
// descriptive (DESIGN.md §12). With a uid it reads the account (stored results + the unbounded dex
// set + referral flags); `local` is the device's own localStorage history, unioned in so the Dex works
// signed out (local only) and is never behind the account sync when signed in. A game present on
// both sides (same mode + encoded) counts once. Shared by /api/dex and the profile-sync badge diff.
export async function loadDexState(
  uid: string | null,
  local: DexResult[] = [],
): Promise<{ players: DexPlayer[]; total: number; badges: BadgeKey[] }> {
  const results: DexResult[] = uid ? await getResults(uid) : [];
  const keys = new Set(results.map((r) => `${r.mode}:${r.encoded}`));
  for (const r of local) {
    const k = `${r.mode}:${r.encoded}`;
    if (!keys.has(k)) { keys.add(k); results.push(r); }
  }
  const seen = new Set<string>();
  for (const r of results) for (const id of fieldedIds(r)) seen.add(id);
  // Union the unbounded dex set so players from games evicted past the 200-result cap aren't lost.
  if (uid) for (const id of await getDexIds(uid)) seen.add(id);

  const players: DexPlayer[] = getPlayersByIds([...seen]).map((p) => ({
    id: p.id, personId: p.person_id ?? p.id, name: p.name, team: p.team, decade: p.decade,
    pos: p.pos, eligible: p.eligible && p.eligible.length ? p.eligible : [p.pos],
    pts: p.pts ?? null, trb: p.trb ?? null, ast: p.ast ?? null, stl: p.stl ?? null, blk: p.blk ?? null,
    fame: p.fame ?? 0, traits: playerTraits(p),
  }));
  const flags = uid ? await getReferralFlags(uid) : undefined;
  const badges = computeBadges(players, results.map((r) => ({ grade: r.grade })), flags);
  return { players, total: results.length, badges };
}
