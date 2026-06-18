import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Player } from "./types";

// Player dossier data: real accolade counts (data/build_accolades.py -> accolades.json) + the career
// arc derived from the player's own franchise/era variants. Descriptive biography only — who the
// player was — never an engine/fit signal (DESIGN.md §12 trust model).

export interface Accolades { as: number; mvp: number; anba: number; anba1: number; adef: number }
export interface JourneyStint { team: string; decade: string; peak: boolean }

let _acc: Record<string, Accolades> | null = null;
function loadAccolades(): Record<string, Accolades> {
  if (_acc) return _acc;
  try {
    _acc = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "data", "accolades.json"), "utf-8"),
    ) as Record<string, Accolades>;
  } catch {
    _acc = {};
  }
  return _acc;
}

export function accoladesFor(personId: string): Accolades | null {
  return loadAccolades()[personId] ?? null;
}

// One-line recognizability summary, most-prestigious first. Empty string for a player with none.
export function accoladeLine(a: Accolades): string {
  const parts: string[] = [];
  if (a.mvp) parts.push(`${a.mvp}× MVP`);
  if (a.as) parts.push(`${a.as}× All-Star`);
  if (a.anba) parts.push(`${a.anba}× All-NBA${a.anba1 ? ` (${a.anba1} 1st)` : ""}`);
  if (a.adef) parts.push(`${a.adef}× All-Defense`);
  return parts.join(" · ");
}

// The player's career arc: unique team+decade stints, chronological, with the single peak flagged.
export function careerJourney(variants: Player[]): JourneyStint[] {
  if (!variants.length) return [];
  const peak = variants.reduce((b, p) => ((p.peak_score ?? 0) > (b.peak_score ?? 0) ? p : b), variants[0]);
  const peakKey = `${peak.team}|${peak.decade}`;
  const seen = new Set<string>();
  const out: JourneyStint[] = [];
  for (const p of [...variants].sort((a, b) => a.decade.localeCompare(b.decade))) {
    const key = `${p.team}|${p.decade}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ team: p.team, decade: p.decade, peak: key === peakKey });
  }
  return out;
}
