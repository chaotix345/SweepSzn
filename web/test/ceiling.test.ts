import { describe, it, expect } from "vitest";
import { bestFive, leanWinPct, slotAssign } from "@/lib/ceiling";
import { playerFeatures, quickScore } from "@/lib/engine";
import { mulberry32 } from "@/lib/rng";
import { eligibleOf } from "@/lib/teams";
import type { Player, Slot } from "@/lib/types";
import { PLAYERS, COEFF, randomLineups } from "./engineData";

const SL: Slot[] = ["PG", "SG", "SF", "PF", "C"];
const maskOf = (p: Player) => eligibleOf(p).reduce((m, s) => m | (1 << SL.indexOf(s)), 0);

// Reference answer: every one-per-bucket combination, scored by the REAL engine.
function bruteForce(buckets: Player[][]): { wp: number; ids: string[] } | null {
  let best: { wp: number; ids: string[] } | null = null;
  const rec = (i: number, sel: Player[]) => {
    if (i === 5) {
      if (new Set(sel.map((p) => p.person_id ?? p.id)).size !== 5) return;
      if (!slotAssign(sel.map(maskOf))) return;
      const wp = quickScore(sel, COEFF).winPct;
      if (!best || wp > best.wp) best = { wp, ids: sel.map((p) => p.id).sort() };
      return;
    }
    for (const p of buckets[i]) rec(i + 1, [...sel, p]);
  };
  rec(0, []);
  return best;
}

const feats = (five: Player[]) => five.map((p) => {
  const f = playerFeatures(p, COEFF);
  return { o: COEFF.offScale * f.off, d: COEFF.defScale * f.def, usage: f.usage, shoot: f.shoot, size: f.sizeCover, perim: f.perimCover, modern: f.modern, ht: f.ht };
});

describe("leanWinPct mirrors the engine", () => {
  it("matches quickScore's win% on 2,000 random real lineups", () => {
    for (const five of randomLineups(2000, 11)) {
      expect(leanWinPct(feats(five), COEFF)).toBeCloseTo(quickScore(five, COEFF).winPct, 12);
    }
  });
});

describe("bestFive is exact (vs brute force)", () => {
  // Synthetic pools: small random buckets of real cards, with deliberate same-person collisions across
  // buckets and narrow eligibility, so person dedupe and slot legality both bite.
  it("agrees with brute force on 150 random small pools", () => {
    const rnd = mulberry32(2026);
    const pick = () => PLAYERS[Math.floor(rnd() * PLAYERS.length)];
    let checked = 0;
    for (let t = 0; t < 150; t++) {
      const buckets: Player[][] = Array.from({ length: 5 }, () => Array.from({ length: 2 + Math.floor(rnd() * 5) }, pick));
      // reuse a card from bucket 0 in bucket 3 (same person) half the time
      if (rnd() < 0.5) buckets[3].push(buckets[0][0]);
      const ref = bruteForce(buckets);
      const got = bestFive(buckets, COEFF);
      if (!ref) { expect(got).toBeNull(); continue; }
      const r = ref as { wp: number; ids: string[] };
      expect(got).not.toBeNull();
      expect(got!.winPct).toBeCloseTo(r.wp, 12);
      expect(got!.picks.map((x) => x.player.id).sort()).toEqual(r.ids);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("returns a legal five: one card per bucket, distinct people, each in an eligible slot", () => {
    const rnd = mulberry32(7);
    const buckets = Array.from({ length: 5 }, () => Array.from({ length: 12 }, () => PLAYERS[Math.floor(rnd() * PLAYERS.length)]));
    const got = bestFive(buckets, COEFF)!;
    expect(got.picks.map((x) => x.slot)).toEqual(SL);
    for (const { player, slot } of got.picks) expect(eligibleOf(player)).toContain(slot);
    expect(new Set(got.picks.map((x) => x.player.person_id ?? x.player.id)).size).toBe(5);
    for (const b of buckets) expect(got.picks.filter((x) => b.includes(x.player)).length).toBeGreaterThan(0);
  });

  it("returns null when no slot-legal five exists", () => {
    const cOnly = PLAYERS.filter((p) => eligibleOf(p).length === 1 && eligibleOf(p)[0] === "C").slice(0, 10);
    const buckets = [0, 1, 2, 3, 4].map((i) => cOnly.slice(i * 2, i * 2 + 2));
    expect(bestFive(buckets, COEFF)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(bestFive([[PLAYERS[0]]], COEFF)).toBeNull();
    expect(bestFive([[PLAYERS[0]], [], [PLAYERS[1]], [PLAYERS[2]], [PLAYERS[3]]], COEFF)).toBeNull();
  });
});
