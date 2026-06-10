import { describe, it, expect } from "vitest";
import { dayUTC, recentDays } from "./day";

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
