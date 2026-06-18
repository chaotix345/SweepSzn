import type { ThreePtEraKey } from "./types";

// Pure, descriptive helpers for the Era & League Context layer. They turn a year / z-score into
// human-readable era framing for the draft board and dossier. They are NOT engine signals: a stat's
// dominance for its era does not map to how the engine rewards the player (DESIGN.md §12 trust model).

const ERA_LABEL: Record<ThreePtEraKey, string> = {
  pre: "Pre-3PT era",
  early: "Early 3PT era",
  modern: "Modern 3PT era",
  three_ball: "Three-ball era",
};

// The league's 3-point environment for a season. Year-based on purpose: league_context.json carries
// no 3PA field, and the adoption curve is well-known (introduced 1979-80, normalized through the
// 90s, exploded from ~2015).
export function threePtEra(year: number): { key: ThreePtEraKey; label: string } {
  const key: ThreePtEraKey = year < 1980 ? "pre" : year < 1995 ? "early" : year < 2015 ? "modern" : "three_ball";
  return { key, label: ERA_LABEL[key] };
}

// "+4.1σ" / "-0.3σ" — how many SDs above/below his era's qualified average a stat is. Empty for missing.
export function sigmaText(z: number | null | undefined): string {
  if (z == null || Number.isNaN(z)) return "";
  const r = Math.round(z * 10) / 10;
  return `${r >= 0 ? "+" : "-"}${Math.abs(r).toFixed(1)}σ`;
}

// 0..100 bar width for a z-score, anchored at the league mean (z <= 0 -> 0), clamped at z = 3.5.
export function barPct(z: number | null | undefined): number {
  if (z == null || Number.isNaN(z) || z <= 0) return 0;
  return Math.round(Math.min(z / 3.5, 1) * 100);
}
