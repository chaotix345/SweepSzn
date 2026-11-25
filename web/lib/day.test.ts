import { describe, it, expect } from "vitest";
import { dayUTC, recentDays, isLiveDaily } from "./day";

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
