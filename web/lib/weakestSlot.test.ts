import { describe, it, expect } from "vitest";
import { weakestSlot, DEFAULT_COEFFICIENTS as C } from "./engine";
import { SLOTS } from "./teams";
import type { LineupResult, PlayerBreakdown } from "./types";

const pb = (id: string, off: number, def: number): PlayerBreakdown => ({
  id, name: id, off, def, usage: 20, shooter: false, rimProtector: false, shoot: 0, rimScore: 0, perimScore: 0,
});

const result = (players: PlayerBreakdown[]): LineupResult => ({
  ortg: 110, drtg: 105, netRtg: 5, wins: 50, losses: 32, winPct: 0.6, grade: "C", label: "PLAYOFF",
  factors: [], players, notes: [],
});

describe("weakestSlot (R5)", () => {
  it("returns the slot of the lowest two-way-value player (offScale*off + defScale*def)", () => {
    // SLOTS order is PG, SG, SF, PF, C. SF here has the lowest weighted contribution.
    const r = result([
      pb("pg", 5, 2), pb("sg", 4, 3), pb("sf", 1, 0.5), pb("pf", 3, 4), pb("c", 2, 5),
    ]);
    expect(weakestSlot(r, SLOTS, C)).toBe("SF");
  });

  it("weights offense and defense by the engine scales, not raw sum", () => {
    // PG raw sum (6) < C raw sum (6.2) but defScale > offScale, so the def-heavy C is worth MORE;
    // the off-light PG is the weakest by weighted value.
    const r = result([
      pb("pg", 1, 5), pb("sg", 6, 6), pb("sf", 6, 6), pb("pf", 6, 6), pb("c", 6, 6),
    ]);
    // PG weighted = 0.6178*1 + 0.742*5 = 4.328; others = 0.6178*6 + 0.742*6 = 8.16 → PG weakest
    expect(weakestSlot(r, SLOTS, C)).toBe("PG");
  });

  it("returns null when player/slot counts disagree (incomplete data)", () => {
    expect(weakestSlot(result([pb("pg", 5, 2)]), SLOTS, C)).toBeNull();
  });
});
