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
