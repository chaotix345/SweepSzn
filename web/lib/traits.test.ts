import { describe, it, expect } from "vitest";
import { playerTraits, TRAIT_META } from "./traits";
import type { Player } from "./types";

function mk(o: Partial<Player>): Player {
  return { id: "x", name: "X", year: 2016, decade: "2010s", tier: "complete", team: "XXX", pos: "SF", ...o } as Player;
}

describe("playerTraits", () => {
  it("flags a high-volume, accurate shooter as an elite shooter, not a plain shooter", () => {
    const t = playerTraits(mk({ pos: "PG", fg3a: 11, fg3: 5 })); // 45%
    expect(t).toContain("sniper");
    expect(t).not.toContain("shooter");
  });

  it("flags a solid (not elite) shooter as a plain shooter", () => {
    const t = playerTraits(mk({ fg3a: 3, fg3: 1.1 })); // 36.7%
    expect(t).toContain("shooter");
    expect(t).not.toContain("sniper");
  });

  it("does not flag a low-accuracy chucker as a shooter", () => {
    expect(playerTraits(mk({ fg3a: 8, fg3: 2.2 }))).not.toContain("sniper"); // 27.5%
  });

  it("flags shot-blocking, rebounding, playmaking, steals, efficiency, and volume", () => {
    expect(playerTraits(mk({ pos: "C", blk: 2.4 }))).toContain("rim");
    expect(playerTraits(mk({ pos: "C", trb: 12 }))).toContain("glass");
    expect(playerTraits(mk({ pos: "PG", ast: 9 }))).toContain("playmaker");
    expect(playerTraits(mk({ pos: "SG", stl: 2.1 }))).toContain("lockdown");
    expect(playerTraits(mk({ pts: 24, ts: 0.64 }))).toContain("efficient");
    expect(playerTraits(mk({ pts: 28 }))).toContain("volume");
    expect(playerTraits(mk({ usg: 31 }))).toContain("volume");
  });

  it("returns traits in priority order and every key has display metadata", () => {
    const t = playerTraits(mk({ pos: "C", trb: 13, blk: 2.5, ast: 7 })); // rim, playmaker, glass
    expect(t).toEqual(["rim", "playmaker", "glass"]);
    for (const k of t) expect(TRAIT_META[k]).toBeTruthy();
  });

  it("degrades gracefully for a pre-1974 player with null steals/blocks/3PA/usage", () => {
    // Wilt-like: huge scoring + rebounding, no tracked stl/blk/3P/usg
    const t = playerTraits(mk({ pos: "C", year: 1963, pts: 44, trb: 24, ast: 3, stl: null, blk: null, fg3a: null, fg3: null, usg: null, ts: 0.55 }));
    expect(t).toContain("glass");
    expect(t).toContain("volume");
    expect(t).not.toContain("rim");      // no blocks tracked
    expect(t).not.toContain("sniper");   // no 3-point era
    expect(() => playerTraits(mk({}))).not.toThrow();
  });
});
