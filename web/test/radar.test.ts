import { describe, it, expect } from "vitest";
import { zRadius, axisPoint, polygonPoints } from "@/lib/radar";

// Pure SVG geometry for the z-score radar. Shape is descriptive (how a player compares to his era),
// never an engine signal — a five-axis radar of one player says nothing about lineup fit (DESIGN.md §12).
describe("zRadius", () => {
  it("anchors at the league mean (z <= 0 -> 0) and clamps at z = 3.5", () => {
    expect(zRadius(0)).toBe(0);
    expect(zRadius(-2)).toBe(0);
    expect(zRadius(3.5)).toBe(1);
    expect(zRadius(10)).toBe(1);
    expect(zRadius(1.75)).toBeCloseTo(0.5, 5);
  });
  it("returns 0 for null/undefined/NaN", () => {
    expect(zRadius(null)).toBe(0);
    expect(zRadius(undefined)).toBe(0);
    expect(zRadius(NaN)).toBe(0);
  });
});

describe("axisPoint", () => {
  it("places axis 0 at the top of the circle", () => {
    const [x, y] = axisPoint(0, 5, 1, 200);
    expect(x).toBeCloseTo(100, 5);
    expect(y).toBeCloseTo(0, 5);
  });
  it("places a zero-radius point at the center", () => {
    const [x, y] = axisPoint(2, 5, 0, 200);
    expect(x).toBeCloseTo(100, 5);
    expect(y).toBeCloseTo(100, 5);
  });
  it("goes clockwise (axis 1 of 5 is upper-right)", () => {
    const [x, y] = axisPoint(1, 5, 1, 200);
    expect(x).toBeGreaterThan(100); // right of center
    expect(y).toBeLessThan(100);    // above center
  });
});

describe("polygonPoints", () => {
  it("emits one 'x,y' pair per axis, starting at the top", () => {
    const pts = polygonPoints([1, 1, 1, 1, 1], 200).split(" ");
    expect(pts).toHaveLength(5);
    expect(pts[0]).toBe("100,0");
  });
});
