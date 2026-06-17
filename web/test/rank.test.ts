import { describe, it, expect } from "vitest";
import { compareSzn } from "@/lib/prime";

const P = (fame: number | undefined, peak_score: number | undefined) => ({ fame, peak_score });

// "Top" = the most recognizable AND most relevant card for a team-era. fame (career accolades)
// anchors the order, but peak_score (the variant's VORP for this stint, weighted 2x) is folded in
// so a famous player's brief, low-impact cameo can't outrank that era's actual standout. The fame
// numbers below are the real ones that motivated the design (see prime.ts:compareSzn).
describe("compareSzn — recognizable-and-relevant board ranking", () => {
  const sorted = (arr: ReturnType<typeof P>[]) => [...arr].sort(compareSzn);

  it("fame leads when peak_score is comparable", () => {
    expect(sorted([P(10, 4), P(20, 4), P(5, 4)]).map((x) => x.fame)).toEqual([20, 10, 5]);
  });

  it("a famous low-impact cameo ranks below the era's high-peak cornerstone (CP3 vs Curry on GSW)", () => {
    // Chris Paul: fame 36.4, peak 1.2 (one late-career GSW season). Curry: fame 33.0, peak 5.8.
    expect(compareSzn(P(33.0, 5.8), P(36.4, 1.2))).toBeLessThan(0); // Curry sorts first
  });

  it("peak overrides even a large fame gap for a true cameo (Shaq vs Malone, 2000s Lakers)", () => {
    // Shaq: fame 46.1, peak 9.0. Karl Malone: fame 51.6, peak 1.7 (one injury-shortened season).
    expect(compareSzn(P(46.1, 9.0), P(51.6, 1.7))).toBeLessThan(0); // Shaq sorts first
  });

  it("a comparably-fit, more-famous star still leads (2-MVP Nash stays above a higher-peak Gasol)", () => {
    // Nash on the 2010s Lakers: fame 23.3, peak 1.0. Gasol: fame 8.9, peak 5.2.
    // 23.3 + 2*1.0 = 25.3 vs 8.9 + 2*5.2 = 19.3 → Nash first (fame gap too large for peak to flip).
    expect(compareSzn(P(23.3, 1.0), P(8.9, 5.2))).toBeLessThan(0);
  });

  it("breaks exact ties by fame (more recognizable first)", () => {
    // 10+2*5 == 16+2*2 == 20+2*0 == 20 → higher fame wins the tie
    expect(sorted([P(10, 5), P(16, 2), P(20, 0)]).map((x) => x.fame)).toEqual([20, 16, 10]);
  });

  it("orders the un-accoladed tail by peak_score (all fame 0)", () => {
    expect(sorted([P(0, 1), P(0, 9), P(0, 4)]).map((x) => x.peak_score)).toEqual([9, 4, 1]);
  });

  it("treats missing fame/peak_score as 0 (a no-signal card sinks last; a high-peak unknown rises)", () => {
    const arr = sorted([P(undefined, undefined), P(0.1, 0), P(undefined, 3)]);
    // deliberate philosophy shift from pure fame-first: relevance counts, so the high-peak unknown
    // outranks a barely-famous low-impact card, and the no-signal card sinks to the bottom.
    expect(arr[0].peak_score).toBe(3);
    expect(arr[arr.length - 1].fame).toBeUndefined();
    expect(arr[arr.length - 1].peak_score).toBeUndefined();
  });
});
