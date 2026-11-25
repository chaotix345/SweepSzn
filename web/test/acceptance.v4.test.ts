import { describe, it, expect } from "vitest";
import { quickScore } from "../lib/engine";
import { mulberry32 } from "../lib/rng";
import type { Player } from "../lib/types";
import { PLAYERS, COEFF } from "./engineData";

// Pre-v4 baseline (2026-11-25): SD of wins over randomLineups(2000, 7) on the v3 engine.
const SPREAD_BASELINE = 10.9;

export function randomLineups(n = 2000, seed = 7): Player[][] {
  const rnd = mulberry32(seed);
  const pool = PLAYERS.filter((p) => p.eligible && p.eligible.length);
  const out: Player[][] = [];
  while (out.length < n) {
    const used = new Set<string>();
    const five: Player[] = [];
    while (five.length < 5) {
      const p = pool[Math.floor(rnd() * pool.length)];
      const person = p.person_id ?? p.id;
      if (used.has(person)) continue;
      used.add(person); five.push(p);
    }
    out.push(five);
  }
  return out;
}

export function spreadSD(): number {
  const w = randomLineups().map((l) => quickScore(l, COEFF).wins);
  const m = w.reduce((a, b) => a + b, 0) / w.length;
  return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length);
}

describe("v4 acceptance: spread", () => {
  it("random-lineup wins spread is not flattened", () => {
    const sd = spreadSD();
    console.log(`spreadSD=${sd.toFixed(3)}`);
    if (!Number.isNaN(SPREAD_BASELINE)) expect(sd).toBeGreaterThanOrEqual(SPREAD_BASELINE);
  });
});
