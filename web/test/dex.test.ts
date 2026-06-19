import { describe, it, expect } from "vitest";
import { computeBadges, BADGES, type DexPlayer } from "@/lib/dex";

// Badges reward EXPLORING the dataset — they read descriptive player fields + the round's grade,
// never an engine/fit signal, and only ever fire post-commit (DESIGN.md §12).
const mk = (o: Partial<DexPlayer>): DexPlayer => ({
  id: o.id ?? "x", personId: o.personId ?? o.id ?? "x", name: "X", team: o.team ?? "BOS",
  decade: o.decade ?? "2010s", pos: "SF", eligible: o.eligible ?? ["SF"],
  pts: o.pts ?? 10, trb: o.trb ?? 5, ast: o.ast ?? 3, stl: o.stl ?? 1, blk: o.blk ?? 0,
  fame: o.fame ?? 5, traits: [],
});

describe("computeBadges", () => {
  it("awards First Fieldsman for any drafted player (and none for an empty dex)", () => {
    expect(computeBadges([mk({})], [])).toContain("first");
    expect(computeBadges([], [])).not.toContain("first");
  });
  it("awards stat-threshold badges from real box-score fields", () => {
    expect(computeBadges([mk({ pts: 31 })], [])).toContain("scorer");
    expect(computeBadges([mk({ trb: 16 })], [])).toContain("glass");
    expect(computeBadges([mk({ blk: 3.2 })], [])).toContain("swat");
    expect(computeBadges([mk({ ast: 12.5 })], [])).toContain("general");
    expect(computeBadges([mk({ pts: 20 })], [])).not.toContain("scorer");
  });
  it("awards Era Tourist at 5 distinct decades and Full Circle at all 7", () => {
    const five = ["1960s", "1970s", "1980s", "1990s", "2000s"].map((d, i) => mk({ id: `p${i}`, decade: d }));
    expect(computeBadges(five, [])).toContain("eraTourist");
    expect(computeBadges(five, [])).not.toContain("fullCircle");
    const seven = ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"].map((d, i) => mk({ id: `p${i}`, decade: d }));
    expect(computeBadges(seven, [])).toContain("fullCircle");
  });
  it("awards Well Traveled at 10 distinct franchises", () => {
    const teams = ["ATL", "BOS", "CHI", "DAL", "DEN", "GSW", "HOU", "LAL", "MIA", "NYK"];
    expect(computeBadges(teams.map((t, i) => mk({ id: `p${i}`, team: t })), [])).toContain("allFranchise");
  });
  it("awards Old School for a 1960s player and Perfection for an S grade", () => {
    expect(computeBadges([mk({ decade: "1960s" })], [])).toContain("sixties");
    expect(computeBadges([mk({})], [{ grade: "S" }])).toContain("sTier");
    expect(computeBadges([mk({})], [{ grade: "A+" }])).not.toContain("sTier");
  });
  it("awards Triple Threat and Unsung Hero from eligibility / no-accolade fields", () => {
    expect(computeBadges([mk({ eligible: ["PG", "SG", "SF"] })], [])).toContain("tripleThreat");
    expect(computeBadges([mk({ fame: 0 })], [])).toContain("underdog");
    expect(computeBadges([mk({ fame: 5 })], [])).not.toContain("underdog");
    expect(computeBadges([{ ...mk({ fame: 0 }), pts: null }], [])).not.toContain("underdog"); // data-absent, not obscure
  });
  it("awards referral badges from the flags, not from collection data (descriptive — §12-safe)", () => {
    expect(computeBadges([mk({})], [], { isReferrer: true })).toContain("recruiter");
    expect(computeBadges([mk({})], [], { isReferee: true })).toContain("invited");
    expect(computeBadges([mk({})], [])).not.toContain("recruiter");
    expect(computeBadges([mk({})], [])).not.toContain("invited");
    expect(computeBadges([mk({})], [], { isReferrer: true })).not.toContain("invited");
  });
});

describe("BADGES catalogue", () => {
  it("defines every key computeBadges can emit, with unique keys", () => {
    const all = computeBadges([
      mk({ id: "a", personId: "a", decade: "1960s", pts: 31, trb: 16, blk: 3.2, ast: 12.5, eligible: ["PG", "SG", "SF"], fame: 0, team: "ATL" }),
      ...["1970s", "1980s", "1990s", "2000s", "2010s", "2020s"].map((d, i) =>
        mk({ id: `p${i}`, personId: `p${i}`, decade: d, team: ["BOS", "CHI", "DAL", "DEN", "GSW", "HOU"][i] })),
    ], [{ grade: "S" }], { isReferrer: true, isReferee: true });
    for (const k of all) expect(BADGES.find((b) => b.key === k)).toBeDefined();
    expect(new Set(BADGES.map((b) => b.key)).size).toBe(BADGES.length);
  });
});
