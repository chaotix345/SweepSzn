import { describe, it, expect } from "vitest";
import { mulberry32, strSeed } from "@/lib/rng";

// The PRNG is the spine of Daily/Factor Hunt/Challenge reproducibility: the server replays every
// submitted trace from its seed, so any silent change to strSeed or mulberry32 would fail-verify
// every legit submission. These pin the exact contract.

describe("strSeed (FNV-1a)", () => {
  it("is deterministic for the same string", () => {
    expect(strSeed("daily-2026-6-15")).toBe(strSeed("daily-2026-6-15"));
  });

  it("returns an unsigned 32-bit integer", () => {
    const h = strSeed("anything");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it("differs for different strings", () => {
    expect(strSeed("a")).not.toBe(strSeed("b"));
  });

  it("pins the canonical hash (a change here breaks replay verification of every old trace)", () => {
    expect(strSeed("sweepszn-rng-test")).toBe(4095044695);
  });
});

describe("mulberry32", () => {
  it("reproduces the exact sequence from the same seed", () => {
    const a = mulberry32(strSeed("sweepszn-rng-test"));
    const b = mulberry32(strSeed("sweepszn-rng-test"));
    expect([a(), a(), a(), a(), a()]).toEqual([b(), b(), b(), b(), b()]);
  });

  it("pins the canonical sequence (bit-exact — a drift here corrupts every submitted trace)", () => {
    const r = mulberry32(strSeed("sweepszn-rng-test"));
    expect([r(), r(), r(), r(), r()]).toEqual([
      0.03813481377437711, 0.9405535876285285, 0.028322960017248988, 0.23188443086110055, 0.9501614705659449,
    ]);
  });

  it("emits values in [0, 1)", () => {
    const r = mulberry32(strSeed("range-check"));
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });
});
