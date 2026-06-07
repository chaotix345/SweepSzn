import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Player, Coefficients, DraftCandidate, Slot } from "./types";
import { DEFAULT_COEFFICIENTS } from "./engine";

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

// deterministic PRNG (mulberry32) so Daily mode is reproducible from a seed
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function strSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function toCandidate(p: Player): DraftCandidate {
  return {
    id: p.id, person_id: p.person_id, name: p.name, year: p.year, decade: p.decade, team: p.team,
    pos: p.pos, eligible: (p.eligible && p.eligible.length ? p.eligible : [p.pos as Slot]),
    pts: p.pts, trb: p.trb, ast: p.ast, stl: p.stl, blk: p.blk, defense_estimated: p.defense_estimated,
  };
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
export function spin(seed: string, round: number, opts: SpinOptions = {}): SpinResult {
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

  const candidates = (draftIndex.get(`${team}|${decade}`) ?? [])
    .filter(available)
    .sort((a, b) => (b.peak_score ?? 0) - (a.peak_score ?? 0))
    .map(toCandidate);
  return { team, decade, candidates };
}

export function poolStats() {
  const { players, draftKeys, decadesByTeam } = load();
  return { players: players.length, franchiseDecades: draftKeys.length, franchises: decadesByTeam.size };
}
