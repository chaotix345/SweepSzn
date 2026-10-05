import { describe, it, expect } from "vitest";
import type { ResultEntry } from "./resultHistory";
import { streakFrom } from "./streak";
import {
  STAT_MODES, GRADE_SCALE, computeStats, bestDailyStreak, mergeResults, resultHref, withAccountStreak,
} from "./stats";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 5, 15, 30); // 2026-10-05 15:30 UTC
const e = (p: Partial<ResultEntry> & Pick<ResultEntry, "mode" | "wins">): ResultEntry => ({
  encoded: `${p.mode}-${p.wins}-${p.ts ?? 0}`, losses: 82 - p.wins, grade: "C", ts: NOW - DAY, ...p,
});

describe("computeStats — empty / malformed input", () => {
  it("returns zeroed stats for no games and no dailies", () => {
    const s = computeStats([], [], NOW);
    expect(s.total).toBe(0);
    expect(s.best).toBeNull();
    expect(s.last7Days).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(0);
    expect(s.modes.map((m) => m.mode)).toEqual([...STAT_MODES]);
    for (const m of s.modes) expect(m).toMatchObject({ played: 0, best: null, avgWins: null });
    expect(s.grades.map((g) => g.grade)).toEqual([...GRADE_SCALE]);
    expect(s.grades.every((g) => g.count === 0)).toBe(true);
  });

  it("covers all eight result modes and the engine's grade scale in order", () => {
    expect([...STAT_MODES]).toEqual(["daily", "classic", "hoopiq", "challenge", "factorhunt", "prime", "blueprint", "surgeon"]);
    expect([...GRADE_SCALE]).toEqual(["S", "A+", "A", "B", "C", "D", "F"]);
  });

  it("skips entries with non-finite wins/losses, unknown modes, and non-objects", () => {
    const junk = [
      null, 42, "x",
      { ...e({ mode: "classic", wins: 50 }), wins: NaN },
      { ...e({ mode: "classic", wins: 50 }), wins: Infinity, encoded: "inf" },
      { ...e({ mode: "classic", wins: 50 }), wins: "60", encoded: "str" },
      { ...e({ mode: "classic", wins: 50 }), losses: undefined, encoded: "noloss" },
      { ...e({ mode: "classic", wins: 50 }), mode: "bogus", encoded: "bogus" },
      { ...e({ mode: "classic", wins: 50 }), encoded: "" },
    ];
    const good = e({ mode: "classic", wins: 40, encoded: "ok" });
    const s = computeStats([...junk, good] as unknown[], [], NOW);
    expect(s.total).toBe(1);
    expect(s.best?.encoded).toBe("ok");
  });

  it("dedupes repeated mode:encoded entries, keeping the newest", () => {
    const old = e({ mode: "classic", wins: 50, encoded: "same", ts: NOW - 3 * DAY, grade: "C" });
    const fresh = e({ mode: "classic", wins: 50, encoded: "same", ts: NOW - DAY, grade: "C" });
    const sameFiveOtherMode = e({ mode: "prime", wins: 50, encoded: "same" });
    const s = computeStats([old, fresh, sameFiveOtherMode], [], NOW);
    expect(s.total).toBe(2);
    expect(s.modes.find((m) => m.mode === "classic")?.best?.ts).toBe(NOW - DAY);
  });
});

describe("computeStats — per-mode + overall", () => {
  const games = [
    e({ mode: "classic", wins: 70, grade: "A", encoded: "c1", ts: NOW - 1 * DAY }),
    e({ mode: "classic", wins: 55, grade: "C", encoded: "c2", ts: NOW - 2 * DAY }),
    e({ mode: "classic", wins: 61, grade: "B", encoded: "c3", ts: NOW - 20 * DAY }),
    e({ mode: "daily", wins: 62, grade: "A", encoded: "d1", ts: NOW - 3 * DAY }),
    e({ mode: "surgeon", wins: 75, grade: "A+", encoded: "s1", ts: NOW - 30 * DAY }),
  ];

  it("counts total games and games per mode", () => {
    const s = computeStats(games, [], NOW);
    expect(s.total).toBe(5);
    const by = Object.fromEntries(s.modes.map((m) => [m.mode, m.played]));
    expect(by).toMatchObject({ classic: 3, daily: 1, surgeon: 1, hoopiq: 0, challenge: 0, factorhunt: 0, prime: 0, blueprint: 0 });
  });

  it("averages wins per mode to one decimal", () => {
    const s = computeStats(games, [], NOW);
    expect(s.modes.find((m) => m.mode === "classic")?.avgWins).toBe(62); // (70+55+61)/3 = 62.0
    const two = computeStats([e({ mode: "prime", wins: 50, encoded: "p1" }), e({ mode: "prime", wins: 51, encoded: "p2" }), e({ mode: "prime", wins: 51, encoded: "p3" })], [], NOW);
    expect(two.modes.find((m) => m.mode === "prime")?.avgWins).toBe(50.7); // 50.666… → 50.7
  });

  it("picks each mode's best by highest wins and keeps its encoded permalink", () => {
    const s = computeStats(games, [], NOW);
    const classic = s.modes.find((m) => m.mode === "classic")!;
    expect(classic.best).toMatchObject({ wins: 70, losses: 12, grade: "A", encoded: "c1" });
  });

  it("breaks a wins tie by the better grade, then by the most recent game", () => {
    const tieGrade = computeStats([
      e({ mode: "blueprint", wins: 60, grade: "B", encoded: "b-worse", ts: NOW - DAY }),
      e({ mode: "blueprint", wins: 60, grade: "A", encoded: "b-better", ts: NOW - 9 * DAY }),
    ], [], NOW);
    expect(tieGrade.modes.find((m) => m.mode === "blueprint")?.best?.encoded).toBe("b-better");
    const tieAll = computeStats([
      e({ mode: "hoopiq", wins: 60, grade: "B", encoded: "h-old", ts: NOW - 9 * DAY }),
      e({ mode: "hoopiq", wins: 60, grade: "B", encoded: "h-new", ts: NOW - DAY }),
    ], [], NOW);
    expect(tieAll.modes.find((m) => m.mode === "hoopiq")?.best?.encoded).toBe("h-new");
  });

  it("reports the overall best record with its mode", () => {
    const s = computeStats(games, [], NOW);
    expect(s.best).toMatchObject({ mode: "surgeon", wins: 75, losses: 7, encoded: "s1" });
  });

  it("builds the grade distribution in scale order, ignoring unknown grades", () => {
    const s = computeStats([...games, e({ mode: "prime", wins: 10, grade: "??", encoded: "weird" })], [], NOW);
    expect(s.grades).toEqual([
      { grade: "S", count: 0 }, { grade: "A+", count: 1 }, { grade: "A", count: 2 },
      { grade: "B", count: 1 }, { grade: "C", count: 1 }, { grade: "D", count: 0 }, { grade: "F", count: 0 },
    ]);
  });

  it("counts games finished in the last 7 days (rolling, UTC-independent)", () => {
    const s = computeStats([
      e({ mode: "classic", wins: 50, encoded: "a", ts: NOW }),
      e({ mode: "classic", wins: 50, encoded: "b", ts: NOW - 7 * DAY + 1 }),
      e({ mode: "classic", wins: 50, encoded: "c", ts: NOW - 7 * DAY }),
      e({ mode: "classic", wins: 50, encoded: "d", ts: NOW - 30 * DAY }),
      { ...e({ mode: "classic", wins: 50, encoded: "e" }), ts: NaN },
    ] as unknown[], [], NOW);
    expect(s.total).toBe(5);
    expect(s.last7Days).toBe(2);
  });
});

describe("Daily streaks", () => {
  it("current streak matches lib/streak getStreak semantics (today or yesterday anchors the run)", () => {
    const today = ["2026-10-5", "2026-10-4", "2026-10-3"];
    expect(computeStats([], today, NOW).currentStreak).toBe(3);
    expect(computeStats([], ["2026-10-4", "2026-10-3"], NOW).currentStreak).toBe(2); // yesterday keeps it alive
    expect(computeStats([], ["2026-10-3"], NOW).currentStreak).toBe(0); // two days ago → broken
    for (const h of [today, ["2026-10-4"], ["2026-10-3"], []]) {
      expect(computeStats([], h, NOW).currentStreak).toBe(streakFrom(h, NOW));
    }
  });

  it("current streak crosses a year boundary", () => {
    const newYear = Date.UTC(2027, 0, 1, 2);
    expect(computeStats([], ["2026-12-30", "2026-12-31", "2027-1-1"], newYear).currentStreak).toBe(3);
  });

  it("best streak is the longest run of consecutive UTC days anywhere in history", () => {
    expect(bestDailyStreak([])).toBe(0);
    expect(bestDailyStreak(["2026-6-1"])).toBe(1);
    // 3-day run, a gap, then a 2-day run — order of input doesn't matter
    expect(bestDailyStreak(["2026-6-9", "2026-6-1", "2026-6-3", "2026-6-2", "2026-6-10"])).toBe(3);
  });

  it("best streak crosses month and year boundaries", () => {
    expect(bestDailyStreak(["2026-1-30", "2026-1-31", "2026-2-1", "2026-2-2"])).toBe(4);
    expect(bestDailyStreak(["2028-2-28", "2028-2-29", "2028-3-1"])).toBe(3); // leap day
    expect(bestDailyStreak(["2025-12-31", "2026-1-1"])).toBe(2);
  });

  it("best streak ignores duplicates, malformed and impossible dates", () => {
    expect(bestDailyStreak(["2026-6-1", "2026-6-1", "2026-6-2"])).toBe(2);
    expect(bestDailyStreak(["2026-2-30", "2026-3-1", "nope", "2026-13-1", 7 as unknown as string])).toBe(1);
    expect(bestDailyStreak(["2026-06-01", "2026-6-2"])).toBe(2); // zero-padded still parses
  });

  it("best streak is never below the current streak", () => {
    const s = computeStats([], ["2026-10-5", "2026-10-4", "2026-9-1"], NOW);
    expect(s.currentStreak).toBe(2);
    expect(s.bestStreak).toBe(2);
  });

  it("is timezone-independent (pure UTC day math)", () => {
    const justAfterMidnight = Date.UTC(2026, 9, 6, 0, 0, 1);
    expect(computeStats([], ["2026-10-5", "2026-10-4"], justAfterMidnight).currentStreak).toBe(2);
    const justBefore = Date.UTC(2026, 9, 5, 23, 59, 59);
    expect(computeStats([], ["2026-10-5"], justBefore).currentStreak).toBe(1);
  });
});

describe("withAccountStreak", () => {
  it("lifts current + best to the account's server streak when it is higher", () => {
    const s = withAccountStreak(computeStats([], ["2026-10-5"], NOW), 4);
    expect(s.currentStreak).toBe(4);
    expect(s.bestStreak).toBe(4);
  });

  it("never lowers the local numbers and ignores junk", () => {
    const base = computeStats([], ["2026-10-5", "2026-10-4", "2026-10-3"], NOW);
    expect(withAccountStreak(base, 1)).toMatchObject({ currentStreak: 3, bestStreak: 3 });
    expect(withAccountStreak(base, NaN as number)).toMatchObject({ currentStreak: 3, bestStreak: 3 });
  });
});

describe("mergeResults", () => {
  it("unions by mode:encoded (local wins), newest-first", () => {
    const local = [e({ mode: "classic", wins: 50, encoded: "x", ts: 3 }), e({ mode: "daily", wins: 60, encoded: "y", ts: 1 })];
    const remote = [
      e({ mode: "classic", wins: 99, encoded: "x", ts: 9 }), // same game — local copy kept
      e({ mode: "prime", wins: 40, encoded: "x", ts: 2 }), // same five, different mode → distinct
    ];
    const m = mergeResults(local, remote);
    expect(m.map((r) => `${r.mode}:${r.encoded}`)).toEqual(["classic:x", "prime:x", "daily:y"]);
    expect(m[0].wins).toBe(50);
  });
});

describe("resultHref", () => {
  it("links like ResultsHistory: /r/ by default, /sg/ for surgeon, the owner dashboard for a created challenge", () => {
    expect(resultHref(e({ mode: "classic", wins: 1, encoded: "abc" }))).toBe("/r/abc");
    expect(resultHref(e({ mode: "surgeon", wins: 1, encoded: "card1" }))).toBe("/sg/card1");
    expect(resultHref(e({ mode: "challenge", wins: 1, encoded: "five", challengeId: "abc123" }))).toBe("/play?own=abc123");
    expect(resultHref(e({ mode: "challenge", wins: 1, encoded: "five" }))).toBe("/r/five"); // responder entry
  });
});
