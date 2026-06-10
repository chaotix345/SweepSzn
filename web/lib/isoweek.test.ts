import { describe, it, expect } from "vitest";
import { isoWeek } from "./isoweek";

// Authoritative ISO-8601 boundary cases (Wikipedia reference table) — these are exactly the
// Fri/Sat/Sun + year-boundary days the naive "always go forward to Thursday" formula got wrong.
const cases: [string, string, string][] = [
  ["2005-1-1", "2004-W53", "Sat 2005-01-01"],
  ["2005-1-2", "2004-W53", "Sun 2005-01-02"],
  ["2005-12-31", "2005-W52", "Sat 2005-12-31"],
  ["2006-1-1", "2005-W52", "Sun 2006-01-01"],
  ["2006-1-2", "2006-W01", "Mon 2006-01-02"],
  ["2006-12-31", "2006-W52", "Sun 2006-12-31"],
  ["2007-1-1", "2007-W01", "Mon 2007-01-01"],
  ["2007-12-30", "2007-W52", "Sun 2007-12-30"],
  ["2007-12-31", "2008-W01", "Mon 2007-12-31"],
  ["2008-12-28", "2008-W52", "Sun 2008-12-28"],
  ["2008-12-29", "2009-W01", "Mon 2008-12-29"],
  ["2009-1-1", "2009-W01", "Thu 2009-01-01"],
  ["2009-12-31", "2009-W53", "Thu 2009-12-31"],
  ["2010-1-3", "2009-W53", "Sun 2010-01-03"],
  ["2010-1-4", "2010-W01", "Mon 2010-01-04"],
  // project-relevant + the regression days the original code mis-keyed
  ["2025-12-28", "2025-W52", "Sun 2025-12-28 (regression)"],
  ["2025-12-29", "2026-W01", "Mon 2025-12-29"],
  ["2026-1-1", "2026-W01", "Thu 2026-01-01"],
  ["2026-1-4", "2026-W01", "Sun 2026-01-04 (regression)"],
  ["2026-1-5", "2026-W02", "Mon 2026-01-05"],
  ["2026-6-8", "2026-W24", "Mon 2026-06-08 (today)"],
  ["2026-6-12", "2026-W24", "Fri 2026-06-12 (regression)"],
  ["2026-6-14", "2026-W24", "Sun 2026-06-14"],
  ["2026-6-15", "2026-W25", "Mon 2026-06-15"],
];

describe("isoWeek", () => {
  for (const [date, want, label] of cases) {
    it(label, () => {
      expect(isoWeek(date)).toBe(want);
    });
  }
});
