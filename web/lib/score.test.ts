import { describe, expect, it } from "vitest";
import { encScore, decodeWins, computeDelta } from "./score";

describe("encScore / decodeWins", () => {
  it("round-trips wins across the realistic net range", () => {
    for (const wins of [0, 41, 60, 78, 82]) {
      for (const net of [-30.4, -100, 0, 8.3, 23.4, 50, 200]) {
        expect(decodeWins(encScore(wins, net)), `decodeWins(encScore(${wins}, ${net})) === ${wins}`).toBe(wins);
      }
    }
  });

  it("more wins always outscores fewer (despite net)", () => {
    expect(encScore(70, 5)).toBeGreaterThan(encScore(69, 99));
  });

  it("equal wins -> higher net wins", () => {
    expect(encScore(70, 8.4)).toBeGreaterThan(encScore(70, 8.1));
  });
});

describe("computeDelta", () => {
  const s = encScore;

  it("first submit -> credit all wins", () => {
    expect(computeDelta(null, s(50, 5), 50)).toStrictEqual({ changed: true, delta: 50 });
  });

  it("improvement -> credit only the win delta", () => {
    expect(computeDelta(s(50, 5), s(55, 5), 55)).toStrictEqual({ changed: true, delta: 5 });
  });

  it("re-submit same -> no-op", () => {
    expect(computeDelta(s(55, 5), s(55, 5), 55)).toStrictEqual({ changed: false, delta: 0 });
  });

  it("worse score -> no-op", () => {
    expect(computeDelta(s(55, 5), s(52, 9), 52)).toStrictEqual({ changed: false, delta: 0 });
  });

  it("net-only improvement -> daily changes, 0 win delta", () => {
    expect(computeDelta(s(55, 5.0), s(55, 9.0), 55)).toStrictEqual({ changed: true, delta: 0 });
  });

  it("weekly sum across a multi-day walk-through is correct (135)", () => {
    // Day1 70 then 75; day2 (fresh key) 60. weekly/all-time = sum of credited deltas: 70 + 5 + 60.
    let weekly = 0;
    weekly += computeDelta(null, s(70, 4), 70).delta; // day1 first: +70
    weekly += computeDelta(s(70, 4), s(75, 6), 75).delta; // day1 improve: +5
    weekly += computeDelta(s(75, 6), s(72, 9), 72).delta; // day1 worse: +0
    weekly += computeDelta(null, s(60, 2), 60).delta; // day2 fresh key: +60
    expect(weekly).toBe(135);
  });
});
