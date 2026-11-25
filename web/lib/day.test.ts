import { describe, it, expect } from "vitest";
import { dayUTC, recentDays, isLiveDaily, parseDayKey, archiveDay, archiveDays, yesterdayUTC, FIRST_DAILY } from "./day";

// dayUTC formats UTC as YYYY-M-D with NO zero padding (matches existing lb:<date> keys)
describe("dayUTC", () => {
  it("single-digit month/day not padded", () => {
    expect(dayUTC(new Date("2026-06-09T12:00:00Z"))).toBe("2026-6-9");
  });

  it("double-digit month/day", () => {
    expect(dayUTC(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
  });

  it("Jan 1", () => {
    expect(dayUTC(new Date("2026-01-01T00:00:00Z"))).toBe("2026-1-1");
  });
});

// recentDays returns n day-strings, newest first, stepping back 1 UTC day each
describe("recentDays", () => {
  it("recentDays returns n entries", () => {
    const r = recentDays(3, new Date("2026-06-09T12:00:00Z"));
    expect(r.length).toBe(3);
  });

  it("recentDays steps back UTC days, newest first", () => {
    const r = recentDays(3, new Date("2026-06-09T12:00:00Z"));
    expect(r[0] === "2026-6-9" && r[1] === "2026-6-8" && r[2] === "2026-6-7").toBe(true);
  });

  // crosses a month boundary correctly
  it("recentDays crosses month boundary", () => {
    const r2 = recentDays(2, new Date("2026-03-01T06:00:00Z"));
    expect(r2[0] === "2026-3-1" && r2[1] === "2026-2-28").toBe(true);
  });
});

// D2: a Daily is "live" from its own UTC day onward; rolled-over (past) days are not.
describe("isLiveDaily", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  it("today is live", () => expect(isLiveDaily("2026-11-25", now)).toBe(true));
  it("a future date is live", () => expect(isLiveDaily("2026-11-26", now)).toBe(true));
  it("yesterday is not live", () => expect(isLiveDaily("2026-11-24", now)).toBe(false));
  it("parses zero-padded spellings numerically", () => expect(isLiveDaily("2026-06-09", new Date("2026-06-09T12:00:00Z"))).toBe(true));
  it("rolls over at 00:00 UTC", () => {
    expect(isLiveDaily("2026-11-25", new Date("2026-11-25T23:59:59Z"))).toBe(true);
    expect(isLiveDaily("2026-11-25", new Date("2026-11-26T00:00:00Z"))).toBe(false);
  });
  it("fails closed on a malformed date", () => expect(isLiveDaily("garbage", now)).toBe(true));
});

// W3 archive: rolled-over Dailies from the first one through yesterday, in the seed spelling.
describe("archive days", () => {
  const NOW = new Date("2026-11-26T12:00:00Z");
  it("normalizes zero-padded spellings to the seed key and rejects non-days", () => {
    expect(parseDayKey("2026-06-09")).toBe("2026-6-9");
    expect(parseDayKey("2026-2-30")).toBeNull();
    expect(parseDayKey("daily-2026-6-9")).toBeNull();
    expect(parseDayKey(20260609)).toBeNull();
  });
  it("accepts the first Daily through yesterday only", () => {
    expect(archiveDay(FIRST_DAILY, NOW)).toBe("2026-6-6");
    expect(archiveDay("2026-6-5", NOW)).toBeNull();
    expect(archiveDay("2026-11-25", NOW)).toBe("2026-11-25");
    expect(archiveDay("2026-11-26", NOW)).toBeNull(); // today is the live, ranked Daily
    expect(archiveDay("2026-11-27", NOW)).toBeNull();
    expect(archiveDay("2026-11-025", NOW)).toBeNull();
  });
  it("lists every archive day newest first", () => {
    const days = archiveDays(NOW);
    expect(days[0]).toBe("2026-11-25");
    expect(days[days.length - 1]).toBe("2026-6-6");
    expect(days).toHaveLength(173); // Jun 6 → Nov 25 inclusive
    expect(new Set(days).size).toBe(days.length);
  });
  it("is empty on the first Daily's own day", () => {
    expect(archiveDays(new Date("2026-06-06T08:00:00Z"))).toEqual([]);
  });
  it("yesterdayUTC steps one UTC day back", () => {
    expect(yesterdayUTC(new Date("2026-12-01T00:30:00Z"))).toBe("2026-11-30");
  });
});
