// Pure UTC date-key helpers. Format matches the existing lb:<date> keys: `YYYY-M-D`, no zero-padding, UTC.
// (The existing per-route `todayUTC` one-liners are intentionally left as-is; new code uses these.)

export const dayUTC = (d: Date = new Date()): string =>
  `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;

// Newest-first list of n day-keys ending at `now` (inclusive), stepping back one UTC day each.
export const recentDays = (n: number, now: Date = new Date()): string[] =>
  Array.from({ length: n }, (_, i) => dayUTC(new Date(now.getTime() - i * 86_400_000)));
