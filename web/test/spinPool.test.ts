import { describe, it, expect } from "vitest";
import { spinPool } from "@/lib/data";

// Daily anti-cheat replays the same spins server-side from the seed, so spinPool MUST be a pure
// function of (seed, round, opts). All route tests mock spinPool; this exercises the real one
// against real players.json to guard against a non-deterministic source (Math.random/Date) creeping
// into selectSpin.
describe("spinPool determinism (the anti-cheat replay depends on it)", () => {
  it("returns identical {team, decade, ids} for the same seed+round across calls", () => {
    const seed = "daily-2026-6-15";
    const a = spinPool(seed, 0);
    const b = spinPool(seed, 0);
    expect(b).toEqual(a);
    expect(a.ids.length).toBeGreaterThan(0);
  });

  it("is stable across all five draft rounds (each round re-derives purely from seed+round)", () => {
    const seed = "daily-2026-6-15";
    for (let round = 0; round < 5; round++) {
      expect(spinPool(seed, round)).toEqual(spinPool(seed, round));
    }
  });
});
