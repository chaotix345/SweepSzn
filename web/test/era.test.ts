import { describe, it, expect } from "vitest";
import { threePtEra, sigmaText, barPct } from "@/lib/era";

// Pure, descriptive helpers for the Era & League Context layer. They turn a year/z-score into
// human-readable era framing — never an engine signal (see DESIGN.md §12 trust model).
describe("threePtEra", () => {
  it("classifies the league's 3-point environment by year boundaries", () => {
    expect(threePtEra(1962).key).toBe("pre");
    expect(threePtEra(1979).key).toBe("pre");
    expect(threePtEra(1980).key).toBe("early");
    expect(threePtEra(1994).key).toBe("early");
    expect(threePtEra(1995).key).toBe("modern");
    expect(threePtEra(2014).key).toBe("modern");
    expect(threePtEra(2015).key).toBe("three_ball");
    expect(threePtEra(2024).key).toBe("three_ball");
  });

  it("gives each era a human label", () => {
    expect(threePtEra(1985).label).toMatch(/3/);
    expect(threePtEra(2020).label.toLowerCase()).toContain("three");
  });
});

describe("sigmaText", () => {
  it("formats a positive z with a + sign and one decimal", () => {
    expect(sigmaText(4.12)).toBe("+4.1σ");
  });
  it("formats a negative z", () => {
    expect(sigmaText(-0.34)).toBe("-0.3σ");
  });
  it("returns empty string for null/undefined/NaN", () => {
    expect(sigmaText(null)).toBe("");
    expect(sigmaText(undefined)).toBe("");
    expect(sigmaText(NaN)).toBe("");
  });
});

describe("barPct", () => {
  it("is 0 at or below the league mean (z <= 0)", () => {
    expect(barPct(0)).toBe(0);
    expect(barPct(-1)).toBe(0);
  });
  it("scales a positive z toward 100, clamped at z = 3.5", () => {
    expect(barPct(3.5)).toBe(100);
    expect(barPct(7)).toBe(100);
    const mid = barPct(1.75);
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(60);
  });
  it("returns 0 for null", () => {
    expect(barPct(null)).toBe(0);
  });
});
