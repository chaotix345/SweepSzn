// Surgeon: the engine diagnoses your five's single worst factor — you get one swap to fix it,
// and the score is the WIN DELTA, not the raw record. Pure + isomorphic (no server-only): the
// pool route, the submit verifier, the /sg/ permalink, and the client phase-2 UI all share these
// helpers, so the dealt pool and the submit-time recomputed pool can never disagree.

import type { LineupResult, Player, Slot } from "./types";
import { playerFeatures } from "./engine";
import { canonicalFactor } from "./factorHunt";

// Surgeon daily seeds: surgeon-YYYY-M-D (shared per UTC day, like fh-*/bp-*).
const SURGEON_SEED_RE = /^surgeon-\d{4}-\d{1,2}-\d{1,2}$/;
export function surgeonSeedOk(seed: unknown): seed is string {
  return typeof seed === "string" && SURGEON_SEED_RE.test(seed);
}

// The diagnosis: highest-magnitude NEGATIVE factor; a clean build falls back to the SMALLEST
// positive factor (spec mitigation — "your weakest strength") so the mode never degenerates.
export interface SurgeonDiagnosis {
  kind: "worst" | "weakest";  // weakest = the no-negative-factors fallback
  label: string;              // full engine label, e.g. "Usage overload (118% demand)"
  canonical: string;          // canonicalFactor(label)
  value: number;
}
export function surgeonDiagnosis(factors: LineupResult["factors"]): SurgeonDiagnosis | null {
  if (!factors.length) return null;
  const negatives = factors.filter((f) => f.value < 0).sort((a, b) => a.value - b.value);
  const f = negatives[0] ?? [...factors].sort((a, b) => Math.abs(a.value) - Math.abs(b.value))[0];
  return { kind: negatives.length ? "worst" : "weakest", label: f.label, canonical: canonicalFactor(f.label), value: f.value };
}

// Diagnosis -> the roster need a replacement should target (drives candidate ranking + the
// "why offered" copy — the spec's anti-"rigged feeling" mitigation).
export type SurgeonNeed = "shoot" | "rim" | "perim" | "lowusage" | "off" | "def";
export function needOf(canonical: string): SurgeonNeed {
  switch (canonical) {
    case "Usage overload": return "lowusage";
    case "Spacing": return "shoot";
    case "Thin interior size":
    case "No interior size": return "rim";
    case "No perimeter defender": return "perim";
    case "Star offense": return "off";
    default: return "def"; // "Star defense"
  }
}

const NEED_TITLE: Record<SurgeonNeed, string> = {
  shoot: "floor spacer", rim: "rim anchor", perim: "perimeter stopper",
  lowusage: "low-usage glue", off: "shot creator", def: "defensive upgrade",
};

const f1 = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(1));

export interface SurgeonCandidate {
  id: string;
  name: string;
  team: string;
  decade: string;
  pos: string;
  eligible: Slot[];
  why: string;   // "rim anchor — 12.4 RPG · 2.9 BPG"
  stat: string;  // the relevant stat alone, for compact rows
}

// Deal exactly POOL_SIZE replacement candidates targeted at the flagged weakness, from the
// players the seed actually offered (the union of the five verified spin pools, minus anyone
// who shares a person with the drafted five). Ranking is deterministic — need-stat first,
// peak_score then id as tiebreaks — so the submit-time recompute reproduces the dealt pool
// exactly, with no RNG and no stored state.
export const SURGEON_POOL_SIZE = 3;

export function buildSurgeonPool(lineup: Player[], offered: Player[], need: SurgeonNeed): SurgeonCandidate[] {
  const used = new Set(lineup.map((p) => p.person_id ?? p.id));
  const slots = new Set<Slot>();
  for (const p of lineup) for (const s of p.eligible && p.eligible.length ? p.eligible : [p.pos as Slot]) slots.add(s);

  const seen = new Set<string>();
  const pool = offered.filter((p) => {
    const person = p.person_id ?? p.id;
    if (used.has(person) || seen.has(person)) return false;
    seen.add(person);
    // must be able to take SOME drafted player's slot, or no legal swap exists for it
    const elig = p.eligible && p.eligible.length ? p.eligible : [p.pos as Slot];
    return elig.some((s) => slots.has(s));
  });

  const feat = new Map(pool.map((p) => [p.id, playerFeatures(p)]));
  const fx = (p: Player) => feat.get(p.id)!;
  // primary need score (higher = dealt first); NaN-safe via playerFeatures' clamped math
  const score: Record<SurgeonNeed, (p: Player) => number> = {
    shoot: (p) => fx(p).shoot,
    rim: (p) => (fx(p).rim ? 1000 : 0) + fx(p).def,
    perim: (p) => (fx(p).perim ? 1000 : 0) + (p.stl ?? 0),
    // low usage that still plays: rank the 8 lightest-usage offers by two-way impact
    lowusage: (p) => -fx(p).usage,
    off: (p) => fx(p).off,
    def: (p) => fx(p).def,
  };
  let ranked = [...pool].sort((a, b) =>
    score[need](b) - score[need](a) || (b.peak_score ?? 0) - (a.peak_score ?? 0) || (a.id < b.id ? -1 : 1));
  if (need === "lowusage") {
    // pure lowest-usage deals unplayable scrubs — take the 8 lightest offers, deal the 3 with
    // the most two-way impact among them (still deterministic, still visibly low-usage)
    const lightest = [...pool].sort((a, b) => fx(a).usage - fx(b).usage || (a.id < b.id ? -1 : 1)).slice(0, 8);
    ranked = lightest.sort((a, b) => (fx(b).off + fx(b).def) - (fx(a).off + fx(a).def) || (a.id < b.id ? -1 : 1));
  }

  const why = (p: Player): { why: string; stat: string } => {
    const f = fx(p);
    switch (need) {
      case "shoot": return { why: `${NEED_TITLE[need]} — ${f1(p.fg3)} 3PM on ${f1(p.fg3a)} attempts`, stat: `${f1(p.fg3)} 3PM` };
      case "rim": return { why: `${NEED_TITLE[need]} — ${f1(p.trb)} RPG · ${f1(p.blk)} BPG`, stat: `${f1(p.blk)} BPG` };
      case "perim": return { why: `${NEED_TITLE[need]} — ${f1(p.stl)} SPG`, stat: `${f1(p.stl)} SPG` };
      case "lowusage": return { why: `${NEED_TITLE[need]} — ${Math.round(f.usage)}% usage demand`, stat: `${Math.round(f.usage)}% USG` };
      case "off": return { why: `${NEED_TITLE[need]} — ${f1(p.pts)} PPG`, stat: `${f1(p.pts)} PPG` };
      case "def": return { why: `${NEED_TITLE[need]} — ${f1(p.stl)} SPG · ${f1(p.blk)} BPG`, stat: `${f1(p.blk)} BPG` };
    }
  };

  return ranked.slice(0, SURGEON_POOL_SIZE).map((p) => ({
    id: p.id, name: p.name, team: p.team, decade: p.decade, pos: p.pos,
    eligible: p.eligible && p.eligible.length ? p.eligible : [p.pos as Slot],
    ...why(p),
  }));
}

// --- surgeon board scoring: the DELTA is the rank, after-net is the tiebreak ---
// delta ∈ [-82, 82]; offset keeps the sort key positive. Same encScore idiom as FH/BP.
export const encSurgeonScore = (delta: number, afterNet: number) =>
  (delta + 100) * 1000 + Math.max(0, Math.min(999, afterNet + 100));
export const decodeSurgeonDelta = (score: number) => Math.floor(score / 1000) - 100;

// --- /sg/<card> share segment: "<beforeIdsCsv>.<outIdx>.<inId>" ---
// Both results are deterministic from the ids, so the permalink + OG rebuild the full
// BEFORE/AFTER story with nothing stored server-side (mirrors /r/ and /pe/).
const SG_IDS_RE = /^[a-z0-9_]+(,[a-z0-9_]+){4}$/;
const SG_ID_RE = /^[a-z0-9_]+$/;

export function encodeSurgeonCard(beforeIds: string[], outIdx: number, inId: string): string {
  return [beforeIds.join(","), outIdx, inId].join(".");
}
export function decodeSurgeonCard(seg: string): { beforeIds: string[]; outIdx: number; inId: string; afterIds: string[] } | null {
  const parts = decodeURIComponent(seg).split(".");
  if (parts.length !== 3) return null;
  if (!SG_IDS_RE.test(parts[0]) || !SG_ID_RE.test(parts[2])) return null;
  const outIdx = Number(parts[1]);
  if (!Number.isInteger(outIdx) || outIdx < 0 || outIdx > 4) return null;
  const beforeIds = parts[0].split(",");
  if (new Set(beforeIds).size !== 5 || beforeIds.includes(parts[2])) return null;
  const afterIds = beforeIds.map((id, i) => (i === outIdx ? parts[2] : id));
  return { beforeIds, outIdx, inId: parts[2], afterIds };
}

// --- board row/view shapes (client-importable; the store stays server-only) ---
export interface SurgeonRow {
  uid: string; name: string;
  delta: number;
  beforeWins: number; afterWins: number; net: number;
  card: string;        // /sg/ segment for the row's permalink
}
export interface SurgeonBoardRow extends SurgeonRow { rank: number }
export interface SurgeonBoardView { date: string; total: number; top: SurgeonBoardRow[]; you?: SurgeonBoardRow }
