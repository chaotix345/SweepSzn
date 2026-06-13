import type { Player } from "./types";

// Descriptive, at-a-glance player tags for the draft board. Derived from intrinsic box-score stats
// (public, not seed-relative — DESIGN.md §12), so they inform without revealing the engine's
// per-roster fit verdict (that stays behind the hint mechanic). Computed server-side in toCandidate;
// TRAIT_META is the client-side icon/label/tooltip lookup.
export type TraitKey = "sniper" | "shooter" | "rim" | "glass" | "playmaker" | "lockdown" | "efficient" | "volume";

export const TRAIT_META: Record<TraitKey, { icon: string; label: string; desc: string }> = {
  sniper: { icon: "🎯", label: "Elite shooter", desc: "High-volume, high-accuracy 3-point shooter" },
  shooter: { icon: "🎯", label: "Shooter", desc: "Reliable outside shooter" },
  rim: { icon: "🛡️", label: "Rim protector", desc: "Shot-blocking interior presence" },
  glass: { icon: "🧱", label: "Glass cleaner", desc: "Elite rebounder" },
  playmaker: { icon: "🧠", label: "Playmaker", desc: "High-assist offensive creator" },
  lockdown: { icon: "🔒", label: "Ball hawk", desc: "Disruptive on-ball defender (steals)" },
  efficient: { icon: "💎", label: "Efficient", desc: "Elite scoring efficiency (true shooting %)" },
  volume: { icon: "⚡", label: "High usage", desc: "Heavy offensive workload" },
};

// Most identity-defining first — the board shows the top couple, so this is the tie-break for
// which traits surface when a player qualifies for several.
const TRAIT_ORDER: TraitKey[] = ["sniper", "rim", "playmaker", "glass", "lockdown", "efficient", "shooter", "volume"];

export function playerTraits(p: Player): TraitKey[] {
  const got = new Set<TraitKey>();
  const a = p.fg3a, m = p.fg3;
  const pct = a != null && a > 0 && m != null ? m / a : null;
  if (a != null && a >= 5 && pct != null && pct >= 0.38) got.add("sniper");
  else if (a != null && a >= 2.5 && pct != null && pct >= 0.355) got.add("shooter");
  if (p.blk != null && p.blk >= 1.8) got.add("rim");
  if (p.trb != null && p.trb >= 10.5) got.add("glass");
  if (p.ast != null && p.ast >= 6.5) got.add("playmaker");
  if (p.stl != null && p.stl >= 1.9) got.add("lockdown");
  if (p.ts != null && p.ts >= 0.62 && p.pts != null && p.pts >= 16) got.add("efficient");
  if ((p.usg != null && p.usg >= 29) || (p.pts != null && p.pts >= 26)) got.add("volume");
  return TRAIT_ORDER.filter((t) => got.has(t));
}
