import { describe, it, expect } from "vitest";
import { spin } from "@/lib/data";

// The draft board needs per-candidate z-scores client-side to draw the era bars (dossier) and the
// compare radar. They are descriptive league-relative standings, not engine/fit signal (DESIGN.md §12).
describe("spin() candidates carry a z-score subset", () => {
  it("attaches z.{pts,trb,ast,stl,blk,ts} for modern-era candidates", () => {
    const r = spin("classic-z-probe", 0);
    const withZ = r.candidates.find((c) => c.z && typeof c.z.pts === "number");
    expect(withZ).toBeDefined();
    // the radar axes must all be present (numbers or nulls — pre-1974 has null stl/blk)
    for (const k of ["pts", "trb", "ast", "stl", "blk", "ts"] as const) {
      expect(withZ!.z).toHaveProperty(k);
    }
  });
});
