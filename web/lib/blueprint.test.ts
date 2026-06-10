import { describe, it, expect } from "vitest";
import type { LineupResult, Player } from "./types";
import {
  bpSeedOk, bpCode, bpFromCode, bpKeyOk, BLUEPRINTS, blueprintDef, blueprintMetric,
  gradeBlueprint, encBpScore, decodeBpDisplay, BP_MULT, type BlueprintKey,
} from "./blueprint";
import { encodeLineup, decodeShare } from "./share";
import { decodePickemCard, encodePickemCard } from "./pickem";
import { evaluateLineup } from "./engine";

const KEYS: BlueprintKey[] = ["spacing", "fortress", "discipline", "rim", "balanced"];

const synth = (over: Partial<LineupResult> = {}): LineupResult => ({
  ortg: 115, drtg: 105, netRtg: 10, wins: 70, losses: 12, winPct: 0.85, grade: "A", label: "DYNASTY",
  factors: [
    { label: "Star offense", value: 9.1, kind: "good" },
    { label: "Star defense", value: 8.2, kind: "good" },
    { label: "Spacing (3.4 shooters)", value: 1.8, kind: "good" },
    { label: "Thin interior size", value: -1.4, kind: "bad" },
  ],
  players: [
    { id: "a", name: "A", off: 5, def: 2.0, usage: 24.5, shooter: true, rimProtector: false },
    { id: "b", name: "B", off: 4, def: 1.0, usage: 21.0, shooter: true, rimProtector: false },
    { id: "c", name: "C", off: 3, def: 3.5, usage: 18.5, shooter: false, rimProtector: true },
    { id: "d", name: "D", off: 2, def: 2.5, usage: 17.0, shooter: false, rimProtector: true },
    { id: "e", name: "E", off: 1, def: 0.5, usage: 15.0, shooter: false, rimProtector: false },
  ],
  notes: [], ...over,
});

describe("blueprint seeds", () => {
  it("canonical accepted", () => expect(bpSeedOk("bp-2026-6-10")).toBe(true));
  it("two-digit month/day accepted", () => expect(bpSeedOk("bp-2026-12-31")).toBe(true));
  it("missing day rejected", () => expect(bpSeedOk("bp-2026-6")).toBe(false));
  it("daily prefix rejected", () => expect(bpSeedOk("daily-2026-6-10")).toBe(false));
  it("trailing junk rejected", () => expect(bpSeedOk("bp-2026-6-10x")).toBe(false));
  it("non-string rejected", () => expect(bpSeedOk(42)).toBe(false));
});

describe("blueprint key/code mapping", () => {
  for (const k of KEYS) {
    it(`code round-trip: ${k}`, () => expect(bpFromCode(bpCode(k))).toBe(k));
  }
  it("unknown code -> null", () => expect(bpFromCode("z")).toBeNull());
  it("null code -> null", () => expect(bpFromCode(null)).toBeNull());
  it("bpKeyOk allowlist", () => {
    expect(bpKeyOk("spacing")).toBe(true);
    expect(bpKeyOk("SPACING")).toBe(false);
    expect(bpKeyOk("all")).toBe(false);
  });
  it("five distinct share codes", () => expect(new Set(KEYS.map(bpCode)).size).toBe(5));
  it("five blueprint defs resolvable", () => {
    expect(BLUEPRINTS.length).toBe(5);
    for (const k of KEYS) expect(blueprintDef(k).key).toBe(k);
  });
});

describe("blueprint metric derivation", () => {
  const r = synth();
  it("spacing metric = Spacing factor value", () => expect(blueprintMetric("spacing", r)).toBe(1.8));
  it("fortress metric = Star defense factor value", () => expect(blueprintMetric("fortress", r)).toBe(8.2));
  it("discipline metric = exact usage sum", () => expect(blueprintMetric("discipline", r)).toBeCloseTo(96, 9));
  it("rim metric = defScale-weighted rim-protector def", () =>
    expect(blueprintMetric("rim", r)).toBeCloseTo((3.5 + 2.5) * 0.742, 9));
  it("balanced metric = net rating", () => expect(blueprintMetric("balanced", r)).toBe(10));
  it("suppressed spacing factor -> 0", () => expect(blueprintMetric("spacing", synth({ factors: [] }))).toBe(0));
});

describe("blueprint grading bands + multipliers", () => {
  const r = synth();
  it("spacing 2.6 -> A+ x1.3", () => {
    const g = gradeBlueprint("spacing", synth({ factors: [{ label: "Spacing (4.0 shooters)", value: 2.6, kind: "good" }] }));
    expect(g.grade).toBe("A+");
    expect(g.mult).toBe(1.3);
  });
  it("spacing 1.8 -> B", () => {
    const g = gradeBlueprint("spacing", r);
    expect(g.grade).toBe("B");
    expect(g.mult).toBe(BP_MULT.B);
  });
  it("negative spacing -> F", () =>
    expect(gradeBlueprint("spacing", synth({ factors: [{ label: "Spacing (0.2 shooters)", value: -1.0, kind: "bad" }] })).grade).toBe("F"));
  it("discipline 96 -> B (lowerIsBetter band)", () => expect(gradeBlueprint("discipline", r).grade).toBe("B"));
  it("usage 85 -> A+", () =>
    expect(gradeBlueprint("discipline", synth({ players: r.players.map((p) => ({ ...p, usage: 17 })) })).grade).toBe("A+"));
  it("usage 150 -> F", () =>
    expect(gradeBlueprint("discipline", synth({ players: r.players.map((p) => ({ ...p, usage: 30 })) })).grade).toBe("F"));
  it("balanced 14.2 -> A+ with formatted metric", () => {
    const g = gradeBlueprint("balanced", synth({ netRtg: 14.2 }));
    expect(g.grade).toBe("A+");
    expect(g.metricText).toBe("14.2");
  });
  it("view score matches encoded display score", () => {
    const g = gradeBlueprint("balanced", synth({ netRtg: 14.2 }));
    expect(g.score).toBe(decodeBpDisplay(encBpScore(70, 1.3, 14.2)));
  });
  it("70 wins x 1.3 -> 91.0", () => {
    const g = gradeBlueprint("balanced", synth({ netRtg: 14.2 }));
    expect(g.score).toBeCloseTo(91, 9);
  });
});

describe("blueprint sort-score encoding", () => {
  it("higher mult outranks higher net", () => expect(encBpScore(70, 1.3, 5)).toBeGreaterThan(encBpScore(70, 1.22, 9)));
  it("net is the tiebreak", () => expect(encBpScore(70, 1.3, 6)).toBeGreaterThan(encBpScore(70, 1.3, 5)));
  it("decode: clean integer display", () => expect(decodeBpDisplay(encBpScore(82, 1.0, 0))).toBe(82));
  it("decode: fractional display survives", () => expect(decodeBpDisplay(encBpScore(73, 1.05, 0))).toBe(76.65));
  it("net clamp: floor", () => expect(encBpScore(0, 1.0, -200)).toBeGreaterThanOrEqual(0));
});

describe("share segment round-trip with the b<code>~ prefix", () => {
  const ids = ["aa_1", "bb_2", "cc_3", "dd_4", "ee_5"];
  for (const k of KEYS) {
    it(`share round-trip: ${k}`, () => {
      const seg = encodeLineup(ids, false, false, bpCode(k));
      const dec = decodeShare(seg);
      expect(seg.startsWith(`b${bpCode(k)}~`)).toBe(true);
      expect(dec.bp).toBe(bpCode(k));
      expect(dec.ids.join()).toBe(ids.join());
      expect(dec.hinted).toBe(false);
      expect(dec.prime).toBe(false);
    });
  }
  it("share round-trip: bp + hints stacked", () => {
    const dec = decodeShare(encodeLineup(ids, true, false, "s"));
    expect(dec.bp).toBe("s");
    expect(dec.hinted).toBe(true);
    expect(dec.ids.length).toBe(5);
  });
  it("share round-trip: no flags unchanged", () => {
    const plain = decodeShare(encodeLineup(ids));
    expect(plain.bp).toBeNull();
    expect(plain.hinted).toBe(false);
    expect(plain.prime).toBe(false);
  });
  it("share round-trip: prime+hint unchanged", () => {
    const dec = decodeShare(encodeLineup(ids, true, true));
    expect(dec.prime).toBe(true);
    expect(dec.hinted).toBe(true);
    expect(dec.bp).toBeNull();
  });
});

describe("pickem card segment validator accepts every encodeLineup prefix", () => {
  const ids = ["aa_1", "bb_2", "cc_3", "dd_4", "ee_5"];
  const view = { y: 3, n: 1, vote: "y" as const };
  it("pe card: b~+h~ lineup accepted", () =>
    expect(decodePickemCard(encodePickemCard(encodeLineup(ids, true, false, "s"), view))).not.toBeNull());
  it("pe card: p~ lineup accepted (latent gap closed)", () =>
    expect(decodePickemCard(encodePickemCard(encodeLineup(ids, false, true), view))).not.toBeNull());
  it("pe card: bare lineup still accepted", () =>
    expect(decodePickemCard(encodePickemCard(encodeLineup(ids), view))).not.toBeNull());
  it("pe card: unknown prefix shape rejected", () =>
    expect(decodePickemCard("3.1.y.zz~" + ids.join(","))).toBeNull());
});

describe("blueprint integration with a real engine evaluation", () => {
  const mk = (id: string, pos: Player["pos"], over: Partial<Player> = {}): Player => ({
    id, name: id.toUpperCase(), year: 2015, decade: "2010s", tier: "complete", team: "TST", pos,
    g: 70, mp: 30, obpm: 3, dbpm: 1, usg: 22, pts: 20, trb: 5, ast: 4,
    z: { pts: 1, trb: 0.5, ast: 0.5, stl: 0.7, blk: 0.2, ts: 0.5 }, ...over,
  });
  const five = [
    mk("pg", "PG"), mk("sg", "SG"), mk("sf", "SF"),
    mk("pf", "PF", { z: { pts: 0.5, trb: 1.5, ast: 0, stl: 0, blk: 1.5, ts: 0.3 }, dbpm: 2 }),
    mk("ce", "C", { z: { pts: 0.5, trb: 2.0, ast: 0, stl: 0, blk: 2.0, ts: 0.3 }, dbpm: 3 }),
  ];
  const real = evaluateLineup(five);
  for (const k of KEYS) {
    it(`integration: ${k} grades a real engine result`, () => {
      const v = gradeBlueprint(k, real);
      expect(Number.isFinite(v.metric)).toBe(true);
      expect(typeof v.grade).toBe("string");
      expect(v.mult).toBeGreaterThanOrEqual(1);
      expect(v.mult).toBeLessThanOrEqual(1.3);
      expect(v.score).toBeGreaterThan(0);
    });
  }
  it("integration: discipline reads the engine's exact usage sum", () => {
    const usageSum = real.players.reduce((a, p) => a + p.usage, 0);
    expect(blueprintMetric("discipline", real)).toBeCloseTo(usageSum, 9);
  });
});
