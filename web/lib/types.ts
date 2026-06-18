export type Pos = "PG" | "SG" | "SF" | "PF" | "C" | "G" | "F";
export type Slot = "PG" | "SG" | "SF" | "PF" | "C";
export type Tier = "complete" | "partial" | "primitive";
// Descriptive draft-board tags derived from intrinsic box stats (thresholds live in lib/traits.ts).
export type TraitKey = "sniper" | "shooter" | "rim" | "glass" | "playmaker" | "lockdown" | "efficient" | "volume";

export type ThreePtEraKey = "pre" | "early" | "modern" | "three_ball";
// Descriptive league-era snapshot for a draftable decade (built in lib/leagueContext.ts), attached to
// every non-Prime spin so the board can frame raw stats in their era. Public historical context only —
// never an engine/fit signal (DESIGN.md §12 trust model).
export interface EraContext {
  decade: string;
  label: string;            // e.g. "1980s NBA"
  pace: number | null;      // decade-average pace (null for pre-tracking eras)
  ppgEnv: number | null;    // decade-average qualified per-player scoring
  era3pt: { key: ThreePtEraKey; label: string };
}

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
  fame?: number; // accolade-based recognizability score (data/build_fame.py); drives the "Top" sort
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
  usage?: number;       // engine usage demand — sent on every spin for the live budget bar (intrinsic public player data, not seed-relative — DESIGN.md §12)
  traits?: TraitKey[];  // descriptive board tags derived from intrinsic stats (see lib/traits.ts) — informs without revealing fit
  rank?: number;        // server-assigned board ordinal (0 = top of the "Top"/szn order); client sorts "szn" by this
}

// Daily leaderboard: the client submits the draft as an ordered trace (index = round) so the
// server can replay today's deterministic spins and verify every pick was legal.
export type DraftStep = { slot: Slot; pickedId: string; respins: ("team" | "era")[] };
export interface DailySubmission { date: string; uid: string; name: string; trace: DraftStep[] }
export interface LeaderboardRow { rank: number; uid: string; name: string; wins: number; losses: number; net: number; lineup: string }
export interface LeaderboardView { date: string; total: number; top: LeaderboardRow[]; you?: LeaderboardRow }

// Weekly + all-time boards rank by CUMULATIVE wins (a single number), not a W-L record — so the
// row deliberately omits losses/net/lineup (don't reuse StoredRow, whose fields would be undefined).
export interface AggRow { uid: string; name: string; wins: number }
export interface AggLeaderboardRow extends AggRow { rank: number }
export interface AggBoardView { scope: "week" | "alltime"; key: string; total: number; top: AggLeaderboardRow[]; you?: AggLeaderboardRow }

// H2H Challenge: a shared draft seed (h2h-<id>) + the creator's verified result as the bar.
// The board reuses the leaderboard row/store shape; lineups are only ever sent to a uid that
// has itself submitted (public reads are redacted).
// `seed` is the draft seed responders replay. For a challenge built fresh in "Challenge a Friend"
// mode it is "h2h-<id>"; for one converted from a finished Daily/Classic/HoopIQ game it is that
// game's original seed, so the friend drafts the SAME teams and eras and tries to beat THIS five.
export interface ChallengeInfo { uid: string; name: string; wins: number; losses: number; net: number; grade: string; lineup: string; seed?: string; hinted?: boolean }
export interface ChallengeMiniPlayer { id: string; name: string; team: string; decade: string; slot: Slot }
export interface ChallengeVerdict { outcome: "win" | "loss" | "tie"; winsMargin: number; netMargin: number }
// no uid: the challenge board never exposes others' uids (so they can't be harvested + impersonated)
// and never exposes anyone's five. "you" is identified server-side and returned as board.you.
export interface ChallengeBoardRow { rank: number; name: string; wins: number; losses: number; net: number }
export interface ChallengeBoard { total: number; top: ChallengeBoardRow[]; you?: ChallengeBoardRow }
export interface ChallengePublic { id: string; creatorName: string; wins: number; losses: number; net: number; grade: string; responders: number; seed: string; hinted: boolean }
export type ChallengeSubmitResponse =
  | { role: "creator"; id: string; board: ChallengeBoard }
  | {
      role: "responder"; id: string;
      // creatorResultUrl is an opaque permalink; the raw lineup string is never sent to the client.
      creator: { name: string; wins: number; losses: number; net: number; grade: string; hinted: boolean; creatorResultUrl: string; players: ChallengeMiniPlayer[] };
      verdict: ChallengeVerdict;
      board: ChallengeBoard;
    };

// The creator's own dashboard for a challenge they made: their five plus every responder's five and
// verdict. Only ever returned to the creator (uid === info.uid), since creating the challenge IS the
// creator's submission — so the "reveal after you've played" rule already entitles them to see it.
// `outcome` is the RESPONDER's result vs the creator (a "win" means the responder beat the creator).
export interface ChallengeOwnerResponder {
  rank: number; name: string; wins: number; losses: number; net: number;
  outcome: "win" | "loss" | "tie"; winsMargin: number; netMargin: number;
  players: ChallengeMiniPlayer[]; resultUrl: string;
}
export interface ChallengeOwnerView {
  id: string;
  creator: { name: string; wins: number; losses: number; net: number; grade: string; hinted: boolean; rank: number | null; players: ChallengeMiniPlayer[]; resultUrl: string };
  total: number;
  responders: ChallengeOwnerResponder[];
}

// Re-engagement notifications (challenge responses). Written server-side ONLY inside the verified
// submit path; read via the uid-gated /api/notifications inbox. The payload carries only
// non-sensitive data already on / derivable from the public challenge board (a display name + a W-L
// record + an unguessable challenge id) — no lineup, no uid. `outcome` is from the CREATOR's POV
// (the notified party): "beaten" = a responder beat the creator's bar, "held" = the creator held.
export interface Notif {
  id: string;
  type: "challenge_response";
  challengeId: string;
  opponent: string;
  outcome: "beaten" | "tied" | "held";
  tookLead: boolean;
  oppWins: number; oppLosses: number;
  yourWins: number; yourLosses: number;
  ts: number;
}
export interface NotifView { items: Notif[]; unread: number }

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
  shoot?: number;
  rimScore?: number;
  perimScore?: number;
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
  // winsEst: exact counterfactual wins effect of this factor for THIS lineup (wins with the
  // factor minus wins with it removed, through the Pythagorean curve). Absent on level terms
  // (Star offense/defense), which are the rating itself rather than a delta.
  factors: { label: string; value: number; kind: "good" | "bad"; winsEst?: number }[];
  players: PlayerBreakdown[];
  notes: string[];
}
