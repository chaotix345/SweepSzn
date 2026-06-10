import { describe, it, expect } from "vitest";
import type { Player } from "./types";
import { PRIME_MIN_PEOPLE, primeScore, peakVariant, buildPrimePools } from "./prime";
import { encodeLineup, decodeShare } from "./share";

const mk = (over: Partial<Player>): Player => ({
  id: "x", name: "X", year: 2000, decade: "2000s", tier: "complete", team: "LAL", pos: "SF",
  pts: 0, ast: 0, trb: 0, ...over,
} as Player);

// --- primeScore: position-weighted pts+ast+reb ---
describe("primeScore", () => {
  it("guard weights creation (1.5x ast)", () => {
    expect(primeScore(mk({ pos: "PG", pts: 20, ast: 10, trb: 4 }))).toBe(20 + 15 + 3.2);
  });
  it("big weights the glass (1.4x reb)", () => {
    expect(primeScore(mk({ pos: "C", pts: 20, ast: 4, trb: 12 }))).toBe(20 + 3.2 + 16.8);
  });
  it("wing balanced (1.1x both)", () => {
    expect(primeScore(mk({ pos: "SF", pts: 20, ast: 5, trb: 6 }))).toBe(20 + 5.5 + 6.6);
  });
  it("null stats -> 0", () => {
    expect(primeScore(mk({ pos: "PG", pts: null, ast: null, trb: null }))).toBe(0);
  });
  it("same line scores higher at guard when assist-heavy", () => {
    const guardLine = { pts: 18, ast: 9, trb: 3 };
    expect(primeScore(mk({ pos: "PG", ...guardLine }))).toBeGreaterThan(primeScore(mk({ pos: "C", ...guardLine })));
  });
});

// --- peakVariant: weighted max, deterministic tiebreaks ---
describe("peakVariant", () => {
  it("highest offensive contribution wins", () => {
    const young = mk({ id: "kobe_1998", year: 1998, pos: "SG", pts: 15.4, ast: 2.5, trb: 3.1 });
    const peak = mk({ id: "kobe_2006", year: 2006, pos: "SG", pts: 35.4, ast: 4.5, trb: 5.3 });
    expect(peakVariant([young, peak])).toBe(peak);
  });
  it("order-independent", () => {
    const young = mk({ id: "kobe_1998", year: 1998, pos: "SG", pts: 15.4, ast: 2.5, trb: 3.1 });
    const peak = mk({ id: "kobe_2006", year: 2006, pos: "SG", pts: 35.4, ast: 4.5, trb: 5.3 });
    expect(peakVariant([peak, young])).toBe(peak);
  });
  it("score tie -> later year wins", () => {
    const a = mk({ id: "b_late", year: 2010, pos: "SF", pts: 20, ast: 5, trb: 5 });
    const b = mk({ id: "a_early", year: 2005, pos: "SF", pts: 20, ast: 5, trb: 5 });
    expect(peakVariant([a, b])).toBe(a);
  });
  it("score+year tie -> lexicographically smaller id (deterministic)", () => {
    const a = mk({ id: "b_late", year: 2010, pos: "SF", pts: 20, ast: 5, trb: 5 });
    const c = mk({ id: "aa_same", year: 2010, pos: "SF", pts: 20, ast: 5, trb: 5 });
    expect(peakVariant([a, c])).toBe(c);
  });
  it("empty variants -> null", () => {
    expect(peakVariant([])).toBe(null);
  });
});

// --- buildPrimePools: dedupe per person, exclude thin franchises, sort by peak_score ---
const roster = (team: string, n: number, perPerson = 1): Player[] => {
  const out: Player[] = [];
  for (let i = 0; i < n; i++) {
    for (let v = 0; v < perPerson; v++) {
      out.push(mk({
        id: `${team}_p${i}_v${v}`, team, person_id: `person_${team}_${i}`,
        year: 1990 + v * 10, decade: v === 0 ? "1990s" : "2000s",
        pts: 10 + i + v * 5, peak_score: i + v,
      }));
    }
  }
  return out;
};

describe("buildPrimePools", () => {
  it(`franchise under ${PRIME_MIN_PEOPLE} people excluded (OKC=7)`, () => {
    const pools = buildPrimePools([...roster("LAL", 9, 2), ...roster("OKC", 7, 2)]);
    expect(pools.teams.length === 1 && pools.teams[0] === "LAL").toBe(true);
  });
  it("one entry per person_id (18 rows -> 9)", () => {
    const pools = buildPrimePools([...roster("LAL", 9, 2), ...roster("OKC", 7, 2)]);
    const lal = pools.byTeam.get("LAL")!;
    expect(lal.length).toBe(9);
  });
  it("the peak variant survives (v1 has +5 pts)", () => {
    const pools = buildPrimePools([...roster("LAL", 9, 2), ...roster("OKC", 7, 2)]);
    const lal = pools.byTeam.get("LAL")!;
    expect(lal.every((p) => p.decade === "2000s")).toBe(true);
  });
  it("pool sorted by peak_score desc", () => {
    const pools = buildPrimePools([...roster("LAL", 9, 2), ...roster("OKC", 7, 2)]);
    const lal = pools.byTeam.get("LAL")!;
    expect(lal.every((p, i, a) => i === 0 || (a[i - 1].peak_score ?? 0) >= (p.peak_score ?? 0))).toBe(true);
  });
  it("exactly 8 people qualifies", () => {
    const pools = buildPrimePools(roster("BOS", 8, 1));
    expect(pools.teams.includes("BOS")).toBe(true);
  });
  it("missing person_id falls back to id for distinctness", () => {
    const noPerson = [...roster("NYK", 7, 1), mk({ id: "nyk_solo", team: "NYK", pts: 5 })]; // person_id falls back to id
    expect(buildPrimePools(noPerson).teams.includes("NYK")).toBe(true);
  });
  it("no players -> no teams", () => {
    expect(buildPrimePools([]).teams.length).toBe(0);
  });
});

// --- share codec: p~ prefix (the hinted-flag pattern) ---
describe("share codec", () => {
  const IDS = ["a1", "b2", "c3", "d4", "e5"];

  it("prime flag prefixes p~", () => {
    expect(encodeLineup(IDS, false, true)).toBe("p~a1,b2,c3,d4,e5");
  });
  it("prime + hints stack", () => {
    expect(encodeLineup(IDS, true, true)).toBe("p~h~a1,b2,c3,d4,e5");
  });
  it("2-arg call unchanged (back-compat)", () => {
    expect(encodeLineup(IDS, true)).toBe("h~a1,b2,c3,d4,e5");
  });
  it("p~h~ decodes both flags", () => {
    const d = decodeShare("p~h~a1,b2,c3,d4,e5");
    expect(d.prime && d.hinted && d.ids.length === 5).toBe(true);
  });
  it("flag order-independent", () => {
    const d = decodeShare("h~p~a1,b2,c3,d4,e5");
    expect(d.prime && d.hinted).toBe(true);
  });
  it("prime alone", () => {
    const d = decodeShare("p~a1,b2,c3,d4,e5");
    expect(d.prime && !d.hinted).toBe(true);
  });
  it("plain segment unchanged", () => {
    const r = decodeShare("a1,b2,c3,d4,e5");
    expect(!r.prime && !r.hinted && r.ids.length === 5).toBe(true);
  });
  it("double p~ doesn't loop forever (second stays in id, later validation rejects)", () => {
    expect(!decodeShare("p~p~a1,b2").prime || decodeShare("p~p~a1,b2").ids[0] === "p~a1").toBe(true);
  });
});
