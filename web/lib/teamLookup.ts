import "server-only";
import fs from "node:fs";
import path from "node:path";

// Runtime reader of public/data/team_lookup.json (built offline by data/emit_team_lookup.py from
// team_seasons.json). Real franchise-season ratings keyed by "<team_name>|<year>" — used post-commit
// by the Scouting Anchor + "vs Real Team" compare. Descriptive history only (DESIGN.md §12). Cached once.

export interface TeamSeason {
  team_name: string;
  year: number;
  w: number | null;
  l: number | null;
  ortg: number | null;
  drtg: number | null;
  nrtg: number | null;
  srs: number | null;
  mov: number | null;
}

let _cache: Record<string, TeamSeason> | null = null;
function load(): Record<string, TeamSeason> {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "data", "team_lookup.json"), "utf-8"),
    ) as Record<string, TeamSeason>;
  } catch {
    _cache = {};
  }
  return _cache;
}

export function teamSeason(name: string, year: number): TeamSeason | null {
  return load()[`${name}|${year}`] ?? null;
}
