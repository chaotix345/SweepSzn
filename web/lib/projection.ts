import type { Player, Coefficients, Slot } from "./types";
import { DEFAULT_COEFFICIENTS, quickScore, WIN_GRADES } from "./engine";

// A partial-roster win projection is a fit-class signal — it reveals how good your current picks
// are — so it is allowed ONLY on the seeds where the fit assist is already allowed: the exact mirror
// of lib/data.ts's showFit (Classic free-play, Blueprint daily, Prime free-play). Daily / Factor
// Hunt / Surgeon / HoopIQ / Challenge stay blind so the response can't be read to draft optimally
// and skew a shared board (DESIGN.md §12).
export function projectionAllowed(seed: string): boolean {
  return seed.startsWith("classic") || seed.startsWith("bp-") ||
    (seed.startsWith("prime-") && !seed.startsWith("prime-daily-"));
}

export interface Projection { wins: number; losses: number; grade: string }
export interface RosterProjection { floor: Projection; ceiling: Projection; n: number }

// Replacement-level filler (mirrors lib/data.ts's FILLERS) — completes the FLOOR lineup.
function replacementFiller(i: number): Player {
  return {
    id: `__rfill_${i}`, name: "Replacement", year: 2015, decade: "2010s", tier: "complete",
    team: "FA", pos: "SF", g: 70, mp: 24, obpm: -2, dbpm: -1, usg: 18,
  } as Player;
}

function gradeFor(wins: number): string {
  return (WIN_GRADES.find((g) => wins >= g.min) ?? WIN_GRADES[WIN_GRADES.length - 1]).grade;
}
function toProj(wins: number): Projection {
  return { wins, losses: 82 - wins, grade: gradeFor(wins) };
}

// Floor  = your picks + replacement-level players in the open slots ("if you bench the rest").
// Ceiling = your picks + the best real player still available for each open slot ("the best five
// you could still reach" — the held design's "best-possible completion at each step"). Both run
// through the SAME engine as the final result, so at 5/5 they converge to the real number. The
// ceiling draws from the public global pool, never the seed's unrevealed future spins, so it
// leaks nothing about what the reels will land on next.
export function projectRoster(
  drafted: Player[], pool: Player[], openSlots: Slot[], c: Coefficients = DEFAULT_COEFFICIENTS,
): RosterProjection {
  const n = drafted.length;

  const fillers = [0, 1, 2, 3].map(replacementFiller);
  const floorLineup = [...drafted, ...fillers.slice(0, Math.max(0, 5 - n))];
  const floor = toProj(quickScore(floorLineup, c).wins);

  // Greedy best-available completion: fill each open slot with the eligible, not-yet-used player
  // that most improves the lineup's net rating. person_id dedup blocks drafting two variants of
  // one person (and the same star into two slots).
  const used = new Set(drafted.map((p) => p.person_id ?? p.id));
  const completion = [...drafted];
  for (const slot of openSlots) {
    let best: Player | null = null;
    let bestNet = -Infinity;
    for (const p of pool) {
      const pid = p.person_id ?? p.id;
      if (used.has(pid)) continue;
      const elig = (p.eligible && p.eligible.length ? p.eligible : [p.pos]) as Slot[];
      if (!elig.includes(slot)) continue;
      const net = quickScore([...completion, p], c).netRtg;
      if (net > bestNet) { bestNet = net; best = p; }
    }
    if (best) { completion.push(best); used.add(best.person_id ?? best.id); }
  }
  // a pool too small to fill every open slot — pad with replacement so we always score a five
  while (completion.length < 5) completion.push(replacementFiller(completion.length));
  const ceiling = toProj(quickScore(completion, c).wins);

  return { floor, ceiling, n };
}
