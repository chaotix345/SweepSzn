import type { Coefficients, Player, Slot } from "./types";
import { DEFAULT_COEFFICIENTS, playerFeatures } from "./engine";
import { SLOTS, eligibleOf } from "./teams";

// Daily ceiling (W2): the exact best five a Daily's five BASE spins allow. One card per spin bucket,
// five different people, and a legal PG..C slot assignment (each card's `eligible`). Pure and
// dependency-free so tests can check it against brute force on synthetic pools; lib/dailyCeiling.ts
// feeds it the seed's real buckets (pool of the seed's date) and caches the answer.
//
// Branch-and-bound over the five buckets. Bound: ORtg can only gain the bucket's best offensive card
// plus the full spacing bonus, and DRtg can only gain its best defensive card with every penalty at
// zero, so the Pythagorean win% of (ortg upper bound, drtg lower bound) caps every completion.

export interface CeilingPick { player: Player; slot: Slot }
export interface CeilingFive { picks: CeilingPick[]; winPct: number } // picks in PG..C slot order

interface Feat {
  p: Player; person: string; mask: number;
  o: number; d: number; usage: number; shoot: number; size: number; perim: number; modern: boolean; ht: number;
}

const featOf = (p: Player, c: Coefficients): Feat => {
  const f = playerFeatures(p, c);
  return {
    p, person: p.person_id ?? p.id,
    mask: eligibleOf(p).reduce((m, s) => m | (1 << SLOTS.indexOf(s)), 0),
    o: c.offScale * f.off, d: c.defScale * f.def, usage: f.usage, shoot: f.shoot,
    size: f.sizeCover, perim: f.perimCover, modern: f.modern, ht: f.ht,
  };
};

const pyth = (ortg: number, drtg: number, k: number) => {
  const oP = Math.max(1, ortg) ** k, dP = Math.max(1, drtg) ** k;
  return oP / (oP + dP);
};

// Mirrors lib/engine.ts lineupTerms + winsFrom exactly (test/ceiling.test.ts pins it to quickScore).
export function leanWinPct(fs: { o: number; d: number; usage: number; shoot: number; size: number; perim: number; modern: boolean; ht: number }[], c: Coefficients): number {
  let sO = 0, sD = 0, tU = 0, sh = 0, rim = 0, perim = 0, modern = false;
  for (const f of fs) {
    sO += f.o; sD += f.d; tU += f.usage; sh += f.shoot;
    rim = Math.max(rim, f.size); perim = Math.max(perim, f.perim);
    if (f.modern) modern = true;
  }
  const overload = c.overloadGamma * Math.pow(Math.max(0, tU - c.usageBudget), c.overloadPow);
  const shortfall = c.shortfallGamma * Math.pow(Math.max(0, c.usageFloor - tU), c.overloadPow);
  const eff = sh <= 3 ? sh : 3 + (sh - 3) * c.spacing.diminish;
  const spacing = modern ? Math.max(c.spacing.noneFloor, Math.min(3, c.spacing.perShooter * (eff - c.spacing.baseline))) : 0;
  const ortg = c.ortgBase + sO + spacing - overload - shortfall;
  const hts = fs.map((f) => f.ht).filter((h) => h > 0).sort((a, b) => b - a);
  const front = hts.length >= 2 ? c.frontcourt.penalty * Math.max(0, Math.min(1, (c.frontcourt.h2Floor - hts[1]) / c.frontcourt.h2Span)) : 0;
  const drtg = c.drtgBase - sD + c.noRimPenalty * (1 - rim) + front + c.thinPerimeterPenalty * (1 - perim);
  return pyth(ortg, drtg, c.pythK);
}

// 5x5 bipartite perfect matching (augmenting paths): slot index -> pick index, or null.
export function slotAssign(masks: number[]): number[] | null {
  const slotOf = new Array<number>(5).fill(-1);
  const tryP = (pi: number, seen: boolean[]): boolean => {
    for (let s = 0; s < 5; s++) {
      if (!((masks[pi] >> s) & 1) || seen[s]) continue;
      seen[s] = true;
      if (slotOf[s] === -1 || tryP(slotOf[s], seen)) { slotOf[s] = pi; return true; }
    }
    return false;
  };
  for (let pi = 0; pi < masks.length; pi++) if (!tryP(pi, new Array(5).fill(false))) return null;
  return slotOf;
}

export function bestFive(buckets: Player[][], c: Coefficients = DEFAULT_COEFFICIENTS): CeilingFive | null {
  if (buckets.length !== 5 || buckets.some((b) => !b.length)) return null;
  // strongest cards first so a good incumbent appears early and the bound prunes hard
  const fb = buckets.map((b) => b.map((p) => featOf(p, c)).sort((x, y) => y.o + y.d - (x.o + x.d)));
  // the most any later bucket can still add, for the bound
  const restO = new Array<number>(6).fill(0), restD = new Array<number>(6).fill(0);
  for (let i = 4; i >= 0; i--) {
    restO[i] = restO[i + 1] + Math.max(...fb[i].map((f) => f.o));
    restD[i] = restD[i + 1] + Math.max(...fb[i].map((f) => f.d));
  }
  // spacing is capped at +3 and the usage penalties are never negative (a negative gamma disables pruning)
  const ortgSlack = c.overloadGamma >= 0 && c.shortfallGamma >= 0 ? Math.max(3, c.spacing.noneFloor) : Infinity;
  const drtgFloor = Math.min(0, c.noRimPenalty) + Math.min(0, c.frontcourt.penalty) + Math.min(0, c.thinPerimeterPenalty);

  let best: { wp: number; sel: Feat[] } | null = null;
  const sel: Feat[] = [];
  const go = (i: number, sO: number, sD: number) => {
    if (i === 5) {
      const wp = leanWinPct(sel, c);
      if ((!best || wp > best.wp) && slotAssign(sel.map((f) => f.mask))) best = { wp, sel: sel.slice() };
      return;
    }
    for (const f of fb[i]) {
      if (best && pyth(c.ortgBase + sO + f.o + restO[i + 1] + ortgSlack, c.drtgBase - sD - f.d - restD[i + 1] + drtgFloor, c.pythK) <= best.wp) continue;
      if (sel.some((g) => g.person === f.person)) continue;
      sel.push(f);
      go(i + 1, sO + f.o, sD + f.d);
      sel.pop();
    }
  };
  go(0, 0, 0);
  if (!best) return null;
  const won = best as { wp: number; sel: Feat[] };
  const assign = slotAssign(won.sel.map((f) => f.mask))!;
  return { winPct: won.wp, picks: SLOTS.map((slot, s) => ({ player: won.sel[assign[s]].p, slot })) };
}
