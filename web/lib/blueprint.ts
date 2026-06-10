// Blueprint: commit to a tactical objective BEFORE the spin, then draft to prove it. The engine
// grades execution on that axis alone; the board score is wins × an execution multiplier.
// Pure + isomorphic (no server-only): the submit route, the /r/ permalink page, and the client
// result card all grade from the SAME LineupResult object via these helpers, so a board grade and
// an on-card grade can never disagree — and the engine itself is untouched (every metric below is
// already in the result: factor values, the per-player usage/def breakdown, and net rating).

import type { LineupResult } from "./types";
import { DEFAULT_COEFFICIENTS } from "./engine";

export type BlueprintKey = "spacing" | "fortress" | "discipline" | "rim" | "balanced";

// Blueprint daily seeds: bp-YYYY-M-D (shared per UTC day, like fh-*).
const BP_SEED_RE = /^bp-\d{4}-\d{1,2}-\d{1,2}$/;
export function bpSeedOk(seed: unknown): seed is string {
  return typeof seed === "string" && BP_SEED_RE.test(seed);
}

// One-letter share codes ride the /r/ path segment as a "b<code>~" prefix (see lib/share.ts).
const BP_CODE: Record<BlueprintKey, string> = { spacing: "s", fortress: "f", discipline: "u", rim: "r", balanced: "b" };
const CODE_BP: Record<string, BlueprintKey> = { s: "spacing", f: "fortress", u: "discipline", r: "rim", b: "balanced" };
export const bpCode = (k: BlueprintKey): string => BP_CODE[k];
export const bpFromCode = (c: string | null | undefined): BlueprintKey | null => (c ? CODE_BP[c] ?? null : null);
export function bpKeyOk(k: unknown): k is BlueprintKey {
  return k === "spacing" || k === "fortress" || k === "discipline" || k === "rim" || k === "balanced";
}

export interface BlueprintDef {
  key: BlueprintKey;
  label: string;        // the committed-objective name, uppercase by design (badge/share copy)
  emoji: string;
  desc: string;         // mode-modal pitch
  metricLabel: string;
  lowerIsBetter: boolean;
  // metric thresholds for A+, A, B, C, D (F below/above). Calibrated against 400 simulated seeded
  // drafts per strategy (scripts probe, 2026-06-10): each A+ sits near the 90th percentile of a
  // draft that deliberately chases the blueprint, so no objective is free and none is unreachable.
  bands: [number, number, number, number, number];
  format: (v: number) => string;
}

const f1 = (v: number) => v.toFixed(1);
export const BLUEPRINTS: BlueprintDef[] = [
  {
    key: "spacing", label: "SPACING BOMB", emoji: "💣",
    desc: "Surround the floor with shooters — the spacing factor is your grade.",
    metricLabel: "Spacing factor", lowerIsBetter: false, bands: [2.5, 2.0, 1.5, 0.8, 0.1], format: f1,
  },
  {
    key: "fortress", label: "DEFENSIVE FORTRESS", emoji: "🏰",
    desc: "Stack defensive impact — the Star defense factor is your grade.",
    metricLabel: "Star defense", lowerIsBetter: false, bands: [10.5, 9.5, 8.0, 6.5, 5.0], format: f1,
  },
  {
    key: "discipline", label: "USAGE DISCIPLINE", emoji: "⚖️",
    desc: "No ball-dominant pileups — keep total usage demand under 95.",
    metricLabel: "Total usage demand", lowerIsBetter: true, bands: [90, 95, 100, 108, 118],
    format: (v) => `${Math.round(v)}%`,
  },
  {
    key: "rim", label: "RIM DOMINANCE", emoji: "🛡️",
    desc: "Anchor the paint — the defensive impact carried by your rim protectors is your grade.",
    metricLabel: "Interior anchor impact", lowerIsBetter: false, bands: [6.0, 5.0, 4.0, 2.8, 1.5], format: f1,
  },
  {
    key: "balanced", label: "BALANCED", emoji: "🎯",
    desc: "The pure game — highest net rating, no constraint.",
    metricLabel: "Net rating", lowerIsBetter: false, bands: [14, 11.5, 9, 6, 2.5], format: f1,
  },
];
export const blueprintDef = (k: BlueprintKey): BlueprintDef => BLUEPRINTS.find((b) => b.key === k)!;

// Execution multiplier per grade tier — the spec's 1.0–1.3 range, quantized so a board row's math
// is legible at a glance (wins × mult = score). Cosmetic for the bp boards only; never the engine.
const BP_GRADES = ["A+", "A", "B", "C", "D"] as const;
export const BP_MULT: Record<string, number> = { "A+": 1.3, A: 1.22, B: 1.15, C: 1.08, D: 1.03, F: 1.0 };

// The committed metric, read straight off the engine result (no recomputation):
// - spacing:    the "Spacing" factor value (0 when the engine suppressed a |spacing| <= 0.2 factor)
// - fortress:   the "Star defense" factor value (defScale × summed defensive impact)
// - discipline: exact total usage demand (sum of the per-player breakdown the engine already ships)
// - rim:        defScale-weighted defensive impact summed over rim protectors. Deliberate deviation
//               from the spec's "best-big rimScore × defScale": that value saturates at its 0.74
//               ceiling for ~75% of CASUAL drafts (probe, n=400), so it cannot grade dominance —
//               this keeps the intent (anchor the paint) with a metric that discriminates.
// - balanced:   net rating
const DEF_SCALE = DEFAULT_COEFFICIENTS.defScale; // display weighting only; tethered to the engine default
function factorValue(r: LineupResult, prefix: string): number {
  const f = r.factors.find((x) => x.label.startsWith(prefix));
  return f ? f.value : 0;
}
export function blueprintMetric(key: BlueprintKey, r: LineupResult): number {
  switch (key) {
    case "spacing": return factorValue(r, "Spacing");
    case "fortress": return factorValue(r, "Star defense");
    case "discipline": return r.players.reduce((a, p) => a + p.usage, 0);
    case "rim": return r.players.reduce((a, p) => a + (p.rimProtector ? p.def : 0), 0) * DEF_SCALE;
    case "balanced": return r.netRtg;
  }
}

export interface BlueprintView {
  key: BlueprintKey;
  label: string;
  metric: number;       // the committed metric's value
  metricLabel: string;
  metricText: string;   // formatted for display
  grade: string;        // A+ … F, on the blueprint axis alone
  mult: number;         // execution multiplier, 1.0–1.3
  score: number;        // composite = wins × mult (1dp) — the board's display score
}

export function gradeBlueprint(key: BlueprintKey, r: LineupResult): BlueprintView {
  const def = blueprintDef(key);
  const metric = blueprintMetric(key, r);
  let grade = "F";
  for (let i = 0; i < def.bands.length; i++) {
    if (def.lowerIsBetter ? metric <= def.bands[i] : metric >= def.bands[i]) { grade = BP_GRADES[i]; break; }
  }
  const mult = BP_MULT[grade];
  return {
    key, label: def.label, metric, metricLabel: def.metricLabel, metricText: def.format(metric),
    grade, mult, score: decodeBpDisplay(encBpScore(r.wins, mult, r.netRtg)),
  };
}

// --- bp board sort score: wins × multiplier is the rank, net is the tiebreak (encFhScore-style) ---
export const encBpScore = (wins: number, mult: number, net: number) =>
  Math.round(wins * mult * 100) * 1000 + Math.max(0, Math.min(999, net + 100));
export const decodeBpDisplay = (score: number) => Math.floor(score / 1000) / 100;

// --- board row/view shapes (defined here, not in the server-only store, for client import) ---
export interface BpRow {
  uid: string; name: string;
  wins: number; losses: number; net: number; lineup: string;
  bp: BlueprintKey;     // which blueprint earned this row (the combined board mixes them)
  grade: string;        // blueprint-execution grade
  score: number;        // display score: wins × mult, e.g. 86.1
}
export interface BpBoardRow extends BpRow { rank: number }
export interface BpBoardView { date: string; bp: BlueprintKey | "all"; total: number; top: BpBoardRow[]; you?: BpBoardRow }

