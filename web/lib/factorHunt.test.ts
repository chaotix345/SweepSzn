import { describe, it, expect } from "vitest";
import type { LineupResult } from "./types";
import {
  FH_BONUS, FH_FACTOR_LABELS, canonicalFactor, fhSeedOk, buildFhChoices,
  encFhScore, decodeFhDisplay,
} from "./factorHunt";

type F = LineupResult["factors"];
const f = (label: string, value: number, kind: "good" | "bad" = value >= 0 ? "good" : "bad") => ({ label, value, kind });

describe("factorHunt", () => {
  // --- canonicalization ---
  describe("canonicalFactor", () => {
    it("parenthetical stripped", () => {
      expect(canonicalFactor("Usage overload (156% demand)") === "Usage overload").toBe(true);
    });
    it("spacing detail stripped", () => {
      expect(canonicalFactor("Spacing (2.0 shooters)") === "Spacing").toBe(true);
    });
    it("plain label unchanged", () => {
      expect(canonicalFactor("Star offense") === "Star offense").toBe(true);
    });
  });

  // --- seed gate ---
  describe("fhSeedOk", () => {
    it("fh daily seed accepted", () => {
      expect(fhSeedOk("fh-2026-6-10")).toBe(true);
    });
    it("truncated date rejected", () => {
      expect(!fhSeedOk("fh-2026-06")).toBe(true);
    });
    it("daily seed rejected", () => {
      expect(!fhSeedOk("daily-2026-6-10")).toBe(true);
    });
    it("trailing junk rejected", () => {
      expect(!fhSeedOk("fh-2026-6-10x")).toBe(true);
    });
  });

  // --- worst mode: flawed lineup ---
  describe("buildFhChoices - flawed lineup (worst mode)", () => {
    const FLAWED: F = [
      f("Star offense", 17.2), f("Usage overload (156% demand)", -12.4),
      f("Star defense", 4.5), f("Spacing (1.0 shooters)", -1.8), f("No perimeter defender", -0.8),
    ];

    it("negatives present -> ask worst", () => {
      const c = buildFhChoices(FLAWED, "fh-2026-6-10")!;
      expect(c.ask === "worst").toBe(true);
    });
    it("answer = highest-magnitude negative", () => {
      const c = buildFhChoices(FLAWED, "fh-2026-6-10")!;
      expect(c.answer === "Usage overload").toBe(true);
    });
    it("exactly 4 choices", () => {
      const c = buildFhChoices(FLAWED, "fh-2026-6-10")!;
      expect(c.choices.length === 4).toBe(true);
    });
    it("top-3 real negatives included", () => {
      const c = buildFhChoices(FLAWED, "fh-2026-6-10")!;
      expect(c.choices.includes("Usage overload") && c.choices.includes("Spacing") && c.choices.includes("No perimeter defender")).toBe(true);
    });
    it("decoy absent from the lineup's real factors", () => {
      const c = buildFhChoices(FLAWED, "fh-2026-6-10")!;
      const decoy = c.choices.find((x) => !["Usage overload", "Spacing", "No perimeter defender"].includes(x))!;
      expect(!FLAWED.map((x) => canonicalFactor(x.label)).includes(decoy)).toBe(true);
    });
    it("decoy from the canonical pool", () => {
      const c = buildFhChoices(FLAWED, "fh-2026-6-10")!;
      const decoy = c.choices.find((x) => !["Usage overload", "Spacing", "No perimeter defender"].includes(x))!;
      expect((FH_FACTOR_LABELS as readonly string[]).includes(decoy)).toBe(true);
    });
  });

  // --- determinism: same factors + seed -> identical choices; different seed -> (eventually) different order ---
  describe("buildFhChoices - determinism", () => {
    const FLAWED: F = [
      f("Star offense", 17.2), f("Usage overload (156% demand)", -12.4),
      f("Star defense", 4.5), f("Spacing (1.0 shooters)", -1.8), f("No perimeter defender", -0.8),
    ];

    it("deterministic for same seed", () => {
      const a = buildFhChoices(FLAWED, "fh-2026-6-10")!;
      const b = buildFhChoices(FLAWED, "fh-2026-6-10")!;
      expect(JSON.stringify(a) === JSON.stringify(b)).toBe(true);
    });
    it("different seeds shuffle differently", () => {
      const a = buildFhChoices(FLAWED, "fh-2026-6-10")!;
      let differs = false;
      for (let d = 1; d <= 9; d++) {
        const o = buildFhChoices(FLAWED, `fh-2026-6-${10 + d}`)!;
        if (JSON.stringify(o.choices) !== JSON.stringify(a.choices)) { differs = true; break; }
      }
      expect(differs).toBe(true);
    });
  });

  // --- best-mode flip: dominant roster, no negatives ---
  describe("buildFhChoices - clean lineup (best mode)", () => {
    const CLEAN: F = [f("Star offense", 18.1), f("Star defense", 6.2), f("Spacing (3.1 shooters)", 2.4)];

    it("no negatives -> flip to best", () => {
      const c = buildFhChoices(CLEAN, "fh-2026-6-10")!;
      expect(c.ask === "best").toBe(true);
    });
    it("answer = biggest positive", () => {
      const c = buildFhChoices(CLEAN, "fh-2026-6-10")!;
      expect(c.answer === "Star offense").toBe(true);
    });
    it("still 4 choices", () => {
      const c = buildFhChoices(CLEAN, "fh-2026-6-10")!;
      expect(c.choices.length === 4).toBe(true);
    });
    for (const real of ["Star offense", "Star defense", "Spacing"]) {
      it(`real positive ${real} included`, () => {
        const c = buildFhChoices(CLEAN, "fh-2026-6-10")!;
        expect(c.choices.includes(real)).toBe(true);
      });
    }
  });

  // --- padding: only 1 negative -> decoys fill to 4 ---
  describe("buildFhChoices - padding", () => {
    it("single negative is the answer", () => {
      const c = buildFhChoices([f("Star offense", 15), f("Star defense", 3), f("Usage overload (120% demand)", -5)], "fh-2026-6-10")!;
      expect(c.ask === "worst" && c.answer === "Usage overload").toBe(true);
    });
    it("padded to 4 unique choices", () => {
      const c = buildFhChoices([f("Star offense", 15), f("Star defense", 3), f("Usage overload (120% demand)", -5)], "fh-2026-6-10")!;
      expect(c.choices.length === 4 && new Set(c.choices).size === 4).toBe(true);
    });
  });

  // --- guards ---
  describe("buildFhChoices - guards", () => {
    it("no factors -> null (caller falls back)", () => {
      expect(buildFhChoices([], "fh-2026-6-10") === null).toBe(true);
    });
    it("sign decides negativity, not the kind tag", () => {
      // negative Star defense (kind 'good' but value < 0) counts as a negative factor
      const c = buildFhChoices([f("Star offense", 12), f("Star defense", -2.5, "good"), f("Spacing (2.2 shooters)", 0.5)], "fh-2026-6-10")!;
      expect(c.ask === "worst" && c.answer === "Star defense").toBe(true);
    });
  });

  // --- scoring: bonus path ---
  describe("scoring", () => {
    it("bonus is x1.05 (cosmetic)", () => {
      expect(FH_BONUS === 1.05).toBe(true);
    });
    it("70 wins + bonus -> 73.5 display", () => {
      expect(decodeFhDisplay(encFhScore(70, 5, true)) === 73.5).toBe(true);
    });
    it("no bonus -> raw wins", () => {
      expect(decodeFhDisplay(encFhScore(70, 5, false)) === 70).toBe(true);
    });
    it("bonus outranks same-wins no-bonus", () => {
      expect(encFhScore(70, 5, true) > encFhScore(70, 5, false)).toBe(true);
    });
    it("70x1.05=73.5 outranks raw 73", () => {
      expect(encFhScore(70, 5, true) > encFhScore(73, 9, false)).toBe(true);
    });
    it("raw 74 outranks 73.5 despite net", () => {
      expect(encFhScore(74, -20, false) > encFhScore(70, 50, true)).toBe(true);
    });
    it("net breaks ties", () => {
      expect(encFhScore(70, 8.4, false) > encFhScore(70, 8.1, false)).toBe(true);
    });
    it("82x1.05 = 86.1 (clamped net can't bleed into wins)", () => {
      expect(decodeFhDisplay(encFhScore(82, 200, true)) === 86.1).toBe(true);
    });
    it("floor case decodes", () => {
      expect(decodeFhDisplay(encFhScore(0, -100, false)) === 0).toBe(true);
    });
  });
});
