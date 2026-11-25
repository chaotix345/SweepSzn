import { historyPercentileText } from "./historyPercentile";
import { DEFAULT_COEFFICIENTS } from "./engine";
import type { PlayerBreakdown } from "./types";

// Share copy (W6). A share reads as a claim the reader can dispute ("Engine says 58-24. Wrong?"),
// with the W2 history percentile as the proof line. Pure + client-safe.

export type ShareVariant = "challenge" | "fallback" | "result" | "daily" | "mode";

export function claimText({ wins, losses, names, prime, usedHints, challenge }: {
  wins: number; losses: number; names?: string[] | null; prime?: boolean; usedHints?: boolean; challenge?: boolean;
}): string {
  const rec = `${wins}-${losses}${usedHints ? " (drafted with hints)" : ""}`;
  // a challenge hides the creator's five until the friend has played (D6), so its copy never names it
  const who = !challenge && names?.length ? `${names.join(" · ")} go ${rec}` : prime ? `my PRIME five goes ${rec}` : rec;
  const dare = challenge ? "Same spins, your draft. Beat this five →" : "Beat this five →";
  return `Engine says ${who}. ${historyPercentileText(wins)}. Wrong? ${dare}`;
}

// Per-slot value cut-offs (points per 100, offScale·off + defScale·def — the weakestSlot metric):
// the 75th and 25th percentiles of the 250-card draftable pool. Top quarter green, bottom quarter red.
export const SLOT_CELL_TOP = 4.1;
export const SLOT_CELL_LOW = 2.6;

export function slotCells(players: PlayerBreakdown[], c = DEFAULT_COEFFICIENTS): string {
  return players
    .map((b) => {
      const v = Math.round((c.offScale * b.off + c.defScale * b.def) * 100) / 100;
      return v >= SLOT_CELL_TOP ? "🟩" : v >= SLOT_CELL_LOW ? "🟨" : "🟥";
    })
    .join("");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dailyLabel(date: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${MONTHS[+m[2] - 1]} ${+m[3]}` : date;
}

// Wordle-style Daily share: the grid says how each slot graded without saying who filled it, so a
// live Daily's spins stay unspoiled. Names join only after that Daily has rolled over.
export function dailyShareText({ date, wins, losses, grade, players, names, live }: {
  date: string; wins: number; losses: number; grade: string; players: PlayerBreakdown[]; names: string[]; live: boolean;
}): string {
  const lines = [`SweepSzn Daily · ${dailyLabel(date)}`, `${wins}-${losses} · ${grade}`, slotCells(players), `${historyPercentileText(wins)}.`];
  if (!live && names.length) lines.push(names.join(" · "));
  return lines.join("\n");
}
