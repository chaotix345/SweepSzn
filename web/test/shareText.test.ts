import { describe, it, expect } from "vitest";
import { claimText, dailyShareText, slotCells, dailyLabel, SLOT_CELL_TOP, SLOT_CELL_LOW } from "@/lib/shareText";
import { DEFAULT_COEFFICIENTS } from "@/lib/engine";
import type { PlayerBreakdown } from "@/lib/types";

const c = DEFAULT_COEFFICIENTS;
// a breakdown whose per-slot value (offScale*off + defScale*def, the weakestSlot metric) is exactly v
const pb = (v: number): PlayerBreakdown => ({ id: `p${v}`, name: `P${v}`, off: v / c.offScale, def: 0, usage: 20, shooter: false, rimProtector: false });

describe("claimText — the share reads as a claim (W6)", () => {
  it("a challenge share states the record and the percentile, names nobody, and dares the reader", () => {
    const t = claimText({ wins: 58, losses: 24, challenge: true });
    expect(t).toMatch(/^Engine says 58-24\. Beats \d+% of real NBA teams since 1985\. Wrong\? /);
    expect(t).toContain("Same spins, your draft. Beat this five →");
  });

  it("a /r/ share names the five (the link shows them anyway)", () => {
    const t = claimText({ wins: 58, losses: 24, names: ["Jordan", "Magic"] });
    expect(t).toMatch(/^Engine says Jordan · Magic go 58-24\. /);
    expect(t).toMatch(/Wrong\? Beat this five →$/);
    expect(t).not.toContain("Same spins");
  });

  it("names never ride a challenge share, even when passed", () => {
    expect(claimText({ wins: 58, losses: 24, names: ["Jordan"], challenge: true })).not.toContain("Jordan");
  });

  it("labels Prime and hinted fives", () => {
    expect(claimText({ wins: 70, losses: 12, prime: true, challenge: true })).toMatch(/^Engine says my PRIME five goes 70-12\./);
    expect(claimText({ wins: 50, losses: 32, usedHints: true, challenge: true })).toMatch(/^Engine says 50-32 \(drafted with hints\)\./);
  });

  it("says 'every real team' at the extremes instead of a percentage", () => {
    expect(claimText({ wins: 82, losses: 0, challenge: true })).toContain("Better than every real team since 1985.");
    expect(claimText({ wins: 0, losses: 82, challenge: true })).toContain("Worse than every real team since 1985.");
  });
});

describe("slotCells — the Daily's Wordle-style row", () => {
  it("grades each slot by its value against the draftable pool's quartiles", () => {
    expect(slotCells([pb(SLOT_CELL_TOP), pb(SLOT_CELL_TOP - 0.01), pb(SLOT_CELL_LOW), pb(SLOT_CELL_LOW - 0.01), pb(7)])).toBe("🟩🟨🟨🟥🟩");
  });

  it("counts defense too", () => {
    const d: PlayerBreakdown = { ...pb(0), def: SLOT_CELL_TOP / c.defScale };
    expect(slotCells([d])).toBe("🟩");
  });
});

describe("dailyShareText — spoiler-free while the Daily is live", () => {
  const players = [pb(5), pb(3), pb(3), pb(2), pb(4.5)];
  const names = ["Jordan", "Magic", "Bird", "Duncan", "Shaq"];

  it("carries the date, record, grade, grid and percentile — and no player names while live", () => {
    const t = dailyShareText({ date: "2026-11-26", wins: 58, losses: 24, grade: "B+", players, names, live: true });
    const lines = t.split("\n");
    expect(lines[0]).toBe("SweepSzn Daily · Nov 26");
    expect(lines[1]).toBe("58-24 · B+");
    expect(lines[2]).toBe("🟩🟨🟨🟥🟩");
    expect(lines[3]).toMatch(/^Beats \d+% of real NBA teams since 1985\.$/);
    for (const n of names) expect(t).not.toContain(n);
  });

  it("names the five once that Daily has rolled over", () => {
    const t = dailyShareText({ date: "2026-11-25", wins: 58, losses: 24, grade: "B+", players, names, live: false });
    expect(t).toContain("Jordan · Magic · Bird · Duncan · Shaq");
  });

  it("formats non-padded seed dates", () => {
    expect(dailyLabel("2026-6-9")).toBe("Jun 9");
    expect(dailyLabel("junk")).toBe("junk");
  });
});
