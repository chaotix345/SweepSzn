import "server-only";
import fs from "node:fs";
import path from "node:path";
import { playerImpact } from "./engine";
import type { Coefficients, Player } from "./types";

// Data behind the public /how-it-works receipts (DESIGN.md §14). Read at build time only: the page
// is static, so no route traces these files at request time.
const DATA_DIR = path.join(process.cwd(), "public", "data");

export interface FamousTeam { label: string; year: number; team: string; predicted_wins: number; cold_wins: number; actual_wins: number; actual_losses: number }
export interface EngineMeta {
  team_seasons: number;
  cv_wins_rmse: number;
  cv_wins_rmse_vs_actual: number;
  track_b_cv?: number;
  track_b_cv_vs_actual?: number;
  track_b_baseline_cv?: number;
  pythK?: number;
}

export function getFamousTeams(): FamousTeam[] {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "famous_teams.json"), "utf-8")); } catch { return []; }
}

export function getEngineMeta(): EngineMeta {
  const c = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "coefficients.json"), "utf-8"));
  return { ...c._meta, pythK: c.pythK };
}

export interface RankedCard { id: string; name: string; year: number; team: string; off: number; def: number; total: number }

// Best card per real person by off+def (or def alone), the same view scripts/rank.ts prints.
export function topCards(players: Player[], c: Coefficients, by: "total" | "def", n: number): RankedCard[] {
  const best = new Map<string, RankedCard>();
  for (const p of players) {
    const im = playerImpact(p, c);
    const row = { id: p.id, name: p.name, year: p.year, team: p.team, off: im.off, def: im.def, total: Math.round((im.off + im.def) * 10) / 10 };
    const key = p.person_id ?? p.id;
    const prev = best.get(key);
    if (!prev || row[by] > prev[by]) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => b[by] - a[by]).slice(0, n);
}
