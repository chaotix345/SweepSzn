import { describe, it, expect } from "vitest";
import { compareSzn } from "@/lib/prime";

const P = (fame: number | undefined, peak_score: number | undefined) => ({ fame, peak_score });

describe("compareSzn — fame-first board ranking", () => {
  it("orders by fame descending", () => {
    const arr = [P(1, 100), P(5, 0), P(3, 50)];
    arr.sort(compareSzn);
    expect(arr.map((x) => x.fame)).toEqual([5, 3, 1]);
  });

  it("breaks ties by peak_score descending", () => {
    const arr = [P(2, 10), P(2, 99), P(2, 50)];
    arr.sort(compareSzn);
    expect(arr.map((x) => x.peak_score)).toEqual([99, 50, 10]);
  });

  it("treats missing fame/peak_score as 0 (un-accoladed sink below any fame)", () => {
    const arr = [P(undefined, undefined), P(0.1, 0), P(undefined, 5)];
    arr.sort(compareSzn);
    expect(arr[0].fame).toBe(0.1);        // any fame beats none
    expect(arr[2].fame).toBeUndefined();  // zero fame + zero peak is last
  });
});
