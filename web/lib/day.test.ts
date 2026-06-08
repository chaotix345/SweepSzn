import { dayUTC, recentDays } from "./day";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// dayUTC formats UTC as YYYY-M-D with NO zero padding (matches existing lb:<date> keys)
assert(dayUTC(new Date("2026-06-09T12:00:00Z")) === "2026-6-9", "single-digit month/day not padded");
assert(dayUTC(new Date("2026-12-31T23:59:59Z")) === "2026-12-31", "double-digit month/day");
assert(dayUTC(new Date("2026-01-01T00:00:00Z")) === "2026-1-1", "Jan 1");

// recentDays returns n day-strings, newest first, stepping back 1 UTC day each
const r = recentDays(3, new Date("2026-06-09T12:00:00Z"));
assert(r.length === 3, "recentDays returns n entries");
assert(r[0] === "2026-6-9" && r[1] === "2026-6-8" && r[2] === "2026-6-7", "recentDays steps back UTC days, newest first");
// crosses a month boundary correctly
const r2 = recentDays(2, new Date("2026-03-01T06:00:00Z"));
assert(r2[0] === "2026-3-1" && r2[1] === "2026-2-28", "recentDays crosses month boundary");

console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL DAY CHECKS PASSED");
process.exit(fail ? 1 : 0);
