// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { saveArchiveRun, listArchiveRuns, playedDays, bestWins } from "@/lib/archiveHistory";
import { saveResult, listResults } from "@/lib/resultHistory";
import { recordDailyDone, getHistory } from "@/lib/streak";

beforeEach(() => localStorage.clear());

const run = (wins: number) => ({ wins, losses: 82 - wins, grade: "B", encoded: `e${wins}` });

describe("archive history (W3, unranked)", () => {
  it("keeps the best replay per day", () => {
    saveArchiveRun("2026-11-19", run(50));
    saveArchiveRun("2026-11-19", run(44));
    expect(listArchiveRuns()["2026-11-19"].wins).toBe(50);
    saveArchiveRun("2026-11-19", run(61));
    expect(listArchiveRuns()["2026-11-19"].wins).toBe(61);
  });

  it("never touches the ranked result history or the streak history", () => {
    saveArchiveRun("2026-11-19", run(60));
    expect(listResults()).toEqual([]);
    expect(getHistory()).toEqual([]);
  });

  it("merges ranked Dailies (results + verified dates) with replays per day", () => {
    recordDailyDone("2026-11-18");
    saveResult({ encoded: "x", mode: "daily", wins: 55, losses: 27, grade: "B" });
    saveResult({ encoded: "y", mode: "classic", wins: 70, losses: 12, grade: "A" });
    saveArchiveRun("2026-11-17", run(48));
    const today = (() => { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; })();
    const days = playedDays();
    expect(days["2026-11-18"]).toEqual({ daily: {} });
    expect(days[today].daily?.wins).toBe(55);
    expect(days["2026-11-17"].replay?.wins).toBe(48);
    expect(Object.keys(days)).toHaveLength(3); // the Classic game is not a Daily
    expect(bestWins(days[today])).toBe(55);
    expect(bestWins(days["2026-11-18"])).toBeUndefined();
  });

  it("degrades to empty on corrupt storage", () => {
    localStorage.setItem("82-0:archive", "[1,2]");
    expect(listArchiveRuns()).toEqual({});
    localStorage.setItem("82-0:archive", "{bad");
    expect(playedDays()).toEqual({});
  });
});
