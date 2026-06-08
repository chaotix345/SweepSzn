// ISO-8601 week key (UTC) for the weekly leaderboard. Week starts Monday; week 1 is the
// week containing the year's first Thursday. Returns e.g. "2026-W24".
export function isoWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d, 12);                  // UTC noon avoids any DST/rounding edges
  const isoDay = new Date(t).getUTCDay() || 7;          // Mon=1..Sun=7 (getUTCDay: Sun=0)
  const thu = new Date(t + (4 - isoDay) * 86400000);    // Thursday of this ISO week (can go backward)
  const year = thu.getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4, 12);                // Jan 4 is always in ISO week 1
  const jan4Iso = new Date(jan4).getUTCDay() || 7;
  const week1Mon = jan4 - (jan4Iso - 1) * 86400000;     // Monday of week 1
  const week = Math.floor((thu.getTime() - week1Mon) / (7 * 86400000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}
