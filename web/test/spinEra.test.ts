import { describe, it, expect } from "vitest";
import { spin } from "@/lib/data";

// Every (non-Prime) spin should carry a descriptive era snapshot so the draft board can frame the
// candidates' raw stats in their league context — without leaking any engine/fit signal.
describe("spin() attaches era context", () => {
  it("includes an era snapshot matching the spun decade", () => {
    const r = spin("classic", 0);
    expect(r.era).toBeDefined();
    expect(r.era!.decade).toBe(r.decade);
    expect(r.era!.label).toContain(r.decade);
    expect(["pre", "early", "modern", "three_ball"]).toContain(r.era!.era3pt.key);
  });
});
