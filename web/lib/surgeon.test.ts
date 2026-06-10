import { describe, it, expect } from "vitest";
import type { LineupResult, Player, Slot } from "./types";
import {
  surgeonSeedOk, surgeonDiagnosis, needOf, buildSurgeonPool, SURGEON_POOL_SIZE,
  encSurgeonScore, decodeSurgeonDelta, encodeSurgeonCard, decodeSurgeonCard,
} from "./surgeon";

describe("surgeon seeds", () => {
  it("seed: canonical accepted", () => expect(surgeonSeedOk("surgeon-2026-6-10")).toBe(true));
  it("seed: missing day rejected", () => expect(surgeonSeedOk("surgeon-2026-6")).toBe(false));
  it("seed: daily prefix rejected", () => expect(surgeonSeedOk("daily-2026-6-10")).toBe(false));
  it("seed: trailing junk rejected", () => expect(surgeonSeedOk("surgeon-2026-6-10x")).toBe(false));
});

const F = (label: string, value: number): LineupResult["factors"][number] =>
  ({ label, value, kind: value < 0 ? "bad" : "good" });

describe("surgeon diagnosis", () => {
  it("diagnosis: highest-magnitude negative wins", () => {
    const d = surgeonDiagnosis([F("Star offense", 9), F("Usage overload (118% demand)", -4.2), F("Spacing (1.1 shooters)", -0.5)]);
    expect(d?.kind).toBe("worst");
    expect(d?.canonical).toBe("Usage overload");
    expect(d?.value).toBe(-4.2);
  });
  it("diagnosis: clean build falls back to smallest positive", () => {
    const d = surgeonDiagnosis([F("Star offense", 9.1), F("Star defense", 4.0), F("Spacing (3.0 shooters)", 1.2)]);
    expect(d?.kind).toBe("weakest");
    expect(d?.canonical).toBe("Spacing");
    expect(d?.value).toBe(1.2);
  });
  it("diagnosis: empty factors -> null", () => expect(surgeonDiagnosis([])).toBeNull());
});

describe("surgeon need mapping", () => {
  it("need: overload -> lowusage", () => expect(needOf("Usage overload")).toBe("lowusage"));
  it("need: spacing -> shoot", () => expect(needOf("Spacing")).toBe("shoot"));
  it("need: interior -> rim", () => {
    expect(needOf("No interior size")).toBe("rim");
    expect(needOf("Thin interior size")).toBe("rim");
  });
  it("need: perimeter -> perim", () => expect(needOf("No perimeter defender")).toBe("perim"));
  it("need: fallback strengths", () => {
    expect(needOf("Star offense")).toBe("off");
    expect(needOf("Star defense")).toBe("def");
  });
});

describe("surgeon pool building (deterministic, exclusions, eligibility, WHY copy)", () => {
  const mk = (id: string, pos: Player["pos"], over: Partial<Player> = {}): Player => ({
    id, person_id: over.person_id ?? id, name: id.toUpperCase(), year: 2015, decade: "2010s",
    tier: "complete", team: "TST", pos, eligible: over.eligible ?? [pos as Slot],
    g: 70, mp: 30, obpm: 0, dbpm: 0, usg: 20, pts: 12, trb: 5, ast: 3, stl: 1, blk: 0.5, fg3: 1, fg3a: 3,
    z: { pts: 0, trb: 0, ast: 0, stl: 0, blk: 0, ts: 0 }, ...over,
  });
  const lineup = [
    mk("l_pg", "PG"), mk("l_sg", "SG"), mk("l_sf", "SF"), mk("l_pf", "PF"), mk("l_c", "C"),
  ];
  const offered = [
    mk("shooter_a", "SG", { fg3: 3.2, fg3a: 8, z: { pts: 1, ts: 1, stl: 0 } }),
    mk("shooter_b", "SF", { fg3: 2.4, fg3a: 6, z: { pts: 0.5, ts: 0.8, stl: 0 } }),
    mk("shooter_c", "PG", { fg3: 2.0, fg3a: 5, z: { ts: 0.6, stl: 0 } }),
    mk("shooter_d", "SG", { fg3: 1.4, fg3a: 4, z: { ts: 0.5, stl: 0 } }),
    mk("big_a", "C", { trb: 13, blk: 2.8, dbpm: 3, z: { trb: 2.2, blk: 2.4 } }),
    mk("big_b", "PF", { trb: 11, blk: 1.9, dbpm: 2, z: { trb: 1.8, blk: 1.7 } }),
    mk("wing_stl", "SG", { stl: 2.4, z: { stl: 1.6 } }),
    mk("dupe_of_pg", "PG", { person_id: "l_pg" }),                       // same person as a drafted player
    mk("wrong_slot", "C", { eligible: undefined, pos: "C" }),            // eligible only where C sits — fine
  ];
  const shootPool = buildSurgeonPool(lineup, offered, "shoot");
  it("pool: exactly three dealt", () => expect(shootPool.length).toBe(SURGEON_POOL_SIZE));
  it("pool: ranked by the need stat, best first", () => {
    expect(shootPool[0].id).toBe("shooter_a");
    expect(shootPool[1].id).toBe("shooter_b");
  });
  it("pool: drafted person's other variant excluded", () =>
    expect(shootPool.some((c) => c.id === "dupe_of_pg")).toBe(false));
  it("pool: WHY copy names the need", () =>
    expect(shootPool.every((c) => c.why.includes("floor spacer"))).toBe(true));
  it("pool: input order does not matter (deterministic)", () => {
    const shootPool2 = buildSurgeonPool(lineup, [...offered].reverse(), "shoot");
    expect(shootPool2.map((c) => c.id)).toEqual(shootPool.map((c) => c.id));
  });
  it("pool: rim need deals the anchor first", () => {
    const rimPool = buildSurgeonPool(lineup, offered, "rim");
    expect(rimPool[0].id).toBe("big_a");
    expect(rimPool[0].why).toContain("rim anchor");
  });
  it("pool: perim need deals the stopper first with SPG why", () => {
    const perimPool = buildSurgeonPool(lineup, offered, "perim");
    expect(perimPool[0].id).toBe("wing_stl");
    expect(perimPool[0].stat).toContain("SPG");
  });
  it("pool: lowusage deals three with usage why", () => {
    const lowPool = buildSurgeonPool(lineup, offered, "lowusage");
    expect(lowPool.length).toBe(3);
    expect(lowPool.every((c) => c.stat.includes("USG"))).toBe(true);
  });
});

describe("surgeon score encoding (delta can be negative)", () => {
  it("score: delta outranks net", () => expect(encSurgeonScore(8, 5)).toBeGreaterThan(encSurgeonScore(7, 12)));
  it("score: net is the tiebreak", () => expect(encSurgeonScore(3, 6)).toBeGreaterThan(encSurgeonScore(3, 5)));
  it("score: negative delta round-trips", () => expect(decodeSurgeonDelta(encSurgeonScore(-12, -3))).toBe(-12));
  it("score: zero delta round-trips", () => expect(decodeSurgeonDelta(encSurgeonScore(0, 0))).toBe(0));
  it("score: worst case stays non-negative", () => expect(encSurgeonScore(-82, -100)).toBeGreaterThanOrEqual(0));
});

describe("surgeon /sg/ card round trip", () => {
  const ids = ["aa_1", "bb_2", "cc_3", "dd_4", "ee_5"];
  it("card: encode/decode round trip", () => {
    const dec = decodeSurgeonCard(encodeSurgeonCard(ids, 2, "ff_6"));
    expect(dec).not.toBeNull();
    expect(dec!.outIdx).toBe(2);
    expect(dec!.inId).toBe("ff_6");
    expect(dec!.beforeIds.join()).toBe(ids.join());
  });
  it("card: after lineup substitutes at the out index", () => {
    const dec = decodeSurgeonCard(encodeSurgeonCard(ids, 2, "ff_6"));
    expect(dec!.afterIds[2]).toBe("ff_6");
    expect(dec!.afterIds[0]).toBe("aa_1");
  });
  it("card: four ids rejected", () => expect(decodeSurgeonCard("a,b,c,d.2.x")).toBeNull());
  it("card: out-of-range index rejected", () => expect(decodeSurgeonCard(`${ids.join(",")}.5.ff_6`)).toBeNull());
  it("card: swapping in a drafted id rejected", () => expect(decodeSurgeonCard(`${ids.join(",")}.2.aa_1`)).toBeNull());
  it("card: missing part rejected", () => expect(decodeSurgeonCard(`${ids.join(",")}.2`)).toBeNull());
  it("card: duplicate before-ids rejected", () => expect(decodeSurgeonCard("aa_1,aa_1,cc_3,dd_4,ee_5.1.ff_6")).toBeNull());
});
