// Pure UTC date-key helpers. Format matches the existing lb:<date> keys: `YYYY-M-D`, no zero-padding, UTC.
// (The existing per-route `todayUTC` one-liners are intentionally left as-is; new code uses these.)

export const dayUTC = (d: Date = new Date()): string =>
  `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;

// Newest-first list of n day-keys ending at `now` (inclusive), stepping back one UTC day each.
export const recentDays = (n: number, now: Date = new Date()): string[] =>
  Array.from({ length: n }, (_, i) => dayUTC(new Date(now.getTime() - i * 86_400_000)));

// D2 anti-spoiler: a Daily is "live" on its own UTC day (and, defensively, any later day); it rolls
// over at 00:00 UTC. Parsed numerically so a zero-padded spelling can't dodge the gate; a malformed
// date fails closed (treated as live).
export function isLiveDaily(date: string, now: Date = new Date()): boolean {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);
  if (!m) return true;
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return day >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// The first Daily seed the app ever served (2026-06-06). Earlier dates have no Daily.
export const FIRST_DAILY = "2026-6-6";
export const FIRST_DAILY_MS = Date.UTC(2026, 5, 6);

// A UTC day in the seed spelling ("2026-6-9"); zero-padding tolerated but normalized, because the
// seed string is hashed and "2026-06-09" would otherwise be a different Daily. null if not a real day.
export function parseDayKey(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return dayUTC(d);
}

const dayMs = (key: string) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); };

// W3 archive: a rolled-over Daily, from the first one through yesterday. Returns the canonical key or null.
export function archiveDay(s: unknown, now: Date = new Date()): string | null {
  const key = parseDayKey(s);
  if (!key) return null;
  const ms = dayMs(key);
  return ms >= FIRST_DAILY_MS && ms < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) ? key : null;
}

// Every archive day, newest first (yesterday → the first Daily).
export function archiveDays(now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 86_400_000; t >= FIRST_DAILY_MS; t -= 86_400_000) out.push(dayUTC(new Date(t)));
  return out;
}

export const yesterdayUTC = (now: Date = new Date()): string => dayUTC(new Date(now.getTime() - 86_400_000));

// "Nov 19" (or "Nov 19, 2025" outside the current year when `withYear`).
export function shortDay(key: string, withYear = false): string {
  return new Date(dayMs(key)).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}
