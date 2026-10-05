import { describe, it, expect, vi } from "vitest";
import { spinPool, spin, getDraftablePool } from "@/lib/data";
import { quickScore } from "@/lib/engine";

// passthrough spy: lets the fit test see every lineup computeFits scores
vi.mock("@/lib/engine", async (orig) => {
  const actual = await orig<typeof import("@/lib/engine")>();
  return { ...actual, quickScore: vi.fn(actual.quickScore) };
});

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
    // structural guards (not coupled to specific players, which shift with data/compareSzn updates):
    // a real franchise+decade, a non-empty pool, and no duplicate cards.
    expect(a.team).toBeTruthy();
    expect(a.decade).toMatch(/^\d{4}s$/);
    expect(a.ids.length).toBeGreaterThan(0);
    expect(new Set(a.ids).size).toBe(a.ids.length);
  });

  it("is stable across all five draft rounds (each round re-derives purely from seed+round)", () => {
    const seed = "daily-2026-6-15";
    for (let round = 0; round < 5; round++) {
      expect(spinPool(seed, round)).toEqual(spinPool(seed, round));
    }
  });
});

describe("getDraftablePool — memoized (pure; data is immutable per process)", () => {
  it("returns the same array instance on repeat calls, per prime flag", () => {
    expect(getDraftablePool(false)).toBe(getDraftablePool(false));
    expect(getDraftablePool(true)).toBe(getDraftablePool(true));
    expect(getDraftablePool(true)).not.toBe(getDraftablePool(false));
    expect(getDraftablePool(false).length).toBe(250);
  });
});

describe("spin fit grades — never score a >5-man lineup", () => {
  it("a crafted 8-id exclude list can't push computeFits past five players", () => {
    const ids = [0, 1, 2, 3, 4].flatMap((r) => spinPool("daily-2026-6-15", r).ids.slice(0, 2)).slice(0, 8);
    expect(ids).toHaveLength(8);
    vi.mocked(quickScore).mockClear();
    const res = spin("classic-fitcap", 0, { exclude: ids }, true);
    expect(res.candidates.some((c) => c.fit)).toBe(true);
    const sizes = vi.mocked(quickScore).mock.calls.map(([lineup]) => lineup.length);
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(5);
  });
});
