import { WIN_GRADES } from "./engine";
import type { ResultEntry, ResultMode } from "./resultHistory";
import { streakFrom } from "./streak";

// "My Stats" (/stats): pure, descriptive aggregates over the player's OWN finished games (the local
// result history, unioned with the account's when signed in) and completed-Daily dates. No DOM, no
// engine-internal signals — only records and grades the player already saw (DESIGN.md §12).

export const STAT_MODES: readonly ResultMode[] = ["daily", "classic", "hoopiq", "challenge", "factorhunt", "prime", "blueprint", "surgeon"];
export const GRADE_SCALE: readonly string[] = WIN_GRADES.map((g) => g.grade); // best → worst

export interface ModeStats { mode: ResultMode; played: number; best: ResultEntry | null; avgWins: number | null }
export interface GradeCount { grade: string; count: number }
export interface PlayerStats {
  total: number;
  modes: ModeStats[];
  best: ResultEntry | null;
  grades: GradeCount[];
  currentStreak: number;
  bestStreak: number;
  last7Days: number;
}

const DAY_MS = 86_400_000;
const MODE_SET = new Set<string>(STAT_MODES);
const key = (e: ResultEntry) => `${e.mode}:${e.encoded}`;
const gradeRank = (g: string) => { const i = GRADE_SCALE.indexOf(g); return i < 0 ? GRADE_SCALE.length : i; };

function valid(x: unknown): ResultEntry | null {
  if (!x || typeof x !== "object") return null;
  const e = x as Record<string, unknown>;
  if (typeof e.mode !== "string" || !MODE_SET.has(e.mode)) return null;
  if (typeof e.encoded !== "string" || !e.encoded) return null;
  if (typeof e.wins !== "number" || !Number.isFinite(e.wins)) return null;
  if (typeof e.losses !== "number" || !Number.isFinite(e.losses)) return null;
  return {
    ...(x as ResultEntry),
    grade: typeof e.grade === "string" ? e.grade : "",
    ts: typeof e.ts === "number" && Number.isFinite(e.ts) ? e.ts : 0,
  };
}

// Highest wins; tie → better grade; tie → most recent.
const better = (a: ResultEntry, b: ResultEntry | null): boolean =>
  !b || a.wins > b.wins || (a.wins === b.wins && (gradeRank(a.grade) < gradeRank(b.grade) || (a.grade === b.grade && a.ts > b.ts)));

// Where a past game re-opens — mirrors components/ResultsHistory.tsx (surgeon → /sg/, a created
// challenge → its owner dashboard via Game's ?own= restore, everything else → /r/).
export function resultHref(e: ResultEntry): string {
  if (e.mode === "challenge" && e.challengeId) return `/play?own=${e.challengeId}`;
  return e.mode === "surgeon" ? `/sg/${e.encoded}` : `/r/${e.encoded}`;
}

// Union the account's server history into the local list exactly like ResultsHistory: dedupe by
// mode:encoded (the local copy wins), newest-first.
export function mergeResults(local: ResultEntry[], remote: ResultEntry[]): ResultEntry[] {
  const seen = new Set(local.map(key));
  const merged = [...local];
  for (const e of remote) if (!seen.has(key(e))) merged.push(e);
  return merged.sort((a, b) => b.ts - a.ts);
}

// Day number since epoch for a `YYYY-M-D` (or zero-padded) UTC key; null if malformed or impossible.
function dayNum(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const ms = Date.UTC(y, mo - 1, d);
  const t = new Date(ms);
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return ms / DAY_MS;
}

// Longest run of consecutive UTC days anywhere in the completed-Daily history.
export function bestDailyStreak(dates: string[]): number {
  const days = [...new Set(dates.map(dayNum).filter((n): n is number => n !== null))].sort((a, b) => a - b);
  let best = 0, run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export function computeStats(results: unknown[], dailyDates: string[], now: number): PlayerStats {
  const byKey = new Map<string, ResultEntry>();
  for (const x of results) {
    const e = valid(x);
    if (!e) continue;
    const prev = byKey.get(key(e));
    if (!prev || e.ts > prev.ts) byKey.set(key(e), e);
  }
  const games = [...byKey.values()];

  const modes: ModeStats[] = STAT_MODES.map((mode) => {
    const mine = games.filter((g) => g.mode === mode);
    let best: ResultEntry | null = null;
    for (const g of mine) if (better(g, best)) best = g;
    const avgWins = mine.length ? Math.round((mine.reduce((s, g) => s + g.wins, 0) / mine.length) * 10) / 10 : null;
    return { mode, played: mine.length, best, avgWins };
  });

  let best: ResultEntry | null = null;
  for (const g of games) if (better(g, best)) best = g;

  const grades = GRADE_SCALE.map((grade) => ({ grade, count: games.filter((g) => g.grade === grade).length }));
  const currentStreak = streakFrom(dailyDates, now);

  return {
    total: games.length,
    modes,
    best,
    grades,
    currentStreak,
    bestStreak: Math.max(bestDailyStreak(dailyDates), currentStreak),
    last7Days: games.filter((g) => g.ts > now - 7 * DAY_MS).length,
  };
}

// Signed in: the account's server-authoritative streak counts Dailies finished on other devices too.
export function withAccountStreak(s: PlayerStats, accountStreak: number): PlayerStats {
  if (!Number.isFinite(accountStreak) || accountStreak <= s.currentStreak) return s;
  return { ...s, currentStreak: accountStreak, bestStreak: Math.max(s.bestStreak, accountStreak) };
}
