import { describe, it, expect } from "vitest";
import { STRESS_PANEL } from "../lib/stressPanel";
import { BY_ID } from "./engineData";

describe("stress panel definitions", () => {
  it("every id resolves and no person appears twice in a lineup", () => {
    for (const l of STRESS_PANEL) {
      expect(l.ids).toHaveLength(5);
      const five = l.ids.map((id) => BY_ID.get(id));
      expect(five.every(Boolean), l.key).toBe(true);
      expect(new Set(five.map((p) => p!.person_id ?? p!.id)).size, l.key).toBe(5);
    }
  });

  it("has a holdout half with at least two lineups per gimmick kind", () => {
    const hold = STRESS_PANEL.filter((l) => l.half === "holdout");
    for (const k of ["no-big", "no-creator", "ball-hog"] as const) expect(hold.filter((l) => l.kind === k).length).toBeGreaterThanOrEqual(2);
    expect(hold.some((l) => l.kind === "legends-poor-fit")).toBe(true);
    expect(hold.every((l) => l.range !== null)).toBe(true);
  });
});
