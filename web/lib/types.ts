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

// Trimmed player projection sent to the client during the draft (full stats stay server-side).
export interface DraftCandidate {
  id: string;
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
}

export interface Coefficients {
  ortgBase: number;
  drtgBase: number;
  offScale: number;
  defScale: number;
  pythK: number;
  // fitted z-score -> impact models (used when a player lacks real OBPM/DBPM/USG, i.e. pre-1974/78)
  offModel: { intercept: number; pts: number; ast: number; ts: number };
  defModel: { intercept: number; dws: number; trb: number; posC: number; posPF: number; posSF: number; posSG: number };
  usgModel: { intercept: number; pts: number; ast: number };
  usageBudget: number;
  overloadGamma: number;
  spacing: { perShooter: number; diminish: number; noneFloor: number; baseline: number };
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
