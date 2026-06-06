import type { Player, Coefficients, LineupResult, PlayerBreakdown } from "./types";

// Defaults mirror the fitted coefficients.json so the engine is sane even if the file is missing.
export const DEFAULT_COEFFICIENTS: Coefficients = {
  ortgBase: 104.4,
  drtgBase: 107.6,
  offScale: 0.618,
  defScale: 0.742,
  pythK: 14,
  offModel: { intercept: 0.43, pts: 1.06, ast: 0.63, ts: 0.91 },
  defModel: { intercept: -2.42, dws: 79.53, trb: -0.71, posC: 0.66, posPF: 0.29, posSF: 0.11, posSG: -0.02 },
  usgModel: { intercept: 21.2, pts: 3.03, ast: -0.49 },
  usageBudget: 100,
  overloadGamma: 0.2,
  spacing: { perShooter: 1.4, diminish: 0.55, noneFloor: -3, baseline: 1.6 },
  noRimPenalty: 5,
  thinPerimeterPenalty: 3,
};

const num = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? 0 : v);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function zget(p: Player, k: keyof NonNullable<Player["z"]>): number {
  const v = p.z?.[k];
  return v == null || Number.isNaN(v) ? 0 : v;
}

function posDef(pos: string, c: Coefficients): number {
  switch (pos) {
    case "C": return c.defModel.posC;
    case "PF": case "F": return c.defModel.posPF;
    case "SF": return c.defModel.posSF;
    case "SG": case "G": return c.defModel.posSG;
    default: return 0; // PG reference
  }
}

// Every player resolves to a BPM-equivalent offensive/defensive impact (pts/100 vs avg):
// real OBPM/DBPM when available, otherwise the fitted z-model prediction (pre-1974/78).
function offValue(p: Player, c: Coefficients): number {
  if (p.obpm != null && !Number.isNaN(p.obpm)) return p.obpm;
  return c.offModel.intercept + c.offModel.pts * zget(p, "pts") + c.offModel.ast * zget(p, "ast") + c.offModel.ts * zget(p, "ts");
}
function defValue(p: Player, c: Coefficients): number {
  if (p.dbpm != null && !Number.isNaN(p.dbpm)) return p.dbpm;
  const dwsRate = p.dws != null && p.g ? p.dws / p.g : 0; // defensive win shares per game (uses team-defense context)
  return c.defModel.intercept + c.defModel.dws * dwsRate + c.defModel.trb * zget(p, "trb") + posDef(p.pos, c);
}
export function playerImpact(p: Player, c: Coefficients = DEFAULT_COEFFICIENTS) {
  return { off: round1(offValue(p, c)), def: round1(defValue(p, c)), usage: Math.round(usageDemand(p, c)) };
}

export function playerFeatures(p: Player, c: Coefficients = DEFAULT_COEFFICIENTS) {
  return {
    off: offValue(p, c), def: defValue(p, c), usage: usageDemand(p, c), shoot: shooterUnit(p),
    rim: isRimProtector(p), modern: p.year >= 1980,
    perim: (p.pos === "PG" || p.pos === "SG" || p.pos === "SF" || p.pos === "G") && zget(p, "stl") >= 0.6,
  };
}

function usageDemand(p: Player, c: Coefficients): number {
  const u = p.usg != null && !Number.isNaN(p.usg)
    ? p.usg
    : c.usgModel.intercept + c.usgModel.pts * zget(p, "pts") + c.usgModel.ast * zget(p, "ast");
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

function isRimProtector(p: Player): boolean {
  const big = p.pos === "C" || p.pos === "PF" || p.pos === "F";
  if (!big) return false;
  if (p.tier === "complete") return zget(p, "blk") >= 0.8 || num(p.dbpm) >= 1.5;
  return zget(p, "trb") >= 1.2;
}

// Win-total -> grade/label. These are display constants matched to 82-0's grade boundaries
// (S>=80, A+>=72, A>=62, B>=57, C>=50, D>=40); the Pythagorean win math above is unchanged.
const WIN_GRADES = [
  { min: 80, grade: "S", label: "PERFECT" },
  { min: 72, grade: "A+", label: "HISTORIC" },
  { min: 62, grade: "A", label: "DYNASTY" },
  { min: 57, grade: "B", label: "CONTENDER" },
  { min: 50, grade: "C", label: "PLAYOFF" },
  { min: 40, grade: "D", label: "LOTTERY" },
  { min: 0, grade: "F", label: "TANKING" },
];

export function evaluateLineup(lineup: Player[], coeff: Coefficients = DEFAULT_COEFFICIENTS): LineupResult {
  const c = coeff;
  if (!lineup.length) {
    return { ortg: c.ortgBase, drtg: c.drtgBase, netRtg: 0, wins: 0, losses: 82, winPct: 0,
      grade: "F", label: "TANKING", factors: [], players: [], notes: ["Empty lineup"] };
  }

  const pb: PlayerBreakdown[] = lineup.map((p) => ({
    id: p.id, name: p.name, off: offValue(p, c), def: defValue(p, c),
    usage: usageDemand(p, c), shooter: shooterUnit(p) >= 0.4, rimProtector: isRimProtector(p),
  }));

  const sumOff = pb.reduce((a, x) => a + x.off, 0);
  const sumDef = pb.reduce((a, x) => a + x.def, 0);
  const totalUsage = pb.reduce((a, x) => a + x.usage, 0);

  // usage overload: a real starting five shares ~100% usage; cramming high-usage stars
  // demands far more than one ball allows. Continuous penalty (no gameable threshold).
  const overload = Math.max(0, totalUsage - c.usageBudget);
  const overloadPenalty = c.overloadGamma * overload;

  // continuous spacing (beyond what individual OBPM already credits)
  const shooterUnits = lineup.reduce((a, p) => a + shooterUnit(p), 0);
  const anyModern = lineup.some((p) => p.year >= 1980);
  const effShoot = shooterUnits <= 3 ? shooterUnits : 3 + (shooterUnits - 3) * c.spacing.diminish;
  const spacing = anyModern ? clamp(c.spacing.perShooter * (effShoot - c.spacing.baseline), c.spacing.noneFloor, 3) : 0;

  // defensive structure
  const hasRim = pb.some((x) => x.rimProtector);
  const perimeterD = lineup.filter((p) => (p.pos === "PG" || p.pos === "SG" || p.pos === "SF" || p.pos === "G") && zget(p, "stl") >= 0.6).length;
  const rimAdj = hasRim ? 0 : c.noRimPenalty;
  const perimAdj = perimeterD >= 1 ? 0 : c.thinPerimeterPenalty;

  const ortg = c.ortgBase + c.offScale * sumOff + spacing - overloadPenalty;
  const drtg = c.drtgBase - c.defScale * sumDef + rimAdj + perimAdj;
  const netRtg = ortg - drtg;

  const k = c.pythK;
  const oP = Math.pow(Math.max(1, ortg), k);
  const dP = Math.pow(Math.max(1, drtg), k);
  const winPct = oP / (oP + dP);
  const wins = Math.max(0, Math.min(82, Math.round(82 * winPct)));
  const g = WIN_GRADES.find((x) => wins >= x.min) || WIN_GRADES[WIN_GRADES.length - 1];

  const factors: LineupResult["factors"] = [];
  factors.push({ label: "Star offense", value: round1(c.offScale * sumOff), kind: "good" });
  factors.push({ label: "Star defense", value: round1(c.defScale * sumDef), kind: "good" });
  if (overloadPenalty > 0.2) factors.push({ label: `Usage overload (${Math.round(totalUsage)}% demand)`, value: -round1(overloadPenalty), kind: "bad" });
  if (Math.abs(spacing) > 0.2) factors.push({ label: `Spacing (${shooterUnits.toFixed(1)} shooters)`, value: round1(spacing), kind: spacing > 0 ? "good" : "bad" });
  if (rimAdj > 0) factors.push({ label: "No rim protection", value: -rimAdj, kind: "bad" });
  if (perimAdj > 0) factors.push({ label: "No perimeter defender", value: -perimAdj, kind: "bad" });
  factors.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const notes: string[] = [];
  if (lineup.some((p) => p.defense_estimated))
    notes.push("Defense for pre-1974 players is estimated and uncertain — steals/blocks weren't tracked, and box-score rebounding barely predicts defensive impact.");

  return { ortg: round1(ortg), drtg: round1(drtg), netRtg: round1(netRtg), wins, losses: 82 - wins,
    winPct: round3(winPct), grade: g.grade, label: g.label, factors, players: pb, notes };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

// Fast path for search/optimization: same math as evaluateLineup, no breakdown objects.
export function quickScore(lineup: Player[], c: Coefficients = DEFAULT_COEFFICIENTS): { wins: number; netRtg: number; winPct: number } {
  if (!lineup.length) return { wins: 0, netRtg: 0, winPct: 0 };
  let sumOff = 0, sumDef = 0, totalUsage = 0, shooterUnits = 0, perim = 0;
  let hasRim = false, anyModern = false;
  for (const p of lineup) {
    sumOff += offValue(p, c); sumDef += defValue(p, c); totalUsage += usageDemand(p, c);
    shooterUnits += shooterUnit(p);
    if (isRimProtector(p)) hasRim = true;
    if ((p.pos === "PG" || p.pos === "SG" || p.pos === "SF" || p.pos === "G") && zget(p, "stl") >= 0.6) perim++;
    if (p.year >= 1980) anyModern = true;
  }
  const overloadPenalty = c.overloadGamma * Math.max(0, totalUsage - c.usageBudget);
  const effShoot = shooterUnits <= 3 ? shooterUnits : 3 + (shooterUnits - 3) * c.spacing.diminish;
  const spacing = anyModern ? clamp(c.spacing.perShooter * (effShoot - c.spacing.baseline), c.spacing.noneFloor, 3) : 0;
  const ortg = c.ortgBase + c.offScale * sumOff + spacing - overloadPenalty;
  const drtg = c.drtgBase - c.defScale * sumDef + (hasRim ? 0 : c.noRimPenalty) + (perim >= 1 ? 0 : c.thinPerimeterPenalty);
  const k = c.pythK;
  const oP = Math.pow(Math.max(1, ortg), k), dP = Math.pow(Math.max(1, drtg), k);
  const winPct = oP / (oP + dP);
  return { wins: Math.max(0, Math.min(82, Math.round(82 * winPct))), netRtg: ortg - drtg, winPct };
}
