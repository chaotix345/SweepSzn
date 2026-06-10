// Factor Hunt: draft five, then — before the reveal — predict which engine factor matters most.
// The engine's explainability IS the game: choices are the top real factors plus one decoy, the
// answer is the highest-magnitude negative factor (or, for a clean build with no negatives, the
// BEST factor — flipped server-side so the client can't infer roster quality from the question).
// Pure + isomorphic (no server-only): the choices route, the submit verifier, and the client
// verdict chip all share these helpers, so they can never disagree.

import type { LineupResult } from "./types";

export const FH_BONUS = 1.05; // cosmetic display multiplier on the FH board — never touches the engine

// Canonical labels for every factor the engine can emit (engine.ts factors.push sites).
// Decoys are sampled from here, minus whatever the lineup actually surfaced.
export const FH_FACTOR_LABELS = [
  "Star offense",
  "Star defense",
  "Usage overload",
  "Spacing",
  "Thin interior size",
  "No interior size",
  "No perimeter defender",
] as const;

// "Usage overload (156% demand)" -> "Usage overload" (same strip rule as explain.ts, case kept)
export function canonicalFactor(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, "");
}

// FH daily seeds: fh-YYYY-M-D (shared per UTC day, like daily-*).
const FH_SEED_RE = /^fh-\d{4}-\d{1,2}-\d{1,2}$/;
export function fhSeedOk(seed: unknown): seed is string {
  return typeof seed === "string" && FH_SEED_RE.test(seed);
}

// Deterministic PRNG (mulberry32 + FNV hash — mirrors lib/data.ts) so the choices route and the
// submit verifier shuffle identically from the shared seed.
function strSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface FhChoices {
  ask: "worst" | "best";   // "best" = the no-negative-factors flip (dominant roster)
  choices: string[];        // 4 canonical labels, deterministically shuffled
  answer: string;           // canonical label of the correct pick (NEVER sent pre-reveal)
}

export function buildFhChoices(factors: LineupResult["factors"], seed: string): FhChoices | null {
  if (!factors.length) return null;
  const negatives = factors.filter((f) => f.value < 0).sort((a, b) => a.value - b.value);
  const ask: FhChoices["ask"] = negatives.length ? "worst" : "best";
  const ranked = negatives.length ? negatives : [...factors].sort((a, b) => b.value - a.value);
  const real: string[] = [];
  for (const f of ranked) {
    const c = canonicalFactor(f.label);
    if (!real.includes(c)) real.push(c);
    if (real.length === 3) break;
  }
  const answer = canonicalFactor(ranked[0].label);
  // decoys must be absent from the lineup's real factor set, so a sharp player can't eliminate
  // them by reading the roster; fall back to non-chosen labels if somehow everything surfaced
  const present = new Set(factors.map((f) => canonicalFactor(f.label)));
  let pool = FH_FACTOR_LABELS.filter((l) => !present.has(l));
  if (!pool.length) pool = FH_FACTOR_LABELS.filter((l) => !real.includes(l));
  const rng = mulberry32(strSeed(seed) ^ 0x9e3779b9);
  const decoys = shuffle(pool, rng).slice(0, Math.max(1, 4 - real.length));
  const choices = shuffle([...real, ...decoys], rng);
  return { ask, choices, answer };
}

// --- FH board scoring: wins × bonus is the rank, net is the tiebreak (encScore-style) ---
// score = round(wins · mult · 100) · 1000 + clamp(net+100, 0, 999). The ×100 keeps the
// fractional display score (73.5) inside the integer sort key; decode recovers it exactly.

export const encFhScore = (wins: number, net: number, correct: boolean) =>
  Math.round(wins * (correct ? FH_BONUS : 1) * 100) * 1000 + Math.max(0, Math.min(999, net + 100));
export const decodeFhDisplay = (score: number) => Math.floor(score / 1000) / 100;

// --- board row/view shapes (defined here, not in the server-only store, for client import) ---
export interface FhRow {
  uid: string; name: string;
  wins: number; losses: number; net: number; lineup: string;
  predicted: string | null;  // the locked choice (null = skipped / invalid)
  correct: boolean;
  score: number;             // display score: wins × bonus, e.g. 73.5
}
export interface FhBoardRow extends FhRow { rank: number }
export interface FhBoardView { date: string; total: number; top: FhBoardRow[]; you?: FhBoardRow }
