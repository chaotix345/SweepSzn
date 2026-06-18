import { describe, it, expect } from "vitest";
import { factorBlurb, factorViews, playerContribRows, historyAnchor, scoutingAnchor, FAMOUS_TEAMS, fmtNet, headline } from "./explain";
import type { LineupResult, PlayerBreakdown } from "./types";

const GENERIC = "Contribution to the team rating.";

function mkResult(overrides: Partial<LineupResult> = {}): LineupResult {
  return {
    ortg: 110, drtg: 100, netRtg: 10, wins: 65, losses: 17, winPct: 0.79,
    grade: "A", label: "DYNASTY",
    factors: [
      { label: "Star offense", value: 22.8, kind: "good" },
      { label: "Usage overload (162% demand)", value: -11.3, kind: "bad", winsEst: -5 },
      { label: "Star defense", value: 8, kind: "good" },
    ],
    players: [], notes: [],
    ...overrides,
  };
}

describe("factorBlurb — new factor labels have specific copy", () => {
  it("era adjustment has its own blurb", () => {
    const blurb = factorBlurb("Era adjustment", -2);
    expect(blurb).not.toBe(GENERIC);
    expect(blurb).toMatch(/era|modern|league/i);
  });

  it("thin perimeter defense has its own blurb", () => {
    const blurb = factorBlurb("Thin perimeter defense", -1.8);
    expect(blurb).not.toBe(GENERIC);
    expect(blurb).toMatch(/perimeter|guard|wing/i);
  });
});

describe("factorViews — winsEst passthrough", () => {
  it("carries winsEst from the engine factor", () => {
    const views = factorViews(mkResult());
    const overload = views.find((v) => /overload/i.test(v.label))!;
    expect(overload.winsEst).toBe(-5);
  });

  it("leaves winsEst undefined for level terms", () => {
    const views = factorViews(mkResult());
    const star = views.find((v) => v.label === "Star offense")!;
    expect(star.winsEst).toBeUndefined();
  });
});

describe("playerContribRows — per-player rating contributions", () => {
  const pb: PlayerBreakdown[] = [
    { id: "a", name: "Scorer", off: 5.0, def: 0.5, usage: 33, shooter: true, rimProtector: false },
    { id: "b", name: "Anchor", off: -1.8, def: 3.4, usage: 15, shooter: false, rimProtector: true },
  ];

  it("scales impact by the engine's fitted off/def scales (1dp)", () => {
    const rows = playerContribRows(pb);
    // offScale=0.6178, defScale=0.742 (DEFAULT_COEFFICIENTS mirrors the fitted file)
    expect(rows[0]).toMatchObject({ id: "a", name: "Scorer", offPts: 3.1, defPts: 0.4 });
    expect(rows[1]).toMatchObject({ id: "b", name: "Anchor", offPts: -1.1, defPts: 2.5 });
  });
});

describe("historyAnchor — verified real-team reference per win band", () => {
  it("73+ → the record 73-9 Warriors", () => {
    expect(historyAnchor(73)!.record).toBe("73-9");
    expect(historyAnchor(80)!.team).toMatch(/Warriors/);
  });
  it("69-72 → the 72-10 Bulls", () => {
    expect(historyAnchor(69)!.record).toBe("72-10");
    expect(historyAnchor(72)!.team).toMatch(/Bulls/);
  });
  it("65-68 → the 66-16 Heat", () => {
    expect(historyAnchor(65)!.record).toBe("66-16");
    expect(historyAnchor(68)!.team).toMatch(/Heat/);
  });
  it("60-64 → the 64-18 Celtics", () => {
    expect(historyAnchor(60)!.record).toBe("64-18");
    expect(historyAnchor(64)!.team).toMatch(/Celtics/);
  });
  it("55-59 → the 58-24 Spurs (NOT the 66-16 Heat)", () => {
    expect(historyAnchor(57)!.record).toBe("58-24");
    expect(historyAnchor(59)!.team).toMatch(/Spurs/);
  });
  it("50-54 → the 53-29 title Nuggets", () => {
    expect(historyAnchor(50)!.record).toBe("53-29");
    expect(historyAnchor(54)!.team).toMatch(/Nuggets/);
  });
  it("47-49 → the 47-35 title Rockets", () => {
    expect(historyAnchor(47)!.record).toBe("47-35");
    expect(historyAnchor(49)!.team).toMatch(/Rockets/);
  });
  it("42-46 → the 43-39 conference-finals Lakers", () => {
    expect(historyAnchor(42)!.record).toBe("43-39");
    expect(historyAnchor(46)!.team).toMatch(/Lakers/);
  });
  it("41 and below → no anchor (an average team wins 41)", () => {
    expect(historyAnchor(41)).toBeNull();
    expect(historyAnchor(20)).toBeNull();
  });
});

describe("scoutingAnchor — your five's projection beside a comparable real team", () => {
  it("pairs the win-band anchor with the result's projected ratings + the team's actuals", () => {
    const s = scoutingAnchor(mkResult({ wins: 57, ortg: 112, drtg: 104, netRtg: 8 }))!;
    expect(s).not.toBeNull();
    expect(s.anchor.team).toMatch(/Spurs/);
    expect(s.est).toEqual({ ortg: 112, drtg: 104, netRtg: 8 });
    expect(s.anchor.ortg).toBeCloseTo(108.3, 1); // the real 2012-13 Spurs ORtg
  });

  it("returns null below the 42-win anchor floor", () => {
    expect(scoutingAnchor(mkResult({ wins: 30 }))).toBeNull();
  });
});

describe("fmtNet — signed net rating whose sign agrees with the rounded magnitude", () => {
  it("prefixes + for positive and keeps - for negative", () => {
    expect(fmtNet(4.2)).toBe("+4.2");
    expect(fmtNet(-3.1)).toBe("-3.1");
  });
  it("never shows +0.0 for a value that rounds to zero", () => {
    expect(fmtNet(0.04)).toBe("0.0");
    expect(fmtNet(0)).toBe("0.0");
    expect(fmtNet(-0.02)).toBe("0.0");
  });
});

describe("FAMOUS_TEAMS — the curated real-team set the compare picker offers", () => {
  it("exposes every anchor team with real ratings for the picker", () => {
    expect(FAMOUS_TEAMS.length).toBe(8);
    for (const t of FAMOUS_TEAMS) {
      expect(typeof t.name).toBe("string");
      expect(typeof t.year).toBe("number");
      expect(typeof t.ortg).toBe("number");
      expect(typeof t.drtg).toBe("number");
    }
    expect(FAMOUS_TEAMS[0].team).toMatch(/Warriors/);
  });
});

describe("headline — quantifies the biggest drag when the engine priced it", () => {
  it("appends the win cost of the top drag", () => {
    const h = headline(mkResult());
    expect(h).toMatch(/usage overload/i);
    expect(h).toMatch(/~5 wins/);
  });

  it("uses singular 'win' for a one-win drag", () => {
    const r = mkResult({
      factors: [
        { label: "Star offense", value: 22.8, kind: "good" },
        { label: "Spacing (1.2 shooters)", value: -1.4, kind: "bad", winsEst: -1 },
      ],
    });
    expect(headline(r)).toMatch(/~1 win\b/);
  });

  it("omits the cost suffix when winsEst is absent", () => {
    const r = mkResult({
      factors: [
        { label: "Star offense", value: 22.8, kind: "good" },
        { label: "Thin interior size", value: -2.1, kind: "bad" },
      ],
    });
    expect(headline(r)).not.toMatch(/~\d/);
  });
});
