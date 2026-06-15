import { describe, it, expect } from "vitest";
import { projectRoster, projectionAllowed } from "@/lib/projection";
import { quickScore, WIN_GRADES } from "@/lib/engine";
import type { Player, Slot } from "@/lib/types";

function mk(id: string, pos: Player["pos"], obpm: number, dbpm: number, extra: Partial<Player> = {}): Player {
  return {
    id, name: id, year: 2015, decade: "2010s", tier: "complete", team: "FA",
    pos, eligible: [pos as Slot], obpm, dbpm, usg: 18, ...extra,
  };
}

// A strong, balanced pool the ceiling can complete a roster from.
const POOL: Player[] = [
  mk("star_pg", "PG", 6, 2, { peak_score: 9, z: { stl: 1.4 } }),
  mk("star_sg", "SG", 6, 2, { peak_score: 9, year: 2015, fg3a: 6, fg3: 2.4, z: { stl: 1.4 } }),
  mk("star_sf", "SF", 6, 2, { peak_score: 9, year: 2015, fg3a: 6, fg3: 2.4, z: { stl: 1.4 } }),
  mk("star_pf", "PF", 5, 3, { peak_score: 9, z: { trb: 2.2 } }),
  mk("star_c", "C", 5, 4, { peak_score: 9, z: { trb: 2.6, blk: 2.6 } }),
  mk("scrub", "PG", -3, -2, { peak_score: 1 }),
];

describe("projectionAllowed", () => {
  it("allows the fit-assist seeds (classic, blueprint, prime free-play)", () => {
    expect(projectionAllowed("classic-123")).toBe(true);
    expect(projectionAllowed("bp-2026-06-15")).toBe(true);
    expect(projectionAllowed("prime-999")).toBe(true);
  });

  it("blocks competitive / blind seeds (daily, factor hunt, surgeon, hoopiq, challenge, prime-daily)", () => {
    for (const s of ["daily-2026-06-15", "fh-2026-06-15", "surgeon-2026-06-15", "hoopiq-7", "h2h-abc123", "prime-daily-2026-06-15"]) {
      expect(projectionAllowed(s)).toBe(false);
    }
  });
});

describe("projectRoster", () => {
  it("with a full five, floor and ceiling both equal the real evaluated wins", () => {
    const drafted = [POOL[0], POOL[1], POOL[2], POOL[3], POOL[4]];
    const real = quickScore(drafted).wins;
    const p = projectRoster(drafted, POOL, []);
    expect(p.n).toBe(5);
    expect(p.floor.wins).toBe(real);
    expect(p.ceiling.wins).toBe(real);
  });

  it("floor never exceeds ceiling for a partial roster", () => {
    const p = projectRoster([mk("d1", "PG", 2, 1)], POOL, ["SG", "SF", "PF", "C"]);
    expect(p.floor.wins).toBeLessThanOrEqual(p.ceiling.wins);
  });

  it("a stronger first pick yields a higher floor", () => {
    const strong = projectRoster([mk("s", "SF", 6, 3)], POOL, ["PG", "SG", "PF", "C"]);
    const weak = projectRoster([mk("w", "SF", -3, -2)], POOL, ["PG", "SG", "PF", "C"]);
    expect(strong.floor.wins).toBeGreaterThan(weak.floor.wins);
  });

  it("a weak pick lowers the ceiling versus a strong pick (your bad pick caps you)", () => {
    const strong = projectRoster([mk("s", "SF", 6, 3)], POOL, ["PG", "SG", "PF", "C"]);
    const weak = projectRoster([mk("w", "SF", -3, -2)], POOL, ["PG", "SG", "PF", "C"]);
    expect(weak.ceiling.wins).toBeLessThan(strong.ceiling.wins);
  });

  it("reports grade + losses consistent with WIN_GRADES boundaries", () => {
    const p = projectRoster([POOL[0], POOL[1], POOL[2], POOL[3], POOL[4]], POOL, []);
    const expected = (WIN_GRADES.find((g) => p.floor.wins >= g.min) ?? WIN_GRADES[WIN_GRADES.length - 1]).grade;
    expect(p.floor.grade).toBe(expected);
    expect(p.floor.losses).toBe(82 - p.floor.wins);
    expect(p.ceiling.losses).toBe(82 - p.ceiling.wins);
  });

  it("wins stay within the 0..82 range", () => {
    const p = projectRoster([mk("d1", "C", 8, 5, { z: { trb: 3, blk: 3 } })], POOL, ["PG", "SG", "SF", "PF"]);
    for (const w of [p.floor.wins, p.ceiling.wins]) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(82);
    }
  });
});
