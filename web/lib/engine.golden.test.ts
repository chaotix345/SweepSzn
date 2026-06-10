// Golden-master snapshot of evaluateLineup using real player ids from players.json and the
// committed coefficients.json merged over DEFAULT_COEFFICIENTS (exactly as lib/data.ts does).
// Any change to coefficients or scoring math will break this file loudly.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { evaluateLineup, DEFAULT_COEFFICIENTS } from "./engine";
import type { Player, Coefficients } from "./types";

// Load players.json directly (not server-only data.ts).
const DATA_DIR = path.join(process.cwd(), "public", "data");
const playersRaw: Player[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "players.json"), "utf-8"));
const coeffRaw: Partial<Coefficients> = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "coefficients.json"), "utf-8"),
);
// Mirror lib/data.ts load(): merge over DEFAULT_COEFFICIENTS, strip the non-coefficient _meta key.
const coeffClean = Object.fromEntries(
  Object.entries(coeffRaw as Record<string, unknown>).filter(([k]) => k !== "_meta"),
) as Partial<Coefficients>;
const COEFF: Coefficients = { ...DEFAULT_COEFFICIENTS, ...coeffClean };

const byId = new Map(playersRaw.map((p) => [p.id, p]));

function lineup(...ids: string[]): Player[] {
  return ids.map((id) => {
    const p = byId.get(id);
    if (!p) throw new Error(`players.json missing expected id: ${id}`);
    return p;
  });
}

// ── Fixed lineup definitions ─────────────────────────────────────────────────

// 1. Modern dynasty: spacing, elite offense, mixed bigs, GOAT SGs
const MODERN_DYNASTY = lineup(
  "michael_jordan_chi_1990s_1991",   // SG
  "lebron_james_mia_2010s_2013",     // PF
  "stephen_curry_gsw_2010s_2016",    // PG
  "shaquille_o_neal_lal_1990s_2000", // C
  "magic_johnson_lal_1980s_1990",    // PG
);

// 2. Pre-1974-heavy: era-adjusted (Bill Russell + Mikan + Kareem early + Bird + Magic)
const PRE74_HEAVY = lineup(
  "bill_russell_bos_1960s_1963",        // C — estimated defense
  "george_mikan_mnl_1950s_1952",        // C — estimated defense
  "kareem_abdul_jabbar_lal_1970s_1976", // C — 1976 (has dbpm)
  "larry_bird_bos_1980s_1985",          // SF
  "magic_johnson_lal_1980s_1990",       // PG
);

// 3. All-PG: usage budget overflow test
const ALL_PG = lineup(
  "stephen_curry_gsw_2010s_2016",  // PG usg=32.6
  "james_harden_hou_2010s_2019",   // PG usg=40.5 — capped at 40
  "russell_westbrook_okc_2010s_2017", // PG usg=40+ — capped at 40
  "magic_johnson_lal_1980s_1990",  // PG usg=24.8
  "luka_don_i_dal_2020s_2024",     // PG usg=36
);

// 4. GOAT era — no spacing, high offense, moderate defense
const GOAT_ERA = lineup(
  "michael_jordan_chi_1990s_1991",
  "kobe_bryant_lal_2000s_2006",
  "lebron_james_mia_2010s_2013",
  "kareem_abdul_jabbar_lal_1970s_1976",
  "shaquille_o_neal_lal_1990s_2000",
);

// 5. Shooting lineup — 3pt spacing dominant, perim defenders present
const SHOOTING_LINEUP = lineup(
  "stephen_curry_gsw_2010s_2016",
  "kobe_bryant_lal_2000s_2006",
  "magic_johnson_lal_1980s_1990",
  "larry_bird_bos_1980s_1985",
  "lebron_james_mia_2010s_2013",
);

// 6. All-center — rim presence maxed, no perimeter defenders (no stl z ≥ 0.6 from guards)
const ALL_CENTER = lineup(
  "nikola_joki_den_2020s_2024",
  "david_robinson_sas_1990s_1994",
  "shaquille_o_neal_lal_1990s_2000",
  "bill_russell_bos_1960s_1963",
  "kareem_abdul_jabbar_lal_1970s_1976",
);

// 7. Pure pre-1974 — all estimated defense, no 3pt era, era discount applied to everyone
const ALL_PRE74 = lineup(
  "bill_russell_bos_1960s_1963",
  "george_mikan_mnl_1950s_1952",
  "wilt_chamberlain_phi_1960s_1968",
  "elvin_hayes_sdr_1970s_1971",
  "walt_frazier_nyk_1960s_1970",
);

// 8. Stat-stuffer — high usage, weak defense, overload penalty triggered
const STAT_STUFFER = lineup(
  "james_harden_hou_2010s_2019",
  "russell_westbrook_okc_2010s_2017",
  "kobe_bryant_lal_2000s_2006",
  "joel_embiid_phi_2020s_2022",
  "demarcus_cousins_sac_2010s_2017",
);

// 9. Mixed era: 1950 → 1960 → 1990 → 2013 → 2024 (era-adjusted members + moderns)
const MIXED_ERA = lineup(
  "george_mikan_mnl_1950s_1952",
  "bill_russell_bos_1960s_1963",
  "magic_johnson_lal_1980s_1990",
  "lebron_james_mia_2010s_2013",
  "nikola_joki_den_2020s_2024",
);

// 10. Modern balanced — spacing, modern all >1980, sane usage
const MODERN_BALANCED = lineup(
  "stephen_curry_gsw_2010s_2016",
  "michael_jordan_chi_1990s_1991",
  "larry_bird_bos_1980s_1985",
  "nikola_joki_den_2020s_2024",
  "magic_johnson_lal_1980s_1990",
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("engine golden master — evaluateLineup with committed coefficients.json", () => {

  // 1. Modern dynasty
  // ortg=121.2, drtg=99.4, netRtg=21.8, winPct=0.941 (rounded per engine round1/round3)
  describe("modernDynasty", () => {
    const r = evaluateLineup(MODERN_DYNASTY, COEFF);
    it("wins", () => expect(r.wins).toBe(77));
    it("losses", () => expect(r.losses).toBe(5));
    it("ortg", () => expect(r.ortg).toBe(121.2));
    it("drtg", () => expect(r.drtg).toBe(99.4));
    it("netRtg", () => expect(r.netRtg).toBe(21.8));
    it("winPct", () => expect(r.winPct).toBe(0.941));
    it("grade is A+ or S (wins=77)", () => expect(["S", "A+"].includes(r.grade)).toBe(true));
    it("has player breakdowns for all 5", () => expect(r.players).toHaveLength(5));
  });

  // 2. Pre-1974-heavy (estimated defense, era-discounted)
  // ortg=111.5, drtg=95.7, netRtg=15.8, winPct=0.894
  describe("pre74Heavy", () => {
    const r = evaluateLineup(PRE74_HEAVY, COEFF);
    it("wins", () => expect(r.wins).toBe(73));
    it("losses", () => expect(r.losses).toBe(9));
    it("ortg", () => expect(r.ortg).toBe(111.5));
    it("drtg", () => expect(r.drtg).toBe(95.7));
    it("netRtg", () => expect(r.netRtg).toBe(15.8));
    it("winPct", () => expect(r.winPct).toBe(0.894));
    // pre-1985 note is attached when lineup has members with year < fullYear
    it("has era-discount note for pre-1985 players", () => {
      expect(r.notes.some((n) => /pre-1985/i.test(n) || /era.adjust/i.test(n))).toBe(true);
    });
    // estimated defense note for pre-1974 members
    it("has estimated-defense note", () => {
      expect(r.notes.some((n) => /estimated/i.test(n) || /pre-1974/i.test(n))).toBe(true);
    });
  });

  // 3. All-PG (usage overload)
  // ortg=118.3, drtg=107.8, netRtg=10.4, winPct=0.785
  describe("allPG (usage overload)", () => {
    const r = evaluateLineup(ALL_PG, COEFF);
    it("wins", () => expect(r.wins).toBe(64));
    it("losses", () => expect(r.losses).toBe(18));
    it("ortg", () => expect(r.ortg).toBe(118.3));
    it("drtg", () => expect(r.drtg).toBe(107.8));
    it("netRtg", () => expect(r.netRtg).toBe(10.4));
    it("winPct", () => expect(r.winPct).toBe(0.785));
    // overload factor should appear (totalUsage=173.4, budget=100, penalty=16.1)
    it("includes usage overload factor", () => {
      expect(r.factors.some((f) => /overload/i.test(f.label) && f.kind === "bad")).toBe(true);
    });
    // wins < modernDynasty (overload drags it down)
    it("wins < modernDynasty wins", () => expect(r.wins).toBeLessThan(77));
  });

  // 4. GOAT era
  // ortg=114.3, drtg=99.6, netRtg=14.7, winPct=0.873
  describe("goatEra", () => {
    const r = evaluateLineup(GOAT_ERA, COEFF);
    it("wins", () => expect(r.wins).toBe(72));
    it("losses", () => expect(r.losses).toBe(10));
    it("ortg", () => expect(r.ortg).toBe(114.3));
    it("drtg", () => expect(r.drtg).toBe(99.6));
    it("netRtg", () => expect(r.netRtg).toBe(14.7));
    it("winPct", () => expect(r.winPct).toBe(0.873));
    it("grade A+ (wins=72)", () => expect(r.grade).toBe("A+"));
  });

  // 5. Shooting lineup
  // ortg=120.0, drtg=105.4, netRtg=14.6, winPct=0.860
  describe("shootingLineup", () => {
    const r = evaluateLineup(SHOOTING_LINEUP, COEFF);
    it("wins", () => expect(r.wins).toBe(71));
    it("losses", () => expect(r.losses).toBe(11));
    it("ortg", () => expect(r.ortg).toBe(120));
    it("drtg", () => expect(r.drtg).toBe(105.4));
    it("netRtg", () => expect(r.netRtg).toBe(14.6));
    it("winPct", () => expect(r.winPct).toBe(0.86));
  });

  // 6. All-center
  // ortg=112.8, drtg=97.2, netRtg=15.6, winPct=0.889
  describe("allCenter", () => {
    const r = evaluateLineup(ALL_CENTER, COEFF);
    it("wins", () => expect(r.wins).toBe(73));
    it("losses", () => expect(r.losses).toBe(9));
    it("ortg", () => expect(r.ortg).toBe(112.8));
    it("drtg", () => expect(r.drtg).toBe(97.2));
    it("netRtg", () => expect(r.netRtg).toBe(15.6));
    it("winPct", () => expect(r.winPct).toBe(0.889));
    // no-perimeter-defender penalty expected (all centers, no guard stl z >= 0.6)
    it("includes thin-perimeter or no-perimeter factor", () => {
      expect(r.factors.some((f) => /perimeter/i.test(f.label) && f.kind === "bad")).toBe(true);
    });
    // spacing penalty expected (no 3pt era bigs — all-center, pre-3pt players in mix)
    it("spacing factor is negative or absent (centers don't shoot 3s)", () => {
      const spacingFactor = r.factors.find((f) => /spacing/i.test(f.label));
      if (spacingFactor) expect(spacingFactor.value).toBeLessThan(0);
    });
  });

  // 7. Pure pre-1974
  // ortg=107.9, drtg=95.3, netRtg=12.5, winPct=0.849
  describe("allPre74", () => {
    const r = evaluateLineup(ALL_PRE74, COEFF);
    it("wins", () => expect(r.wins).toBe(70));
    it("losses", () => expect(r.losses).toBe(12));
    it("ortg", () => expect(r.ortg).toBe(107.9));
    it("drtg", () => expect(r.drtg).toBe(95.3));
    it("netRtg", () => expect(r.netRtg).toBe(12.5));
    it("winPct", () => expect(r.winPct).toBe(0.849));
    // spacing is zero (all pre-1980, shooterUnit returns 0 for year < 1980)
    it("spacing factor absent (all pre-3pt era)", () => {
      const spacingFactor = r.factors.find((f) => /spacing/i.test(f.label));
      expect(spacingFactor).toBeUndefined();
    });
    it("has estimated-defense note", () => {
      expect(r.notes.some((n) => /estimated/i.test(n))).toBe(true);
    });
  });

  // 8. Stat stuffer
  // ortg=109.2, drtg=101.8, netRtg=7.4, winPct=0.728
  describe("statStuffer", () => {
    const r = evaluateLineup(STAT_STUFFER, COEFF);
    it("wins", () => expect(r.wins).toBe(60));
    it("losses", () => expect(r.losses).toBe(22));
    it("ortg", () => expect(r.ortg).toBe(109.2));
    it("drtg", () => expect(r.drtg).toBe(101.8));
    it("netRtg", () => expect(r.netRtg).toBe(7.4));
    it("winPct", () => expect(r.winPct).toBe(0.728));
    it("has usage overload factor", () => {
      expect(r.factors.some((f) => /overload/i.test(f.label) && f.kind === "bad")).toBe(true);
    });
  });

  // 9. Mixed era
  // ortg=115.8, drtg=94.5, netRtg=21.3, winPct=0.945
  describe("mixedEra", () => {
    const r = evaluateLineup(MIXED_ERA, COEFF);
    it("wins", () => expect(r.wins).toBe(78));
    it("losses", () => expect(r.losses).toBe(4));
    it("ortg", () => expect(r.ortg).toBe(115.8));
    it("drtg", () => expect(r.drtg).toBe(94.5));
    it("netRtg", () => expect(r.netRtg).toBe(21.3));
    it("winPct", () => expect(r.winPct).toBe(0.945));
    it("has era-discount note (Mikan/Russell are pre-1985)", () => {
      expect(r.notes.some((n) => /pre-1985/i.test(n) || /era.adjust/i.test(n))).toBe(true);
    });
  });

  // 10. Modern balanced
  // ortg=121.6, drtg=98.1, netRtg=23.5, winPct=0.953
  describe("modernBalanced", () => {
    const r = evaluateLineup(MODERN_BALANCED, COEFF);
    it("wins", () => expect(r.wins).toBe(78));
    it("losses", () => expect(r.losses).toBe(4));
    it("ortg", () => expect(r.ortg).toBe(121.6));
    it("drtg", () => expect(r.drtg).toBe(98.1));
    it("netRtg", () => expect(r.netRtg).toBe(23.5));
    it("winPct", () => expect(r.winPct).toBe(0.953));
    it("grade A+ (wins=78, S threshold is 80)", () => expect(r.grade).toBe("A+"));
  });

  // ── Cross-lineup ordering assertions ──────────────────────────────────────

  describe("ordering invariants", () => {
    const md = evaluateLineup(MODERN_DYNASTY, COEFF);
    const allpg = evaluateLineup(ALL_PG, COEFF);
    const pre74 = evaluateLineup(PRE74_HEAVY, COEFF);
    const stuffer = evaluateLineup(STAT_STUFFER, COEFF);
    const balanced = evaluateLineup(MODERN_BALANCED, COEFF);

    it("modern balanced beats modern dynasty in wins (Jokic replaces Shaq → better rim+offense)", () => {
      expect(balanced.wins).toBeGreaterThanOrEqual(md.wins);
    });

    it("stat-stuffer wins < allPG wins (defense drag on stuffer is severe)", () => {
      expect(stuffer.wins).toBeLessThan(allpg.wins);
    });

    it("pre74Heavy wins > stat-stuffer wins (defense is strong despite era discount)", () => {
      expect(pre74.wins).toBeGreaterThan(stuffer.wins);
    });

    it("stat-stuffer netRtg < modernDynasty netRtg (overload+weak defense hurts net)", () => {
      expect(stuffer.netRtg).toBeLessThan(md.netRtg);
    });

    it("all results have wins in 0..82", () => {
      for (const r of [md, allpg, pre74, stuffer, balanced]) {
        expect(r.wins).toBeGreaterThanOrEqual(0);
        expect(r.wins).toBeLessThanOrEqual(82);
        expect(r.losses).toBe(82 - r.wins);
      }
    });

    it("all results have player breakdown of length 5", () => {
      for (const r of [md, allpg, pre74, stuffer, balanced]) {
        expect(r.players).toHaveLength(5);
      }
    });
  });

  // ── Empty lineup edge case ────────────────────────────────────────────────

  describe("empty lineup", () => {
    const r = evaluateLineup([], COEFF);
    it("wins=0, losses=82", () => {
      expect(r.wins).toBe(0);
      expect(r.losses).toBe(82);
    });
    it("grade F", () => expect(r.grade).toBe("F"));
  });
});
