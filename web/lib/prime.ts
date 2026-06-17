// Prime Draft: no era reel — each franchise offers its all-time pool with exactly one entry per
// person_id, the variant at that player's offensive peak. Pure + isomorphic (no server-only) so
// the peak-variant selection and franchise-eligibility rules are unit-testable; data.ts feeds it
// the draftable player rows and caches the result.

import type { Player } from "./types";

// Franchises need a real all-time pool to be draftable in Prime — thin rosters (recent expansion
// teams) produce repetitive fives, so anything under 8 distinct people is excluded (spec).
export const PRIME_MIN_PEOPLE = 8;

// "Highest offensive contribution": pts + ast + reb, weighted by position — guards are valued on
// creation, bigs on the glass, wings balanced. Computable straight from players.json (spec); no
// engine recalibration involved.
export function primeScore(p: Pick<Player, "pos" | "pts" | "ast" | "trb">): number {
  const pts = p.pts ?? 0, ast = p.ast ?? 0, trb = p.trb ?? 0;
  if (p.pos === "PG" || p.pos === "SG" || p.pos === "G") return pts + 1.5 * ast + 0.8 * trb;
  if (p.pos === "C" || p.pos === "PF") return pts + 0.8 * ast + 1.4 * trb;
  return pts + 1.1 * ast + 1.1 * trb;
}

// Pick the peak variant among one person's franchise-era rows. Deterministic: weighted score,
// then later year, then id — so pool building is stable across processes (no RNG involved).
export function peakVariant<T extends Pick<Player, "id" | "year" | "pos" | "pts" | "ast" | "trb">>(variants: T[]): T | null {
  let best: T | null = null;
  for (const v of variants) {
    if (!best) { best = v; continue; }
    const a = primeScore(v), b = primeScore(best);
    if (a > b || (a === b && (v.year > best.year || (v.year === best.year && v.id < best.id)))) best = v;
  }
  return best;
}

// Default "Top" board order: most-recognizable players for this team-era first. `fame` (accolade
// score from data/build_fame.py) leads; `peak_score` (VORP value) breaks ties and orders the
// un-accoladed tail. Pure so selectSpin (era pools) and buildPrimePools share one definition.
export function compareSzn(
  a: Pick<Player, "fame" | "peak_score">,
  b: Pick<Player, "fame" | "peak_score">,
): number {
  return (b.fame ?? 0) - (a.fame ?? 0) || (b.peak_score ?? 0) - (a.peak_score ?? 0);
}

export interface PrimePools { teams: string[]; byTeam: Map<string, Player[]> }

// Build per-franchise prime pools from the draftable rows (caller pre-filters to current
// franchises + canonical decades, mirroring data.ts's draft index). One peak variant per
// person_id; franchises under PRIME_MIN_PEOPLE distinct people are dropped; pools sort by
// compareSzn desc (fame-first, peak_score tiebreak — same ordering selectSpin uses for era pools).
export function buildPrimePools(draftable: Player[]): PrimePools {
  const people = new Map<string, Map<string, Player[]>>(); // team -> person_id -> variants
  for (const p of draftable) {
    const person = p.person_id ?? p.id;
    if (!people.has(p.team)) people.set(p.team, new Map());
    const byPerson = people.get(p.team)!;
    if (!byPerson.has(person)) byPerson.set(person, []);
    byPerson.get(person)!.push(p);
  }
  const byTeam = new Map<string, Player[]>();
  for (const [team, byPerson] of people) {
    if (byPerson.size < PRIME_MIN_PEOPLE) continue;
    const pool: Player[] = [];
    for (const variants of byPerson.values()) {
      const peak = peakVariant(variants);
      if (peak) pool.push(peak);
    }
    pool.sort(compareSzn);
    byTeam.set(team, pool);
  }
  return { teams: [...byTeam.keys()].sort(), byTeam };
}
