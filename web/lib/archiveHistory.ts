// W3 past-Daily archive: this device's unranked replays, kept apart from the ranked result history
// (lib/resultHistory) on purpose, so an archive run never counts toward stats, the Dex, account sync,
// the "played today" tile or the streak. Best run per day. Client-only, localStorage, never throws.
import { listResults } from "./resultHistory";
import { getHistory } from "./streak";
import { dayUTC, parseDayKey } from "./day";

export interface ArchiveRun { wins: number; losses: number; grade: string; encoded: string; ts: number }
// What the player did on a day: the ranked Daily they played that day (best local result; the date
// alone when only the verified-submit history has it) and/or their best archive replay.
export interface DayPlay { daily?: { wins?: number }; replay?: ArchiveRun }

const KEY = "82-0:archive";
const CAP = 400;

function read(): Record<string, ArchiveRun> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export function saveArchiveRun(date: string, run: Omit<ArchiveRun, "ts">): void {
  try {
    const all = read();
    const prev = all[date];
    if (prev && prev.wins >= run.wins) return; // keep-best
    all[date] = { ...run, ts: Date.now() };
    const keys = Object.keys(all);
    if (keys.length > CAP) for (const k of keys.sort((a, b) => all[a].ts - all[b].ts).slice(0, keys.length - CAP)) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* no storage */ }
}

export function listArchiveRuns(): Record<string, ArchiveRun> { return read(); }

// Every day this device has played, keyed by the seed spelling ("2026-11-19").
export function playedDays(): Record<string, DayPlay> {
  const out: Record<string, DayPlay> = {};
  for (const d of getHistory()) { const k = parseDayKey(d); if (k) out[k] = { daily: {} }; }
  for (const e of listResults()) {
    if (e.mode !== "daily") continue;
    const k = dayUTC(new Date(e.ts));
    const best = out[k]?.daily?.wins;
    out[k] = { ...out[k], daily: { wins: best == null ? e.wins : Math.max(best, e.wins) } };
  }
  for (const [d, run] of Object.entries(read())) { const k = parseDayKey(d); if (k) out[k] = { ...out[k], replay: run }; }
  return out;
}

// The player's best known result for a day (ranked or replay), for the "you vs the perfect five" line.
export function bestWins(p: DayPlay | undefined): number | undefined {
  const xs = [p?.daily?.wins, p?.replay?.wins].filter((x): x is number => typeof x === "number");
  return xs.length ? Math.max(...xs) : undefined;
}
