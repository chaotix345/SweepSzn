import { describe, it, expect } from "vitest";
import { evaluateLineup, eraStrength, playerFeatures, DEFAULT_COEFFICIENTS } from "./engine";
import type { Player } from "./types";

function mk(o: Partial<Player>): Player {
  return {
    id: o.name!.toLowerCase().replace(/\W+/g, "_"),
    name: o.name!, year: o.year ?? 2015, decade: "2010s", tier: "complete",
    team: "XXX", pos: o.pos ?? "SF", g: 75, mp: 34,
    ...o,
  } as Player;
}

// Balanced two-way team: spacing, a rim protector, sane usage spread.
const balanced: Player[] = [
  mk({ name: "Floor General", pos: "PG", obpm: 4, dbpm: 1.5, usg: 24, fg3a: 7, fg3: 2.9, year: 2016, z: { stl: 0.9 } }),
  mk({ name: "3&D Guard", pos: "SG", obpm: 2.5, dbpm: 1.2, usg: 18, fg3a: 6, fg3: 2.4, year: 2015, z: { stl: 0.7 } }),
  mk({ name: "Two-Way Wing", pos: "SF", obpm: 5, dbpm: 2.5, usg: 26, fg3a: 5, fg3: 1.9, year: 2014, z: { stl: 0.8 } }),
  mk({ name: "Stretch Four", pos: "PF", obpm: 3, dbpm: 2, usg: 18, fg3a: 5, fg3: 1.9, year: 2019, z: { blk: 0.5 } }),
  mk({ name: "Anchor Center", pos: "C", obpm: 4, dbpm: 3.5, usg: 22, fg3a: 0, fg3: 0, year: 2016, z: { blk: 1.6, drb: 1.4 } }),
];

// Stat-stuffer: five ball-dominant scorers, weak defense, no spacing, no rim.
const stuffer: Player[] = [
  mk({ name: "Volume A", pos: "PG", obpm: 6, dbpm: -1, usg: 33, fg3a: 0, fg3: 0, z: { stl: 0.2 } }),
  mk({ name: "Volume B", pos: "SG", obpm: 6, dbpm: -1, usg: 32, fg3a: 0, fg3: 0, z: { stl: 0.1 } }),
  mk({ name: "Volume C", pos: "SF", obpm: 5.5, dbpm: -0.5, usg: 31, fg3a: 0, fg3: 0, z: { stl: 0.2 } }),
  mk({ name: "Volume D", pos: "PG", obpm: 5.5, dbpm: -1, usg: 32, fg3a: 0, fg3: 0, z: { stl: 0.1 } }),
  mk({ name: "Volume E", pos: "SG", obpm: 5, dbpm: -1, usg: 30, fg3a: 0, fg3: 0, z: { stl: 0.2 } }),
];

const b = evaluateLineup(balanced);
const s = evaluateLineup(stuffer);

describe("evaluateLineup", () => {
  it("balanced two-way team beats stat-stuffer", () => {
    expect(b.wins > s.wins).toBe(true);
  });

  it("stat-stuffer is far worse on net rating", () => {
    expect(s.netRtg < b.netRtg - 8).toBe(true);
  });

  it("defense-less stuffer is not a juggernaut", () => {
    expect(s.wins < 55).toBe(true);
  });

  it("win totals in range", () => {
    expect(b.wins <= 82 && s.wins >= 0).toBe(true);
  });
});

// Shaped like a real team's top five: total usage ~105 (the real-league median is 107.5).
// Fantasy-regime penalties must be ~0 on real-shaped teams (DESIGN.md §11).
const realShaped: Player[] = [
  mk({ name: "Real PG", pos: "PG", obpm: 3, dbpm: 1, usg: 23, fg3a: 5, fg3: 1.9, z: { stl: 0.9 } }),
  mk({ name: "Real SG", pos: "SG", obpm: 2, dbpm: 0.5, usg: 21, fg3a: 5, fg3: 1.8, z: { stl: 0.3 } }),
  mk({ name: "Real SF", pos: "SF", obpm: 2.5, dbpm: 1, usg: 22, fg3a: 4, fg3: 1.5, z: { stl: 0.4 } }),
  mk({ name: "Real PF", pos: "PF", obpm: 1.5, dbpm: 1.5, usg: 19, fg3a: 2, fg3: 0.7, z: { blk: 0.6, trb: 1.0 } }),
  mk({ name: "Real C", pos: "C", obpm: 1, dbpm: 2.5, usg: 20, fg3a: 0, fg3: 0, z: { blk: 1.5, trb: 1.6 } }),
];

describe("usage budget is fantasy-regime only", () => {
  it("does not penalize a typical real-team usage total (~105)", () => {
    const r = evaluateLineup(realShaped);
    expect(r.factors.some((f) => /overload/i.test(f.label))).toBe(false);
  });

  it("still penalizes a five-ball-hog stack", () => {
    expect(s.factors.some((f) => /overload/i.test(f.label) && f.kind === "bad")).toBe(true);
  });
});

// Only the PG's steal z varies; everyone else is a big, so the perimeter term is isolated.
function perimLineup(stlZ: number): Player[] {
  return [
    mk({ name: "Test Guard", pos: "PG", obpm: 3, dbpm: 1, usg: 22, z: { stl: stlZ } }),
    mk({ name: "Big A", pos: "PF", obpm: 2, dbpm: 2, usg: 20, z: { blk: 1.2, trb: 1.5 } }),
    mk({ name: "Big B", pos: "C", obpm: 2, dbpm: 2.5, usg: 20, z: { blk: 1.6, trb: 1.8 } }),
    mk({ name: "Big C", pos: "PF", obpm: 1.5, dbpm: 1.5, usg: 19, z: { blk: 0.8, trb: 1.2 } }),
    mk({ name: "Big D", pos: "C", obpm: 1, dbpm: 2, usg: 19, z: { blk: 1.0, trb: 1.4 } }),
  ];
}

describe("perimeter defense is continuous, not a cliff", () => {
  const good = evaluateLineup(perimLineup(1.0));
  const mid = evaluateLineup(perimLineup(0.4));
  const none = evaluateLineup(perimLineup(0));

  it("no perimeter defender pays the full penalty", () => {
    expect(none.drtg - good.drtg).toBeCloseTo(3, 1);
  });

  it("borderline defender (stl z 0.4) gets partial credit between the extremes", () => {
    const midPen = mid.drtg - good.drtg;
    expect(midPen).toBeGreaterThan(0.5);
    expect(midPen).toBeLessThan(none.drtg - good.drtg - 0.5);
  });

  it("strong perimeter defender pays zero penalty and shows no factor", () => {
    expect(good.factors.some((f) => /perimeter/i.test(f.label))).toBe(false);
  });
});

describe("playerFeatures exposes the continuous scores the engine actually uses", () => {
  it("perimScore is a gradient over stl z for perimeter positions", () => {
    const at = (z: number) => playerFeatures(mk({ name: "G", pos: "SG", obpm: 1, dbpm: 1, usg: 20, z: { stl: z } })).perimScore;
    expect(at(0)).toBe(0);
    expect(at(0.6)).toBeCloseTo(0.5, 5);
    expect(at(1.2)).toBe(1);
  });

  it("perimScore is 0 for bigs regardless of steals", () => {
    expect(playerFeatures(mk({ name: "C", pos: "C", obpm: 1, dbpm: 2, usg: 20, z: { stl: 2 } })).perimScore).toBe(0);
  });

  it("rimScore is continuous and consistent with the rim boolean", () => {
    const f = playerFeatures(mk({ name: "Big", pos: "C", obpm: 1, dbpm: 2, usg: 20, z: { blk: 1.1, trb: 1.6 } }));
    expect(f.rimScore).toBeGreaterThan(0);
    expect(f.rimScore).toBeLessThanOrEqual(1);
    expect(f.rim).toBe(f.rimScore >= 0.5);
  });
});

// Pre-1985 lineup: the eraStrength discount is already embedded in off/def — it must ALSO be
// surfaced as a quantified factor (display-only; ortg/drtg/wins unchanged by construction).
const sixties: Player[] = [
  mk({ name: "Sixties PG", pos: "PG", year: 1965, obpm: 4, dbpm: 1, usg: 22, z: { stl: 0.9 } }),
  mk({ name: "Sixties SG", pos: "SG", year: 1965, obpm: 4, dbpm: 1, usg: 21, z: { stl: 0.4 } }),
  mk({ name: "Sixties SF", pos: "SF", year: 1964, obpm: 5, dbpm: 1.5, usg: 22, z: { stl: 0.2 } }),
  mk({ name: "Sixties PF", pos: "PF", year: 1966, obpm: 3, dbpm: 2, usg: 20, z: { trb: 1.4 } }),
  mk({ name: "Sixties C", pos: "C", year: 1965, obpm: 3, dbpm: 3, usg: 20, z: { blk: 0, trb: 2.0 } }),
];

describe("per-factor win-equivalents (exact counterfactual through the Pythagorean curve)", () => {
  it("usage overload carries a negative winsEst on a ball-hog stack", () => {
    const f = s.factors.find((x) => /overload/i.test(x.label))!;
    expect(f.winsEst).toBeDefined();
    expect(f.winsEst!).toBeLessThan(0);
  });

  it("overload winsEst equals wins minus wins-with-the-penalty-removed", () => {
    const f = s.factors.find((x) => /overload/i.test(x.label))!;
    const k = DEFAULT_COEFFICIENTS.pythK;
    const wins = (o: number, d: number) => {
      const oP = Math.pow(Math.max(1, o), k), dP = Math.pow(Math.max(1, d), k);
      return Math.max(0, Math.min(82, Math.round(82 * (oP / (oP + dP)))));
    };
    // factor value is the (negative) ORtg penalty; removing it raises ORtg by |value|.
    // s.ortg / f.value are round1() outputs while the engine uses unrounded internals, so a
    // boundary case can differ by one integer win — pin to ±1, sign pinned by the test above.
    const without = wins(s.ortg + Math.abs(f.value), s.drtg);
    expect(Math.abs(f.winsEst! - (s.wins - without))).toBeLessThanOrEqual(1);
  });

  it("level terms (Star offense / Star defense) carry no winsEst", () => {
    for (const f of s.factors.filter((x) => /^star/i.test(x.label))) {
      expect(f.winsEst).toBeUndefined();
    }
  });

  it("positive spacing carries a positive winsEst when it moves the needle", () => {
    const f = b.factors.find((x) => /spacing/i.test(x.label));
    if (f && f.value > 0.5) expect(f.winsEst!).toBeGreaterThanOrEqual(0);
  });
});

describe("era adjustment is a quantified factor", () => {
  const r = evaluateLineup(sixties);

  it("appears as a negative factor for a pre-1985 lineup", () => {
    const f = r.factors.find((x) => /era adjustment/i.test(x.label));
    expect(f).toBeDefined();
    expect(f!.value).toBeLessThan(0);
  });

  it("matches the discount embedded by eraStrength (sum over players)", () => {
    const c = DEFAULT_COEFFICIENTS;
    let expected = 0;
    for (let i = 0; i < sixties.length; i++) {
      const sMul = eraStrength(sixties[i].year, c);
      expected += (c.offScale * r.players[i].off + c.defScale * r.players[i].def) * (1 / sMul - 1);
    }
    const f = r.factors.find((x) => /era adjustment/i.test(x.label))!;
    expect(f.value).toBeCloseTo(-expected, 1);
  });

  it("absent for an all-modern lineup", () => {
    expect(b.factors.some((x) => /era adjustment/i.test(x.label))).toBe(false);
  });
});

describe("per-player role scores on the breakdown", () => {
  it("a high-volume shooter carries a positive spacing score", () => {
    expect(b.players[0].shoot!).toBeGreaterThan(0); // Floor General, fg3a 7
  });

  it("the anchor center carries interior presence", () => {
    expect(b.players[4].rimScore!).toBeGreaterThan(0); // Anchor Center, blk z 1.6
  });

  it("at least one perimeter defender carries a perimeter score", () => {
    expect(b.players.some((p) => (p.perimScore ?? 0) > 0)).toBe(true);
  });

  it("a no-shooting guard scores zero on spacing and rim", () => {
    expect(s.players[0].shoot).toBe(0);     // Volume A, fg3a 0
    expect(s.players[0].rimScore).toBe(0);  // PG — not a big
  });

  it("breakdown role scores match playerFeatures (rounded to 2dp)", () => {
    for (let i = 0; i < balanced.length; i++) {
      const f = playerFeatures(balanced[i], DEFAULT_COEFFICIENTS);
      expect(b.players[i].shoot).toBeCloseTo(Math.round(f.shoot * 100) / 100, 5);
      expect(b.players[i].rimScore).toBeCloseTo(Math.round(f.rimScore * 100) / 100, 5);
      expect(b.players[i].perimScore).toBeCloseTo(Math.round(f.perimScore * 100) / 100, 5);
    }
  });
});
