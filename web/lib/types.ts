export type Pos = "PG" | "SG" | "SF" | "PF" | "C" | "G" | "F";
export type Slot = "PG" | "SG" | "SF" | "PF" | "C";
export type Tier = "complete" | "partial" | "primitive";

export interface ZScores {
  pts?: number | null;
  trb?: number | null;
  orb?: number | null;
  drb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
  tov?: number | null;
  ts?: number | null;
}

export interface Player {
  id: string;
  person_id?: string; // stable real-person key shared by franchise/era variants
  name: string;
  year: number;
  decade: string;
  tier: Tier;
  team: string;
  pos: Pos;
  eligible?: Slot[]; // positions this player can be slotted at (82-0-style multi-pos eligibility)
  age?: number | null;
  g?: number | null;
  mp?: number | null;
  pts?: number | null;
  trb?: number | null;
  orb?: number | null;
  drb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
  tov?: number | null;
  fg3?: number | null;
  fg3a?: number | null;
  ts?: number | null;
  usg?: number | null;
  obpm?: number | null;
  dbpm?: number | null;
  bpm?: number | null;
  vorp?: number | null;
  per?: number | null;
  ows?: number | null;
  dws?: number | null;
  z?: ZScores;
  defense_estimated?: boolean;
  peak_score?: number;
}

// Roster-aware "reveal before confirm" signal: how much this candidate would help the
// lineup drafted SO FAR, and which need they fill. Computed server-side per spin.
export interface CandidateFit {
  delta: number;        // marginal net-rating swing if added to the current roster now
  tier: "elite" | "strong" | "solid" | "marginal"; // relative to this spin's candidates
  best: boolean;        // the single best fit available in this spin
  adds: string[];       // gaps this player fills for YOUR roster, e.g. ["Rim protection", "Spacing"]
}

// Trimmed player projection sent to the client during the draft (full stats stay server-side).
export interface DraftCandidate {
  id: string;
  person_id?: string;
  name: string;
  year: number;
  decade: string;
  team: string;
  pos: Pos;
  eligible: Slot[];
  pts?: number | null;
  trb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
  defense_estimated?: boolean;
  fit?: CandidateFit;
}

export interface DefModel {
  intercept: number; dws: number; posC: number; posPF: number; posSF: number; posSG: number; trb?: number;
}

export interface Coefficients {
  ortgBase: number;
  drtgBase: number;
  offScale: number;
  defScale: number;
  pythK: number;
  // cap on |z| applied at prediction time so a thin early league can't manufacture a super-human z
  zCap: number;
  // era-depth multiplier on per-player impact: 1.0 for year>=fullYear (modern), ramps to `floor` by startYear
  eraStrength: { floor: number; gamma: number; startYear: number; fullYear: number };
  // fitted z-score -> impact models (used when a player lacks real OBPM/DBPM/USG, i.e. pre-1974/78)
  offModel: { intercept: number; pts: number; ast: number; ts: number };
  defModel: DefModel;        // legacy (dws+trb+pos) — kept for reference; NOT used by the engine
  defModelEst: DefModel;     // pre-1974 defense path: shrunk dws + position, no trb collinearity artifact
  defEstCap: number;         // pre-era ceiling for estimated DBPM (max real DBPM in 1974+ training data); applied before the era multiplier
  dwsShrinkK: number;        // Bayesian shrinkage strength for DWS/g toward the league mean
  leagueDwsMean: number;     // prior mean DWS/g
  usgModel: { intercept: number; pts: number; ast: number };
  usageBudget: number;
  overloadGamma: number;
  spacing: { perShooter: number; diminish: number; noneFloor: number; baseline: number };
  // continuous rim protection: best big's blk z (or trb z proxy pre-1974) mapped 0..1 over [lo, lo+span]
  rim: { blkLo: number; blkSpan: number; trbProxyLo: number; trbProxySpan: number };
  noRimPenalty: number;
  thinPerimeterPenalty: number;
}

export interface PlayerBreakdown {
  id: string;
  name: string;
  off: number;
  def: number;
  usage: number;
  shooter: boolean;
  rimProtector: boolean;
}

export interface LineupResult {
  ortg: number;
  drtg: number;
  netRtg: number;
  wins: number;
  losses: number;
  winPct: number;
  grade: string;
  label: string;
  factors: { label: string; value: number; kind: "good" | "bad" }[];
  players: PlayerBreakdown[];
  notes: string[];
}
