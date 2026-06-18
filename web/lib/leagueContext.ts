import "server-only";
import fs from "node:fs";
import path from "node:path";
import { threePtEra } from "./era";
import type { EraContext } from "./types";

// First runtime reader of public/data/league_context.json. It holds per-season league averages
// (mean + SD per stat, plus pace) keyed by year. We aggregate it into one descriptive snapshot per
// draftable decade for the Era Pulse banner. Loaded once and cached.

interface SeasonCtx {
  year: number;
  decade: string;
  pace: number | null;
  pts?: { mean: number | null; sd: number | null };
}

let _ctx: Record<string, SeasonCtx> | null = null;
function load(): Record<string, SeasonCtx> {
  if (_ctx) return _ctx;
  try {
    _ctx = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "data", "league_context.json"), "utf-8"),
    ) as Record<string, SeasonCtx>;
  } catch {
    _ctx = {};
  }
  return _ctx;
}

// One descriptive era snapshot for a draftable decade. Returns null for decades with no league data
// (e.g. "PRIME", or anything outside the dataset's year range).
export function decadeEraContext(decade: string): EraContext | null {
  const rows = Object.values(load()).filter((r) => r && r.decade === decade);
  if (!rows.length) return null;
  const avg = (sel: (r: SeasonCtx) => number | null | undefined): number | null => {
    const xs = rows.map(sel).filter((x): x is number => typeof x === "number");
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
  };
  const mid = parseInt(decade, 10) + 5; // "1980s" -> 1985 (decade midpoint year)
  return {
    decade,
    label: `${decade} NBA`,
    pace: avg((r) => r.pace),
    ppgEnv: avg((r) => r.pts?.mean),
    era3pt: threePtEra(mid),
  };
}
