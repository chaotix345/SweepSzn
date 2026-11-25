import PACE from "./historyPace.json";

// "Measured against history" (W2, D7): where a projected record sits among every real NBA team since
// 1985. lib/historyPace.json is the sorted 82-game win pace of the 1,170 team-seasons (1985–2025 with
// a recorded W-L) in public/data/team_lookup.json, derived once by scripts/emit_history_pace.ts and
// pinned to the source by test/historyPercentile.test.ts. Pure + client-safe (~8 KB of numbers).

export const HISTORY_FROM = 1985;
export const HISTORY_TO = 2025;

type Row = { year: number; w: number | null; l: number | null };

// Pace to 82 games, rounded to 2dp: integer paces stay exact (so a 41-41 team ties a 41-win five),
// and no shortened season lands within 0.005 of a whole number, so rounding never invents a tie.
export function historyPaceFrom(rows: Row[]): number[] {
  return rows
    .filter((r) => r.year >= HISTORY_FROM && r.year <= HISTORY_TO && r.w != null && r.l != null && r.w + r.l > 0)
    .map((r) => Math.round(((r.w as number) / ((r.w as number) + (r.l as number))) * 82 * 100) / 100)
    .sort((a, b) => a - b);
}

export const HISTORY_PACE: readonly number[] = PACE;

export interface HistoryRank { pct: number; beatsAll: boolean; beatsNone: boolean; total: number }

// Share of real teams a `wins`-win five beats: teams below count fully, exact ties count half.
// The displayed percentage is floored, so "100%" never appears; beating every team says so instead.
export function historyRank(wins: number, pace: readonly number[] = HISTORY_PACE): HistoryRank {
  let below = 0, tied = 0;
  for (const p of pace) {
    if (p < wins) below++;
    else if (p === wins) tied++;
    else break;
  }
  const total = pace.length;
  return { pct: Math.floor((100 * (below + tied / 2)) / total), beatsAll: below === total, beatsNone: below + tied === 0, total };
}

export function historyPercentileText(wins: number): string {
  const r = historyRank(wins);
  if (r.beatsAll) return `Better than every real team since ${HISTORY_FROM}`;
  if (r.beatsNone) return `Worse than every real team since ${HISTORY_FROM}`;
  // The floored % flattens both ends: 67-73 wins would all read "99%", a 10-win five "0%".
  if (r.pct >= 99) return `Top 1% of real NBA teams since ${HISTORY_FROM}`;
  if (r.pct === 0) return `Below nearly every real NBA team since ${HISTORY_FROM}`;
  return `Beats ${r.pct}% of real NBA teams since ${HISTORY_FROM}`;
}
