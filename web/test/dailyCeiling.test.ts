import { describe, it, expect } from "vitest";
import { spinPool, getPlayersByIds, getCoefficients } from "@/lib/data";
import { computeDailyCeiling } from "@/lib/dailyCeiling";
import { leanWinPct, slotAssign } from "@/lib/ceiling";
import { evaluateLineup, playerFeatures } from "@/lib/engine";
import { eligibleOf, SLOTS } from "@/lib/teams";
import { LEGACY_AS_OF, SEASON_2026_SINCE } from "@/lib/poolDate";
import type { Player } from "@/lib/types";

// The Daily ceiling on real seeds and the committed players.json (W2).

const dates = (month: number, days: number) => Array.from({ length: days }, (_, i) => `2026-${month}-${i + 1}`);
const buckets = (date: string) => [0, 1, 2, 3, 4].map((r) => getPlayersByIds(spinPool(`daily-${date}`, r).ids));

describe("base spins are pick-independent", () => {
  it("drafting from earlier spins never changes a later spin's team/decade", () => {
    for (const date of [...dates(8, 31), ...dates(11, 30), ...dates(12, 31)]) {
      const base = [0, 1, 2, 3, 4].map((r) => spinPool(`daily-${date}`, r));
      for (let r = 1; r < 5; r++) {
        // the strongest-looking picks of every earlier spin (any choice must leave the bucket usable)
        const exclude = base.slice(0, r).map((b) => b.ids[0]);
        const s = spinPool(`daily-${date}`, r, { exclude });
        expect([s.team, s.decade]).toEqual([base[r].team, base[r].decade]);
      }
      for (const b of base) expect(b.ids.length).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("computeDailyCeiling", () => {
  it("is exact on a real seed (exhaustive check over all 1.48M one-per-spin fives)", () => {
    const date = "2026-8-21";
    const c = getCoefficients();
    const fb = buckets(date).map((b) => b.map((p) => {
      const f = playerFeatures(p, c);
      return {
        p, person: p.person_id ?? p.id, mask: eligibleOf(p).reduce((m, s) => m | (1 << SLOTS.indexOf(s)), 0),
        o: c.offScale * f.off, d: c.defScale * f.def, usage: f.usage, shoot: f.shoot, size: f.sizeCover, perim: f.perimCover, modern: f.modern, ht: f.ht,
      };
    }));
    expect(fb.map((b) => b.length).reduce((a, n) => a * n, 1)).toBe(1_482_624);
    let best = -1, bestIds: string[] = [];
    for (const a of fb[0]) for (const b of fb[1]) for (const d of fb[2]) for (const e of fb[3]) for (const g of fb[4]) {
      const sel = [a, b, d, e, g];
      const wp = leanWinPct(sel, c);
      if (wp <= best) continue;
      if (new Set(sel.map((x) => x.person)).size !== 5 || !slotAssign(sel.map((x) => x.mask))) continue;
      best = wp; bestIds = sel.map((x) => x.p.id).sort();
    }
    const rec = computeDailyCeiling(date)!;
    expect(rec.lineup.map((x) => x.id).sort()).toEqual(bestIds);
  }, 60_000);

  it("returns a legal, consistent record: one card per spin, eligible slots, engine-scored", () => {
    for (const date of ["2026-6-9", "2026-11-26", "2026-11-27", "2027-1-1"]) {
      const rec = computeDailyCeiling(date)!;
      const bs = buckets(date);
      expect(rec.lineup.map((x) => x.slot)).toEqual(SLOTS);
      const players = getPlayersByIds(rec.lineup.map((x) => x.id));
      for (const [i, x] of rec.lineup.entries()) expect(eligibleOf(players[i])).toContain(x.slot);
      for (const b of bs) expect(players.filter((p) => b.includes(p))).toHaveLength(1);
      const r = evaluateLineup(players, getCoefficients());
      expect([rec.wins, rec.losses, rec.grade]).toEqual([r.wins, r.losses, r.grade]);
      expect(rec.seg).toBe(rec.lineup.map((x) => x.id).join(","));
    }
  });

  it("uses the seed date's pool (D4): no 2025-26 card before the release, no retired card after it", () => {
    const pre = LEGACY_AS_OF.split("-").map(Number).join("-");
    const post = SEASON_2026_SINCE.split("-").map(Number).join("-");
    const ids = (d: string) => getPlayersByIds(computeDailyCeiling(d)!.lineup.map((x) => x.id));
    expect(ids(pre).some((p: Player) => p.since)).toBe(false);
    expect(ids(post).some((p: Player) => p.until)).toBe(false);
  });

  it("is fast: under 1s cold on every real seed tried", () => {
    for (const date of [...dates(6, 30), ...dates(11, 30)]) {
      const t = performance.now();
      expect(computeDailyCeiling(date)).not.toBeNull();
      expect(performance.now() - t).toBeLessThan(1000);
    }
  });
});
