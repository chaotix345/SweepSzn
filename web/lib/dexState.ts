import "server-only";
import { getResults, getDexIds, getReferralFlags } from "./profileStore";
import { decodeLineup } from "./share";
import { getPlayersByIds } from "./data";
import { playerTraits } from "./traits";
import { computeBadges, type DexPlayer, type BadgeKey } from "./dex";

// The signed-in user's Drafted Dex state: every player-variant ever fielded (union of stored results +
// the unbounded dex set) plus the earned achievement badges. All descriptive (DESIGN.md §12). Shared by
// GET /api/dex (the collection screen) and the profile-sync badge-unlock diff, so both read identically.
export async function loadDexState(uid: string): Promise<{ players: DexPlayer[]; total: number; badges: BadgeKey[] }> {
  const results = await getResults(uid);
  const seen = new Set<string>();
  for (const r of results) for (const id of decodeLineup(r.encoded)) seen.add(id);
  // Union the unbounded dex set so players from games evicted past the 200-result cap aren't lost.
  for (const id of await getDexIds(uid)) seen.add(id);

  const players: DexPlayer[] = getPlayersByIds([...seen]).map((p) => ({
    id: p.id, personId: p.person_id ?? p.id, name: p.name, team: p.team, decade: p.decade,
    pos: p.pos, eligible: p.eligible && p.eligible.length ? p.eligible : [p.pos],
    pts: p.pts ?? null, trb: p.trb ?? null, ast: p.ast ?? null, stl: p.stl ?? null, blk: p.blk ?? null,
    fame: p.fame ?? 0, traits: playerTraits(p),
  }));
  const flags = await getReferralFlags(uid);
  const badges = computeBadges(players, results.map((r) => ({ grade: r.grade })), flags);
  return { players, total: results.length, badges };
}
