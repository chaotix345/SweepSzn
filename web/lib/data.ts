import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Player, Coefficients, DraftCandidate, CandidateFit, Slot, EraContext } from "./types";
import { DEFAULT_COEFFICIENTS, quickScore, playerFeatures } from "./engine";
import { decadeEraContext } from "./leagueContext";
import { buildPrimePools, compareSzn, type PrimePools } from "./prime";
import { playerTraits } from "./traits";
import { mulberry32, strSeed } from "./rng";
import { isoDay, releaseDate, resolveAsOf } from "./poolDate";

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

// One draftable pool per pool date (lib/poolDate.ts): the current-franchise, canonical-decade cards
// present on that day, grouped for spins. Cards with no `since` are always present; a superseded card
// (`until`) leaves the pool but stays in byId, so every id-based surface keeps resolving it.
interface PoolIndex {
  cards: Player[];
  draftIndex: Map<string, Player[]>; // "TEAM|DECADE" -> players
  draftKeys: string[];
  teamsByDecade: Map<string, string[]>;
  decadesByTeam: Map<string, string[]>;
  prime?: PrimePools;
  top: Map<string, Player[]>; // getDraftablePool memo
}

interface Window { since: string | null; until: string | null; unreleased: boolean }

let _cache: {
  players: Player[];
  byId: Map<string, Player>;
  personNames: Map<string, string>;
  coeff: Coefficients;
  windows: Map<string, Window>;
  bounds: string[]; // sorted distinct since/until dates: the pool only changes at these
  pools: Map<number, PoolIndex>;
} | null = null;

// Reference pages (/teams, receipts) show the newest pool: every released card, no superseded ones.
const LATEST_AS_OF = "9999-12-31";

function load() {
  if (_cache) return _cache;
  const players = readJson<Player[]>("players.json", []);
  const coeffRaw = readJson<Partial<Coefficients>>("coefficients.json", {});
  const coeff: Coefficients = { ...DEFAULT_COEFFICIENTS, ...coeffRaw };

  const byId = new Map<string, Player>();
  const personNames = new Map<string, string>();
  const windows = new Map<string, Window>();
  const bounds = new Set<string>();
  for (const p of players) {
    p.person_id ??= p.name.toLowerCase().replace(/['.]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    byId.set(p.id, p);
    personNames.set(p.person_id, p.name);
    if (p.since || p.until) {
      const since = p.since ? releaseDate(p.since) : null;
      const until = p.until ? releaseDate(p.until) : null;
      // a release key with no date in POOL_RELEASES never goes live: its `since` cards stay out of every
      // pool, and its `until` cards are never retired
      windows.set(p.id, { since, until, unreleased: !!p.since && !since });
      if (since) bounds.add(since);
      if (until) bounds.add(until);
    }
  }
  _cache = { players, byId, personNames, coeff, windows, bounds: [...bounds].sort(), pools: new Map() };
  return _cache;
}

function presentOn(w: Window | undefined, asOf: string): boolean {
  if (!w) return true;
  if (w.unreleased) return false;
  return (!w.since || w.since <= asOf) && (!w.until || w.until > asOf);
}

// The draftable pool on `asOf` (YYYY-MM-DD). Built once per pool epoch (the span between two release
// dates), so the cache holds a handful of indexes however many distinct dates are asked for.
function poolIndex(asOf: string): PoolIndex {
  const c = load();
  const epoch = c.bounds.filter((b) => b <= asOf).length;
  const hit = c.pools.get(epoch);
  if (hit) return hit;
  const cards: Player[] = [];
  const draftIndex = new Map<string, Player[]>();
  const teamSeen = new Map<string, Set<string>>();
  const decSeen = new Map<string, Set<string>>();
  for (const p of c.players) {
    // 82-0 parity: only current franchises, only the 1960s–2020s decades are draftable
    if (!CURRENT.has(p.team) || !DECADES.has(p.decade) || !presentOn(c.windows.get(p.id), asOf)) continue;
    cards.push(p);
    const key = `${p.team}|${p.decade}`;
    if (!draftIndex.has(key)) draftIndex.set(key, []);
    draftIndex.get(key)!.push(p);
    if (!teamSeen.has(p.decade)) teamSeen.set(p.decade, new Set());
    teamSeen.get(p.decade)!.add(p.team);
    if (!decSeen.has(p.team)) decSeen.set(p.team, new Set());
    decSeen.get(p.team)!.add(p.decade);
  }
  const idx: PoolIndex = {
    cards, draftIndex, draftKeys: [...draftIndex.keys()],
    teamsByDecade: new Map([...teamSeen].map(([d, set]) => [d, [...set]])),
    decadesByTeam: new Map([...decSeen].map(([t, set]) => [t, [...set]])),
    top: new Map(),
  };
  c.pools.set(epoch, idx);
  return idx;
}

export function getCoefficients(): Coefficients {
  return load().coeff;
}

// Every card ever released, superseded ones included (id lookups, Dex, stored results).
export function getAllPlayers(): Player[] {
  return load().players;
}

// The newest card for every bucket: superseded cards dropped, every release included.
export function getLatestPlayers(): Player[] {
  const { players, windows } = load();
  return players.filter((p) => presentOn(windows.get(p.id), LATEST_AS_OF));
}

export function getPlayersByIds(ids: string[]): Player[] {
  const { byId } = load();
  return ids.map((id) => byId.get(id)).filter((p): p is Player => !!p);
}

// All franchise/era variants of one real person — powers the dossier's career-arc strip.
// A person's cards present on `asOf` (released, not superseded) — the dossier's career journey.
export function getPersonVariants(personId: string, asOf: string = isoDay()): Player[] {
  const { players, windows } = load();
  return players.filter((p) => (p.person_id ?? p.id) === personId && presentOn(windows.get(p.id), asOf));
}

// O(1) display-name lookup for a person_id (built once at load) — used by the crowd reveal.
export function getPersonName(personId: string): string | undefined {
  return load().personNames.get(personId);
}

// Draftable players for a (team, decade) eligible at `slot`, fame-sorted (compareSzn) — the post-game
// What-If Lab's swap options. Same descriptive candidate shape as a spin; it carries NO fit/engine
// signal and is never ordered by outcome (the Lab re-scores only after the user picks). DESIGN.md §12.
export function getSwapOptions(team: string, decade: string, slot: Slot): DraftCandidate[] {
  const { coeff } = load();
  const { draftIndex } = poolIndex(isoDay());
  const pool = (draftIndex.get(`${team}|${decade}`) ?? [])
    .filter((p) => ((p.eligible && p.eligible.length) ? p.eligible : [p.pos as Slot]).includes(slot))
    .sort(compareSzn);
  return pool.map((p, i) => toCandidate(p, undefined, playerFeatures(p, coeff).usage, i));
}

// Every draftable card for one franchise across all its draftable decades (the union of its
// TEAM|DECADE draft-index pools) — the /teams franchise pages' universe. Unsorted; callers order it.
export function getFranchisePool(team: string): Player[] {
  const { draftIndex, decadesByTeam } = poolIndex(LATEST_AS_OF);
  return (decadesByTeam.get(team) ?? []).flatMap((d) => draftIndex.get(`${team}|${d}`) ?? []);
}

// Top-K draftable players by peak_score — the candidate universe the projection ticker's "ceiling"
// (best-possible completion) is chosen from. Public global pool only (never a seed's future spins),
// so it leaks nothing. Prime draws from the all-time peak-variant pools; everything else from the
// regular current-franchise / canonical-decade universe. Pure over immutable per-process data, so
// memoized — it was a ~5.3k filter+sort on every /api/project call. Callers must not mutate it.
export function getDraftablePool(prime: boolean, topK = 250, asOf: string = isoDay()): Player[] {
  const idx = poolIndex(asOf);
  const key = `${prime}|${topK}`;
  const hit = idx.top.get(key);
  if (hit) return hit;
  const pool = prime ? [...primeOf(idx).byTeam.values()].flat() : idx.cards;
  const out = [...pool].sort((a, b) => (b.peak_score ?? 0) - (a.peak_score ?? 0)).slice(0, topK);
  idx.top.set(key, out);
  return out;
}

export function toCandidate(p: Player, fit?: CandidateFit, usage?: number, rank?: number): DraftCandidate {
  return {
    id: p.id, person_id: p.person_id, name: p.name, year: p.year, decade: p.decade, team: p.team,
    pos: p.pos, eligible: (p.eligible && p.eligible.length ? p.eligible : [p.pos as Slot]),
    pts: p.pts, trb: p.trb, ast: p.ast, stl: p.stl, blk: p.blk, defense_estimated: p.defense_estimated, fit, usage,
    traits: playerTraits(p), rank,
    z: p.z ? { pts: p.z.pts, trb: p.z.trb, ast: p.z.ast, stl: p.z.stl, blk: p.z.blk, ts: p.z.ts } : undefined,
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

// Each candidate's net-rating swing over a replacement filler, given the roster drafted so far: the
// roster is padded to a full five with replacement fillers, and the candidate swaps one filler out.
// Shared by computeFits (Classic hints) and the Duel Analyst bot (lib/duelBot.ts) so both read the
// same replacement-padded marginal value.
export function marginalNet(allDrafted: Player[], cands: Player[], c: Coefficients): Map<string, number> {
  const drafted = allDrafted.slice(0, 4);
  const slots = 5 - drafted.length;                          // open starting slots
  const baseNet = quickScore([...drafted, ...FILLERS.slice(0, slots)], c).netRtg;
  return new Map(cands.map((p) => [p.id, quickScore([...drafted, p, ...FILLERS.slice(0, slots - 1)], c).netRtg - baseNet]));
}

// "Reveal before confirm": for each candidate, their value OVER a replacement player given the
// roster drafted so far (VORP-style net-rating swing), plus the specific need they fill. Roster-aware
// — a rim protector scores higher precisely when the lineup lacks one. Tiers are relative to the spin.
function computeFits(allDrafted: Player[], cands: Player[], c: Coefficients): Map<string, CandidateFit> {
  // a real roster has at most 4 picks before the last spin — never score a lineup past five players
  const drafted = allDrafted.slice(0, 4);
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const feats = drafted.map((p) => playerFeatures(p, c));
  const need = {
    // v4: mirror what the engine charges — no size at all, no perimeter player at all
    rim: !feats.some((f) => f.sizeCover >= 1),
    spacing: feats.reduce((a, f) => a + f.shoot, 0) < 2,
    perim: !feats.some((f) => f.perimCover >= 1),
    playmaking: !drafted.some((p) => (p.ast ?? 0) >= 6),
  };
  const deltas = marginalNet(drafted, cands, c);

  const raw = cands.map((p) => {
    const f = playerFeatures(p, c);
    const delta = deltas.get(p.id)!;
    const gap: string[] = [];
    if (need.rim && f.sizeCover >= 1) gap.push("Size");
    if (need.spacing && f.shoot >= 0.4) gap.push("Spacing");
    if (need.perim && f.perimCover >= 1) gap.push("Perimeter");
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
  asOf?: string;             // pinned pool date for an undated seed (lib/poolDate.ts resolveAsOf)
}

export interface SpinResult {
  team: string;
  decade: string;
  candidates: DraftCandidate[];
  era?: EraContext; // descriptive league-era snapshot for the spun decade (null/omitted for Prime)
}

// Spin a (team, decade) like 82-0: uniform over populated combos, full roster returned.
// `seed` makes it deterministic (Daily). Locks/excludes implement the two one-time skips.
// Shared (team, decade, available pool) selection — the deterministic core of a spin.
// Both spin() (adds draft-fit) and spinPool() (ids only, for leaderboard verification) use it.
function selectSpin(seed: string, round: number, opts: SpinOptions): { team: string; decade: string; pool: Player[] } {
  const { byId } = load();
  const { draftIndex, draftKeys, teamsByDecade, decadesByTeam } = poolIndex(resolveAsOf(seed, opts.asOf));
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
    .sort(compareSzn);
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
  const candidates = pool.map((p, i) => toCandidate(p, fits?.get(p.id), playerFeatures(p, coeff).usage, i));
  return { team, decade, candidates, era: decadeEraContext(decade) ?? undefined };
}

// --- Draft Duel: one shared Classic-style spin per round, both sides draft from it ---
// The round's (team, decade) is drawn from (seed, round) alone, so the bot and the player see the same
// spin whoever picks first; each side's pool drops everything already taken (by id and by person).
// Guard: if a side has nobody eligible for any of its open slots, that side's pick is re-dealt from a
// salted fallback spin — deterministic in (seed, round, taken, open), so the server replay matches.
// Duel spins never carry fit grades (DESIGN.md §12).
const eligibleSlots = (p: Player): Slot[] => (p.eligible && p.eligible.length ? p.eligible : [p.pos as Slot]);

export function duelDeal(seed: string, round: number, taken: string[], open: Slot[], asOf?: string): { team: string; decade: string; pool: Player[]; fallback: boolean } {
  const { byId } = load();
  const day = resolveAsOf(seed, asOf);
  const { draftIndex, draftKeys } = poolIndex(day);
  const takenIds = new Set(taken);
  const takenPeople = new Set(taken.map((id) => byId.get(id)?.person_id ?? id));
  const available = (p: Player) => !takenIds.has(p.id) && !takenPeople.has(p.person_id ?? p.id);
  const fits = (p: Player) => eligibleSlots(p).some((s) => open.includes(s));
  const poolOf = (key: string) => (draftIndex.get(key) ?? []).filter(available).sort(compareSzn);

  const base = selectSpin(seed, round, { asOf: day });
  const basePool = poolOf(`${base.team}|${base.decade}`);
  if (basePool.some(fits)) return { team: base.team, decade: base.decade, pool: basePool, fallback: false };
  for (let k = 1; k <= 64; k++) {
    const s = selectSpin(seed, round, { exclude: taken, salt: 1000 + k, asOf: day });
    if (s.pool.some(fits)) return { team: s.team, decade: s.decade, pool: s.pool, fallback: true };
  }
  for (const key of [...draftKeys].sort()) {
    const pool = poolOf(key);
    if (pool.some(fits)) { const [team, decade] = key.split("|"); return { team, decade, pool, fallback: true }; }
  }
  return { team: base.team, decade: base.decade, pool: basePool, fallback: false };
}

export function duelSpin(seed: string, round: number, taken: string[], open: Slot[], asOf?: string): SpinResult & { fallback: boolean } {
  const { coeff } = load();
  const { team, decade, pool, fallback } = duelDeal(seed, round, taken, open, asOf);
  const candidates = pool.map((p, i) => toCandidate(p, undefined, playerFeatures(p, coeff).usage, i));
  return { team, decade, candidates, era: decadeEraContext(decade) ?? undefined, fallback };
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

// Prime pools for one pool date: the same current-franchise / canonical-decade cards as the draft index.
function primeOf(idx: PoolIndex): PrimePools {
  idx.prime ??= buildPrimePools(idx.cards);
  return idx.prime;
}

function selectPrimeSpin(seed: string, round: number, opts: SpinOptions): { team: string; pool: Player[] } {
  const { byId } = load();
  const { teams, byTeam } = primeOf(poolIndex(resolveAsOf(seed, opts.asOf)));
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
  return { team, pool: (byTeam.get(team) ?? []).filter(available) }; // pool pre-sorted by compareSzn
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
  return { team, decade: "PRIME", candidates: pool.map((p, i) => toCandidate(p, fits?.get(p.id), playerFeatures(p, coeff).usage, i)) };
}
