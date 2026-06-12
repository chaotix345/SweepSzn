import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Player, Coefficients, DraftCandidate, CandidateFit, Slot } from "./types";
import { DEFAULT_COEFFICIENTS, quickScore, playerFeatures } from "./engine";
import { buildPrimePools, type PrimePools } from "./prime";
import { mulberry32, strSeed } from "./rng";

const DATA_DIR = path.join(process.cwd(), "public", "data");

const CURRENT = new Set(
  "ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS".split(" ")
);
const DECADES = new Set(["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]);

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

let _cache: {
  players: Player[];
  byId: Map<string, Player>;
  draftIndex: Map<string, Player[]>; // "TEAM|DECADE" -> players
  draftKeys: string[];
  teamsByDecade: Map<string, string[]>;
  decadesByTeam: Map<string, string[]>;
  coeff: Coefficients;
} | null = null;

function load() {
  if (_cache) return _cache;
  const players = readJson<Player[]>("players.json", []);
  const coeffRaw = readJson<Partial<Coefficients>>("coefficients.json", {});
  const coeff: Coefficients = { ...DEFAULT_COEFFICIENTS, ...coeffRaw };

  const byId = new Map<string, Player>();
  const draftIndex = new Map<string, Player[]>();
  const teamsByDecade = new Map<string, string[]>();
  const decadesByTeam = new Map<string, string[]>();
  const teamSeen = new Map<string, Set<string>>();
  const decSeen = new Map<string, Set<string>>();

  for (const p of players) {
    p.person_id ??= p.name.toLowerCase().replace(/['.]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    byId.set(p.id, p);
    // 82-0 parity: only current franchises, only the 1960s–2020s decades are draftable
    if (!CURRENT.has(p.team) || !DECADES.has(p.decade)) continue;
    const key = `${p.team}|${p.decade}`;
    if (!draftIndex.has(key)) draftIndex.set(key, []);
    draftIndex.get(key)!.push(p);

    if (!teamSeen.has(p.decade)) teamSeen.set(p.decade, new Set());
    teamSeen.get(p.decade)!.add(p.team);
    if (!decSeen.has(p.team)) decSeen.set(p.team, new Set());
    decSeen.get(p.team)!.add(p.decade);
  }
  for (const [dec, set] of teamSeen) teamsByDecade.set(dec, [...set]);
  for (const [team, set] of decSeen) decadesByTeam.set(team, [...set]);
  const draftKeys = [...draftIndex.keys()];

  _cache = { players, byId, draftIndex, draftKeys, teamsByDecade, decadesByTeam, coeff };
  return _cache;
}

export function getCoefficients(): Coefficients {
  return load().coeff;
}

export function getPlayersByIds(ids: string[]): Player[] {
  const { byId } = load();
  return ids.map((id) => byId.get(id)).filter((p): p is Player => !!p);
}

function toCandidate(p: Player, fit?: CandidateFit, usage?: number): DraftCandidate {
  return {
    id: p.id, person_id: p.person_id, name: p.name, year: p.year, decade: p.decade, team: p.team,
    pos: p.pos, eligible: (p.eligible && p.eligible.length ? p.eligible : [p.pos as Slot]),
    pts: p.pts, trb: p.trb, ast: p.ast, stl: p.stl, blk: p.blk, defense_estimated: p.defense_estimated, fit, usage,
  };
}

// A replacement-level filler (≈ -2 OBPM / -1 DBPM wing, no rim/shooting/steals). Used to pad a
// partial roster to a full 5 so fit is measured in a real 5-man context — otherwise a 1-man lineup
// eats the no-rim / thin-perimeter penalties and every candidate looks negative.
function filler(i: number): Player {
  return {
    id: `__filler_${i}`, name: "Replacement", year: 2015, decade: "2010s", tier: "complete",
    team: "FA", pos: "SF", g: 70, mp: 24, obpm: -2, dbpm: -1, usg: 18,
  } as Player;
}
const FILLERS: Player[] = [0, 1, 2, 3, 4].map(filler);

// "Reveal before confirm": for each candidate, their value OVER a replacement player given the
// roster drafted so far (VORP-style net-rating swing), plus the specific need they fill. Roster-aware
// — a rim protector scores higher precisely when the lineup lacks one. Tiers are relative to the spin.
function computeFits(drafted: Player[], cands: Player[], c: Coefficients): Map<string, CandidateFit> {
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const feats = drafted.map((p) => playerFeatures(p, c));
  const need = {
    rim: !feats.some((f) => f.rim),
    spacing: feats.reduce((a, f) => a + f.shoot, 0) < 2,
    perim: !feats.some((f) => f.perim),
    playmaking: !drafted.some((p) => (p.ast ?? 0) >= 6),
  };
  const slots = 5 - drafted.length;                          // open starting slots
  const base = [...drafted, ...FILLERS.slice(0, slots)];     // full 5 with replacement fillers
  const baseNet = quickScore(base, c).netRtg;

  const raw = cands.map((p) => {
    const f = playerFeatures(p, c);
    // swap one replacement filler for this candidate, keep a full 5-man lineup
    const delta = quickScore([...drafted, p, ...FILLERS.slice(0, slots - 1)], c).netRtg - baseNet;
    const gap: string[] = [];
    if (need.rim && f.rim) gap.push("Rim protection");
    if (need.spacing && f.shoot >= 0.4) gap.push("Spacing");
    if (need.perim && f.perim) gap.push("Perimeter D");
    if (need.playmaking && (p.ast ?? 0) >= 6) gap.push("Playmaking");
    const generic: string[] = [];
    if (f.def >= 3) generic.push("Defense");
    if (f.off >= 5) generic.push("Scoring");
    const adds = [...gap, ...generic].slice(0, 2);
    return { id: p.id, delta, adds };
  });

  const maxDelta = Math.max(0.001, ...raw.map((r) => r.delta));
  const bestId = raw.reduce((a, b) => (b.delta > a.delta ? b : a), raw[0])?.id;
  const out = new Map<string, CandidateFit>();
  for (const r of raw) {
    const ratio = r.delta / maxDelta;
    const tier: CandidateFit["tier"] = ratio >= 0.85 ? "elite" : ratio >= 0.6 ? "strong" : ratio >= 0.3 ? "solid" : "marginal";
    out.set(r.id, { delta: round1(r.delta), tier, best: r.id === bestId, adds: r.adds });
  }
  return out;
}

export interface SpinOptions {
  exclude?: string[];        // already-drafted player ids
  lockedTeam?: string | null;    // "re-spin era": keep this team, roll a new decade
  lockedDecade?: string | null;  // "re-spin team": keep this decade, roll a new team
  excludeTeam?: string | null;   // don't land on this team again (on team re-spin)
  excludeDecade?: string | null; // don't land on this decade again (on era re-spin)
  salt?: number;             // bump to vary a deterministic (Daily) re-spin
}

export interface SpinResult {
  team: string;
  decade: string;
  candidates: DraftCandidate[];
}

// Spin a (team, decade) like 82-0: uniform over populated combos, full roster returned.
// `seed` makes it deterministic (Daily). Locks/excludes implement the two one-time skips.
// Shared (team, decade, available pool) selection — the deterministic core of a spin.
// Both spin() (adds draft-fit) and spinPool() (ids only, for leaderboard verification) use it.
function selectSpin(seed: string, round: number, opts: SpinOptions): { team: string; decade: string; pool: Player[] } {
  const { byId, draftIndex, draftKeys, teamsByDecade, decadesByTeam } = load();
  const excludeIds = new Set(opts.exclude ?? []);
  const excludePeople = new Set([...excludeIds].map((id) => byId.get(id)?.person_id ?? id));
  const rng = mulberry32(strSeed(seed) ^ (round * 2654435761) ^ ((opts.salt ?? 0) * 40503));
  const available = (p: Player) => !excludeIds.has(p.id) && !excludePeople.has(p.person_id ?? p.id);
  const undrafted = (k: string) => (draftIndex.get(k) ?? []).some(available);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];

  let team: string, decade: string;
  if (opts.lockedDecade) {
    // re-spin team: keep the decade, choose a different team that still has an undrafted player
    decade = opts.lockedDecade;
    let teams = (teamsByDecade.get(decade) ?? []).filter((t) => t !== opts.excludeTeam && undrafted(`${t}|${decade}`));
    if (!teams.length) teams = (teamsByDecade.get(decade) ?? []).filter((t) => t !== opts.excludeTeam);
    if (!teams.length) teams = teamsByDecade.get(decade) ?? [];
    team = pick(teams);
  } else if (opts.lockedTeam) {
    // re-spin era: keep the team, choose a different decade it has
    team = opts.lockedTeam;
    let decs = (decadesByTeam.get(team) ?? []).filter((d) => d !== opts.excludeDecade && undrafted(`${team}|${d}`));
    if (!decs.length) decs = (decadesByTeam.get(team) ?? []).filter((d) => d !== opts.excludeDecade);
    if (!decs.length) decs = decadesByTeam.get(team) ?? [];
    decade = pick(decs);
  } else {
    const usable = draftKeys.filter(undrafted);
    const key = pick(usable.length ? usable : draftKeys);
    [team, decade] = key.split("|");
  }

  const pool = (draftIndex.get(`${team}|${decade}`) ?? [])
    .filter(available)
    .sort((a, b) => (b.peak_score ?? 0) - (a.peak_score ?? 0));
  return { team, decade, pool };
}

// Fit grades are a Classic-style assist. They are attached ONLY when the caller asks for them
// (wantFit) AND the seed is a Classic free-play seed or a Blueprint daily seed (Blueprint follows
// Classic's hint rules by design — its board rows carry the hint stamp). This keeps the
// per-candidate fit deltas off the wire entirely for Daily, HoopIQ, and every Challenge (incl. a
// Classic-originated one, where the carried seed still starts with "classic-" but the responder
// draft does NOT request fit) — so the network response can't be read in devtools to draft
// optimally and skew a leaderboard.
// Every spin carries each candidate's usage demand for the live budget bar (USAGE DISCIPLINE
// grades on it; every other mode shows it so overload is felt before the reveal). Usage is an
// intrinsic player property computable from the public players.json + coefficients.json — unlike
// fit grades it is NOT seed-relative, so shipping it on competitive seeds reveals nothing a
// script couldn't already derive (the §12 bar is unchanged).
export function spin(seed: string, round: number, opts: SpinOptions = {}, wantFit = false): SpinResult {
  const { byId, coeff } = load();
  const { team, decade, pool } = selectSpin(seed, round, opts);
  const isBp = seed.startsWith("bp-");
  const showFit = wantFit && (seed.startsWith("classic") || isBp);
  const excludeIds = new Set(opts.exclude ?? []);
  const drafted = showFit && excludeIds.size ? [...excludeIds].map((id) => byId.get(id)).filter((p): p is Player => !!p) : [];
  const fits = showFit ? computeFits(drafted, pool, coeff) : null;
  // send unrounded usage so the live budget bar sums the SAME floats blueprintMetric grades on —
  // a per-player round here could straddle the A+/A boundary the bar tells the player they hit
  const candidates = pool.map((p) => toCandidate(p, fits?.get(p.id), playerFeatures(p, coeff).usage));
  return { team, decade, candidates };
}

// Pool-only spin for leaderboard verification: same (team, decade) selection, candidate ids only
// (skips the per-candidate fit calc, which verification doesn't need).
export function spinPool(seed: string, round: number, opts: SpinOptions = {}): { team: string; decade: string; ids: string[] } {
  const { team, decade, pool } = selectSpin(seed, round, opts);
  return { team, decade, ids: pool.map((p) => p.id) };
}

// --- Prime Draft: team-only spins over all-time peak-variant pools ---
// The per-person_id rule inverts here: instead of EXCLUDING a drafted player's other era
// variants, the pool is pre-collapsed to each person's single best variant (lib/prime.ts).

let _prime: PrimePools | null = null;
function loadPrime(): PrimePools {
  if (_prime) return _prime;
  const { players } = load();
  // mirror the draft-index filter: current franchises, canonical decades only
  _prime = buildPrimePools(players.filter((p) => CURRENT.has(p.team) && DECADES.has(p.decade)));
  return _prime;
}

function selectPrimeSpin(seed: string, round: number, opts: SpinOptions): { team: string; pool: Player[] } {
  const { byId } = load();
  const { teams, byTeam } = loadPrime();
  const excludeIds = new Set(opts.exclude ?? []);
  const excludePeople = new Set([...excludeIds].map((id) => byId.get(id)?.person_id ?? id));
  const rng = mulberry32(strSeed(seed) ^ (round * 2654435761) ^ ((opts.salt ?? 0) * 40503));
  const available = (p: Player) => !excludeIds.has(p.id) && !excludePeople.has(p.person_id ?? p.id);
  const undrafted = (t: string) => (byTeam.get(t) ?? []).some(available);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];

  // one-time team re-spin: excludeTeam mirrors selectSpin's fallback ladder
  let usable = teams.filter((t) => t !== opts.excludeTeam && undrafted(t));
  if (!usable.length) usable = teams.filter((t) => t !== opts.excludeTeam);
  if (!usable.length) usable = teams;
  const team = pick(usable);
  return { team, pool: (byTeam.get(team) ?? []).filter(available) }; // pool pre-sorted by peak_score
}

// Prime spin: ERA is locked to "PRIME"; candidates carry their own peak decade for display.
// Fit grades are the same Classic-only assist — granted for free-play prime-* seeds, but never
// for a future shared-seed prime-daily-* competition (mirrors the daily-fairness rule).
export function primeSpin(seed: string, round: number, opts: SpinOptions = {}, wantFit = false): SpinResult {
  const { byId, coeff } = load();
  const { team, pool } = selectPrimeSpin(seed, round, opts);
  const showFit = wantFit && seed.startsWith("prime-") && !seed.startsWith("prime-daily-");
  const excludeIds = new Set(opts.exclude ?? []);
  const drafted = showFit && excludeIds.size ? [...excludeIds].map((id) => byId.get(id)).filter((p): p is Player => !!p) : [];
  const fits = showFit ? computeFits(drafted, pool, coeff) : null;
  // usage rides every prime spin too — the live budget bar shows in Prime (it is stats-visible)
  return { team, decade: "PRIME", candidates: pool.map((p) => toCandidate(p, fits?.get(p.id), playerFeatures(p, coeff).usage)) };
}

export function primeStats() {
  const { teams, byTeam } = loadPrime();
  return { teams: teams.length, pools: teams.map((t) => ({ team: t, people: byTeam.get(t)!.length })) };
}

export function poolStats() {
  const { players, draftKeys, decadesByTeam } = load();
  return { players: players.length, franchiseDecades: draftKeys.length, franchises: decadesByTeam.size };
}
