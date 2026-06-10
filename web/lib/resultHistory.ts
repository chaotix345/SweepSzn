// Client-only result history (localStorage). Every finished game is remembered as the /r/ permalink
// segment for its five, so any past result re-opens via the existing /r/<encoded> page — and the most
// recent one restores in place on refresh. No server. Mirrors streak.ts's try/catch resilience:
// private mode / quota just degrades to "no history", never throws.

export type ResultMode = "daily" | "classic" | "hoopiq" | "challenge" | "factorhunt" | "prime" | "blueprint";
export interface ResultEntry { encoded: string; mode: ResultMode; wins: number; losses: number; grade: string; ts: number; challengeId?: string }

const KEY = "82-0:results";
const LAST = "82-0:lastResult";
const CAP = 50;

function read(): ResultEntry[] {
  try { const a = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Remember a finished game. Dedupe by mode+encoded so replaying the same five — or upgrading a freshly
// drafted challenge entry once it carries its challengeId — collapses to one newest entry. Newest first.
export function saveResult(e: Omit<ResultEntry, "ts">): void {
  try {
    const dupe = `${e.mode}:${e.encoded}`;
    const rest = read().filter((x) => `${x.mode}:${x.encoded}` !== dupe);
    localStorage.setItem(KEY, JSON.stringify([{ ...e, ts: Date.now() }, ...rest].slice(0, CAP)));
  } catch { /* no storage */ }
}

export function listResults(): ResultEntry[] { return read(); } // already newest-first

// The full current result, kept so a SAME-session refresh restores everything — including the draft
// trace the Daily leaderboard needs to submit. Just one slot, overwritten each game. The shape is
// opaque here (it's the Game component's `result` plus its mode + seed); the caller types it.
export function writeLastResult(v: unknown): void {
  try { localStorage.setItem(LAST, JSON.stringify(v)); } catch { /* no storage */ }
}
export function readLastResult<T = unknown>(): T | null {
  try { const s = localStorage.getItem(LAST); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}
