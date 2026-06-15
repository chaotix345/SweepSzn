import type { Player, Coefficients, DefModel, LineupResult, PlayerBreakdown, Slot } from "./types";

// Defaults mirror the fitted coefficients.json so the engine is sane even if the file is missing.
export const DEFAULT_COEFFICIENTS: Coefficients = {
  ortgBase: 104.407,
  drtgBase: 107.595,
  offScale: 0.6178,
  defScale: 0.742,
  pythK: 13.75,
  zCap: 3.3,
  eraStrength: { floor: 0.85, gamma: 0.7, startYear: 1950, fullYear: 1985 },
  offModel: { intercept: 0.4328, pts: 1.058, ast: 0.6331, ts: 0.9088 },
  defModel: { intercept: -2.4242, dws: 79.5313, trb: -0.7115, posC: 0.6555, posPF: 0.2915, posSF: 0.1066, posSG: -0.0155 },
  defModelEst: { intercept: -1.7504, dws: 77.2445, posC: 0.0613, posPF: -0.2484, posSF: -0.1734, posSG: -0.1265 },
  defEstCap: 5.5,
  dwsShrinkK: 40,
  leagueDwsMean: 0.02037,
  usgModel: { intercept: 21.2311, pts: 3.0339, ast: -0.4904 },
  // 110 (was 100): the median real top-5 sums ~107.5% usage, so 100 penalized 91.7% of REAL
  // teams — fantasy-regime penalties must be ~0 in-distribution. See calibrate.py USAGE_BUDGET.
  usageBudget: 110,
  overloadGamma: 0.22,
  spacing: { perShooter: 0.987, diminish: 0.55, noneFloor: -3, baseline: 1.6 },
  rim: { blkLo: 0.4, blkSpan: 1.4, trbProxyLo: 0.8, trbProxySpan: 1.6 },
  noRimPenalty: 7,
  thinPerimeterPenalty: 3,
};

const num = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? 0 : v);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function zget(p: Player, k: keyof NonNullable<Player["z"]>): number {
  const v = p.z?.[k];
  return v == null || Number.isNaN(v) ? 0 : v;
}
// z capped at the modern-era ceiling — prevents a thin early league from manufacturing a super-human z.
function zcap(p: Player, k: keyof NonNullable<Player["z"]>, c: Coefficients): number {
  return clamp(zget(p, k), -c.zCap, c.zCap);
}

function posDef(pos: string, m: DefModel): number {
  // Mapping MUST match calibrate.py's pos_oh ({"F":"SF","G":"SG"}): a generic forward "F"
  // was fit into the posSF dummy, so it must read posSF here (not posPF).
  switch (pos) {
    case "C": return m.posC;
    case "PF": return m.posPF;
    case "SF": case "F": return m.posSF;
    case "SG": case "G": return m.posSG;
    default: return 0; // PG reference
  }
}

// era-depth multiplier: 1.0 for the modern (calibration) era, tapering down for shallower early leagues.
// Documented heuristic — discounts thin/shallow early-league dominance (the data can't fit it; see DESIGN.md).
export function eraStrength(year: number, c: Coefficients): number {
  const e = c.eraStrength;
  if (!e || year >= e.fullYear) return 1;
  const t = clamp((year - e.startYear) / (e.fullYear - e.startYear), 0, 1);
  return e.floor + (1 - e.floor) * Math.pow(t, e.gamma);
}

// Every player resolves to a BPM-equivalent offensive/defensive impact (pts/100 vs avg):
// real OBPM/DBPM when available (1974+), otherwise the fitted z-model prediction, then scaled by era depth.
function offValue(p: Player, c: Coefficients): number {
  let v: number;
  if (p.obpm != null && !Number.isNaN(p.obpm)) v = p.obpm;
  else v = c.offModel.intercept + c.offModel.pts * zcap(p, "pts", c) + c.offModel.ast * zcap(p, "ast", c) + c.offModel.ts * zcap(p, "ts", c);
  return v * eraStrength(p.year, c);
}
function defValue(p: Player, c: Coefficients): number {
  let v: number;
  if (p.dbpm != null && !Number.isNaN(p.dbpm)) {
    v = p.dbpm;
  } else {
    // pre-1974 (no STL/BLK): shrink DWS-per-game toward the league mean, map through defModelEst, cap.
    // defModelEst (no trb) — NOT the legacy defModel, whose dws/intercept were fit WITH a trb term.
    const m = c.defModelEst;
    const g = p.g ?? 0;
    const rawRate = p.dws != null && g > 0 ? p.dws / g : c.leagueDwsMean;
    const effRate = (rawRate * g + c.leagueDwsMean * c.dwsShrinkK) / (g + c.dwsShrinkK);
    v = Math.min(m.intercept + m.dws * effRate + posDef(p.pos, m), c.defEstCap);
  }
  return v * eraStrength(p.year, c);
}
export function playerImpact(p: Player, c: Coefficients = DEFAULT_COEFFICIENTS) {
  return { off: round1(offValue(p, c)), def: round1(defValue(p, c)), usage: Math.round(usageDemand(p, c)) };
}

// Post-game teaching aid: which drafted SLOT added the least on-court value (offScale*off +
// defScale*def, the two terms that move ortg/drtg). Gradeless and name-less by design — it points
// at a slot, never a player or a fit number, so it closes the "which pick was my mistake?" loop
// without exposing the hint-gated per-player fit. Null when the breakdown is incomplete (cold restore).
export function weakestSlot(result: LineupResult, slots: Slot[], c: Coefficients = DEFAULT_COEFFICIENTS): Slot | null {
  const pb = result.players;
  if (!pb.length || pb.length !== slots.length) return null;
  let worstIdx = 0, worstVal = Infinity;
  for (let i = 0; i < pb.length; i++) {
    const v = c.offScale * pb[i].off + c.defScale * pb[i].def;
    if (v < worstVal) { worstVal = v; worstIdx = i; }
  }
  return slots[worstIdx];
}

export function playerFeatures(p: Player, c: Coefficients = DEFAULT_COEFFICIENTS) {
  const rimScore = playerRimScore(p, c);
  const perimPos = p.pos === "PG" || p.pos === "SG" || p.pos === "SF" || p.pos === "G";
  return {
    off: offValue(p, c), def: defValue(p, c), usage: usageDemand(p, c), shoot: shooterUnit(p),
    // rim/perim booleans are display thresholds (hints, roles); rimScore/perimScore are the
    // CONTINUOUS values lineupTerms actually sums — exported so harnesses match the engine exactly.
    rim: rimScore >= 0.5, rimScore, modern: p.year >= 1980,
    perim: perimPos && zget(p, "stl") >= 0.6,
    perimScore: perimPos ? clamp((zget(p, "stl") - 0.2) / 0.8, 0, 1) : 0,
  };
}

function usageDemand(p: Player, c: Coefficients): number {
  const u = p.usg != null && !Number.isNaN(p.usg)
    ? p.usg
    : c.usgModel.intercept + c.usgModel.pts * zcap(p, "pts", c) + c.usgModel.ast * zcap(p, "ast", c);
  return clamp(u, 5, 40);
}

// smooth 0..1 floor-spacing score (volume x accuracy), era-gated to the 3pt era
function shooterUnit(p: Player): number {
  if (p.year < 1980) return 0;
  const a = num(p.fg3a);
  if (a < 1) return 0;
  const pct = num(p.fg3) / a;
  const vol = clamp((a - 1) / 4, 0, 1);
  const acc = clamp((pct - 0.31) / 0.06, 0, 1.2);
  return vol * acc;
}

// continuous INTERIOR-PRESENCE score for one player (0 if not a big), 0..1. A big anchors the paint
// via EITHER shot-blocking (blk z) OR size/rebounding (trb z) — so a rebounding center like Jokić
// counts as interior presence even with modest blocks, while a no-big lineup scores 0. No cliff to game.
function playerRimScore(p: Player, c: Coefficients): number {
  const big = p.pos === "C" || p.pos === "PF" || p.pos === "F";
  if (!big) return 0;
  const size = clamp((zget(p, "trb") - c.rim.trbProxyLo) / c.rim.trbProxySpan, 0, 1);
  if (p.tier === "complete" || p.dbpm != null) {
    const blkBoost = num(p.dbpm) >= 1.5 ? 0.35 : 0; // elite real defensive bigs get credit even at modest blk z
    const block = clamp((zget(p, "blk") - c.rim.blkLo) / c.rim.blkSpan + blkBoost, 0, 1);
    return Math.max(block, size);
  }
  return size; // pre-1974: no blocks tracked, fall back to size/rebounding
}
function isRimProtector(p: Player, c: Coefficients): boolean {
  return playerRimScore(p, c) >= 0.5;
}

// Win-total -> grade/label. These are display constants matched to 82-0's grade boundaries
// (S>=80, A+>=72, A>=62, B>=57, C>=50, D>=40); the Pythagorean win math above is unchanged.
// Exported for the result card's grade ladder (UI reads the boundaries, never redefines them).
export const WIN_GRADES = [
  { min: 80, grade: "S", label: "PERFECT" },
  { min: 72, grade: "A+", label: "HISTORIC" },
  { min: 62, grade: "A", label: "DYNASTY" },
  { min: 57, grade: "B", label: "CONTENDER" },
  { min: 50, grade: "C", label: "PLAYOFF" },
  { min: 40, grade: "D", label: "LOTTERY" },
  { min: 0, grade: "F", label: "TANKING" },
];

// Shared lineup-construction math (used by both evaluateLineup and quickScore).
function lineupTerms(lineup: Player[], c: Coefficients) {
  let sumOff = 0, sumDef = 0, totalUsage = 0, shooterUnits = 0, perimScore = 0, rim = 0;
  let anyModern = false;
  for (const p of lineup) {
    sumOff += offValue(p, c); sumDef += defValue(p, c); totalUsage += usageDemand(p, c);
    shooterUnits += shooterUnit(p);
    rim = Math.max(rim, playerRimScore(p, c));
    // continuous perimeter-defense credit: 0 at stl z<=0.2, full at z>=1.0. The old binary gate
    // (z>=0.6 counts, else nothing) was a ~3-pt cliff between z=0.59 and z=0.61 — and gameable,
    // since coefficients.json is public. Credit accumulates across defenders.
    if (p.pos === "PG" || p.pos === "SG" || p.pos === "SF" || p.pos === "G")
      perimScore += clamp((zget(p, "stl") - 0.2) / 0.8, 0, 1);
    if (p.year >= 1980) anyModern = true;
  }
  const overloadPenalty = c.overloadGamma * Math.max(0, totalUsage - c.usageBudget);
  const effShoot = shooterUnits <= 3 ? shooterUnits : 3 + (shooterUnits - 3) * c.spacing.diminish;
  const spacing = anyModern ? clamp(c.spacing.perShooter * (effShoot - c.spacing.baseline), c.spacing.noneFloor, 3) : 0;
  // Interior-presence penalty: a lineup with no real big (rim score 0) concedes the rim, the post,
  // and the defensive glass — the combined cost of zero size. Continuous in the best big's quality,
  // and CV-safe because every real NBA top-5 has at least one big (so it is ~0 in-distribution).
  const rimAdj = c.noRimPenalty * (1 - rim);
  const perimAdj = c.thinPerimeterPenalty * clamp(1 - perimScore, 0, 1);

  const ortg = c.ortgBase + c.offScale * sumOff + spacing - overloadPenalty;
  const drtg = c.drtgBase - c.defScale * sumDef + rimAdj + perimAdj;
  return { sumOff, sumDef, totalUsage, shooterUnits, perimScore, rim, spacing, overloadPenalty, rimAdj, perimAdj, ortg, drtg };
}

function winsFrom(ortg: number, drtg: number, k: number) {
  const oP = Math.pow(Math.max(1, ortg), k);
  const dP = Math.pow(Math.max(1, drtg), k);
  const winPct = oP / (oP + dP);
  return { winPct, wins: Math.max(0, Math.min(82, Math.round(82 * winPct))) };
}

export function evaluateLineup(lineup: Player[], coeff: Coefficients = DEFAULT_COEFFICIENTS): LineupResult {
  const c = coeff;
  if (!lineup.length) {
    return { ortg: c.ortgBase, drtg: c.drtgBase, netRtg: 0, wins: 0, losses: 82, winPct: 0,
      grade: "F", label: "TANKING", factors: [], players: [], notes: ["Empty lineup"] };
  }

  const pb: PlayerBreakdown[] = lineup.map((p) => {
    const f = playerFeatures(p, c);
    return {
      id: p.id, name: p.name, off: f.off, def: f.def,
      usage: f.usage, shooter: f.shoot >= 0.4, rimProtector: isRimProtector(p, c),
      shoot: Math.round(f.shoot * 100) / 100,
      rimScore: Math.round(f.rimScore * 100) / 100,
      perimScore: Math.round(f.perimScore * 100) / 100,
    };
  });

  const t = lineupTerms(lineup, c);
  const netRtg = t.ortg - t.drtg;
  const { winPct, wins } = winsFrom(t.ortg, t.drtg, c.pythK);
  const g = WIN_GRADES.find((x) => wins >= x.min) || WIN_GRADES[WIN_GRADES.length - 1];

  // Era adjustment: isolate the cost ALREADY embedded in off/def by the eraStrength multiplier,
  // so pre-1985 lineups see why they rate lower. Display-only — ortg/drtg/wins are untouched
  // (off = raw*s, so raw - off = off*(1/s - 1); split per side for the counterfactual below).
  let eraOffLoss = 0, eraDefLoss = 0;
  for (let i = 0; i < lineup.length; i++) {
    const s = eraStrength(lineup[i].year, c);
    if (s < 1) {
      eraOffLoss += c.offScale * pb[i].off * (1 / s - 1);
      eraDefLoss += c.defScale * pb[i].def * (1 / s - 1);
    }
  }
  const eraLoss = eraOffLoss + eraDefLoss;

  // Exact win-equivalent of a factor for THIS lineup: wins as-is minus wins with the factor
  // removed (dOrtg/dDrtg applied), through the same Pythagorean curve. Honest at the extremes
  // where a linear wins-per-point constant overstates (the curve flattens near 70+ wins).
  const winsNow = wins;
  const winsEst = (dOrtg: number, dDrtg: number) => winsNow - winsFrom(t.ortg + dOrtg, t.drtg + dDrtg, c.pythK).wins;

  const factors: LineupResult["factors"] = [];
  factors.push({ label: "Star offense", value: round1(c.offScale * t.sumOff), kind: "good" });
  factors.push({ label: "Star defense", value: round1(c.defScale * t.sumDef), kind: "good" });
  if (t.overloadPenalty > 0.2) factors.push({ label: `Usage overload (${Math.round(t.totalUsage)}% demand)`, value: -round1(t.overloadPenalty), kind: "bad",
    winsEst: winsEst(t.overloadPenalty, 0) });
  if (Math.abs(t.spacing) > 0.2) factors.push({ label: `Spacing (${t.shooterUnits.toFixed(1)} shooters)`, value: round1(t.spacing), kind: t.spacing > 0 ? "good" : "bad",
    winsEst: winsEst(-t.spacing, 0) });
  if (t.rimAdj > 0.2) factors.push({ label: t.rim > 0 ? "Thin interior size" : "No interior size", value: -round1(t.rimAdj), kind: "bad",
    winsEst: winsEst(0, -t.rimAdj) });
  if (t.perimAdj > 0.2) factors.push({ label: t.perimScore > 0 ? "Thin perimeter defense" : "No perimeter defender", value: -round1(t.perimAdj), kind: "bad",
    winsEst: winsEst(0, -t.perimAdj) });
  if (eraLoss > 0.5) factors.push({ label: "Era adjustment", value: -round1(eraLoss), kind: "bad",
    winsEst: winsEst(eraOffLoss, -eraDefLoss) });
  factors.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const notes: string[] = [];
  if (lineup.some((p) => p.defense_estimated))
    notes.push("Defense for pre-1974 players is estimated and uncertain — steals/blocks weren't tracked, and box-score rebounding barely predicts defensive impact (shrunk toward a position prior).");
  if (lineup.some((p) => p.year < c.eraStrength.fullYear))
    notes.push("Pre-1985 players are era-adjusted: their box dominance is discounted for the shallower, less competitive league they faced.");

  return { ortg: round1(t.ortg), drtg: round1(t.drtg), netRtg: round1(netRtg), wins, losses: 82 - wins,
    winPct: round3(winPct), grade: g.grade, label: g.label, factors, players: pb, notes };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

// Fast path for search/optimization: same math as evaluateLineup, no breakdown objects.
export function quickScore(lineup: Player[], c: Coefficients = DEFAULT_COEFFICIENTS): { wins: number; netRtg: number; winPct: number } {
  if (!lineup.length) return { wins: 0, netRtg: 0, winPct: 0 };
  const t = lineupTerms(lineup, c);
  const { winPct, wins } = winsFrom(t.ortg, t.drtg, c.pythK);
  return { wins, netRtg: t.ortg - t.drtg, winPct };
}
