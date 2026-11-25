import "server-only";
import type { Coefficients, LineupResult, Player, Slot } from "./types";
import { evaluateLineup } from "./engine";
import { compareResults } from "./challenge";
import { SLOTS } from "./teams";
import { duelDeal, getCoefficients, getPlayersByIds, marginalNet } from "./data";
import { resolveAsOf } from "./poolDate";
import { DUEL_TURNS, decodeDuelCard, outcomeFromWinner, turnRound, type DuelOutcome, type Persona } from "./duel";

// Draft Duel bot. Server-only by design (DESIGN.md §12): the client only ever sees the bot's finished
// pick, never a per-candidate score. Every choice is deterministic in (seed, persona, your picks), so
// the routes rebuild the whole duel from your pick list instead of trusting any client roster.

export type DuelRoster = Record<Slot, Player | null>;
export interface DuelPick { id: string; slot: Slot }
export interface DuelTurn { turn: number; round: number; side: "you" | "bot"; slot: Slot; player: Player; team: string; decade: string; fallback: boolean }

const emptyRoster = (): DuelRoster => ({ PG: null, SG: null, SF: null, PF: null, C: null });
const eligibleSlots = (p: Player): Slot[] => (p.eligible && p.eligible.length ? p.eligible : [p.pos as Slot]);
const n = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? 0 : v);
export const openSlots = (r: DuelRoster): Slot[] => SLOTS.filter((s) => !r[s]);

// Box-Score Bro: raw counting stats, points first. Defense and usage never enter.
function broScore(p: Player): number {
  return n(p.pts) + 0.4 * n(p.trb) + 0.6 * n(p.ast);
}

// Old Head: pre-1990 lean, size and rim protection, accolades (fame is accolade-built).
function oldHeadScore(p: Player): number {
  const big = eligibleSlots(p).includes("C") ? 4 : eligibleSlots(p).includes("PF") ? 2 : 0;
  return 0.5 * n(p.pts) + 0.6 * n(p.trb) + 0.4 * n(p.ast) + 3 * n(p.blk)
    + (p.year < 1990 ? 6 : 0) + big + 1.2 * Math.sqrt(Math.max(0, n(p.fame)));
}

// Where the bot seats a pick: its listed position when open, else the first open eligible slot.
export function chooseSlot(p: Player, open: Slot[]): Slot | null {
  const elig = eligibleSlots(p).filter((s) => open.includes(s));
  if (!elig.length) return null;
  return elig.includes(p.pos as Slot) ? (p.pos as Slot) : SLOTS.find((s) => elig.includes(s))!;
}

// The bot's pick from `pool` for its current roster. Only candidates that fit an open slot count.
// Ties break on id so the choice is stable across runs.
export function botChoose(persona: Persona, pool: Player[], roster: DuelRoster, c: Coefficients = getCoefficients()): { player: Player; slot: Slot } | null {
  const open = openSlots(roster);
  const cands = pool.filter((p) => chooseSlot(p, open));
  if (!cands.length) return null;
  let score: (p: Player) => number;
  if (persona === "analyst") {
    // greedy on this spin only: marginal net rating over a replacement-padded five (computeFits' logic)
    const drafted = SLOTS.map((s) => roster[s]).filter((p): p is Player => !!p);
    const d = marginalNet(drafted, cands, c);
    score = (p) => d.get(p.id) ?? -Infinity;
  } else {
    score = persona === "bro" ? broScore : oldHeadScore;
  }
  const best = [...cands].sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  return { player: best, slot: chooseSlot(best, open)! };
}

export type DuelReplay =
  | { ok: true; you: DuelRoster; bot: DuelRoster; turns: DuelTurn[]; next: number | null }
  | { ok: false; error: string };

// Rebuild a duel from the seed, the persona and your picks (in order). Walks the snake order: each
// bot turn is computed here; each of your turns must name a player from YOUR deal for that turn, at an
// open slot he is eligible for. Stops at your next turn (`next`) or at the end (`next: null`).
// `asOf` is the duel's pinned pool date (its start day), so a duel that crosses a release midnight
// replays against one pool end to end; resolveAsOf caps it at today.
export function replayDuel(seed: string, persona: Persona, picks: DuelPick[], asOf?: unknown): DuelReplay {
  const day = resolveAsOf(seed, asOf);
  const you = emptyRoster(), bot = emptyRoster();
  const turns: DuelTurn[] = [];
  const taken: string[] = [];
  let i = 0;
  for (let t = 0; t < DUEL_TURNS.length; t++) {
    const side = DUEL_TURNS[t];
    const round = turnRound(t);
    const roster = side === "you" ? you : bot;
    if (side === "you" && i >= picks.length) return { ok: true, you, bot, turns, next: t };
    const deal = duelDeal(seed, round, taken, openSlots(roster), day);
    let player: Player, slot: Slot;
    if (side === "bot") {
      const choice = botChoose(persona, deal.pool, roster);
      if (!choice) return { ok: false, error: "bot has no legal pick" };
      ({ player, slot } = choice);
    } else {
      const pick = picks[i++];
      const p = deal.pool.find((x) => x.id === pick.id);
      if (!p) return { ok: false, error: `round ${round + 1}: that player isn't in your spin` };
      if (!SLOTS.includes(pick.slot) || roster[pick.slot]) return { ok: false, error: `round ${round + 1}: that slot isn't open` };
      if (!eligibleSlots(p).includes(pick.slot)) return { ok: false, error: `round ${round + 1}: ${p.name} can't play ${pick.slot}` };
      player = p; slot = pick.slot;
    }
    roster[slot] = player;
    taken.push(player.id);
    turns.push({ turn: t, round, side, slot, player, team: deal.team, decade: deal.decade, fallback: deal.fallback });
  }
  if (i < picks.length) return { ok: false, error: "too many picks" };
  return { ok: true, you, bot, turns, next: null };
}

// Strict parse of an untrusted pick list (≤5 entries of { id, slot }); null if malformed.
export function parsePicks(x: unknown): DuelPick[] | null {
  if (!Array.isArray(x) || x.length > 5) return null;
  const out: DuelPick[] = [];
  for (const e of x) {
    if (!e || typeof e !== "object") return null;
    const { id, slot } = e as Record<string, unknown>;
    if (typeof id !== "string" || !/^[a-z0-9_]{1,64}$/.test(id)) return null;
    if (typeof slot !== "string" || !SLOTS.includes(slot as Slot)) return null;
    out.push({ id, slot: slot as Slot });
  }
  return out;
}

// /duel/<card>: decode both fives + the persona and re-run the engine, like /r/ (nothing stored). The
// ten players must be ten different people — a real duel never shares one. null for a crafted card.
export function resolveDuelCard(card: string): { persona: Persona; outcome: DuelOutcome; you: { players: Player[]; result: LineupResult }; bot: { players: Player[]; result: LineupResult } } | null {
  const dec = decodeDuelCard(card);
  if (!dec) return null;
  const you = getPlayersByIds(dec.youIds), bot = getPlayersByIds(dec.botIds);
  if (you.length !== 5 || bot.length !== 5) return null;
  if (new Set([...you, ...bot].map((p) => p.person_id ?? p.id)).size !== 10) return null;
  const c = getCoefficients();
  const yr = evaluateLineup(you, c), br = evaluateLineup(bot, c);
  return { persona: dec.persona, outcome: outcomeFromWinner(compareResults(yr, br).winner), you: { players: you, result: yr }, bot: { players: bot, result: br } };
}
