// Guard against a stale calibration script writing an incompatible coefficients.json.
// Validates every key the engine reads, with type and numeric sanity bounds.
// This file should NEVER be changed unless the Coefficients type itself changes.
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Coefficients } from "./types";

const DATA_DIR = path.join(process.cwd(), "public", "data");

let raw: Record<string, unknown>;

beforeAll(() => {
  const json = fs.readFileSync(path.join(DATA_DIR, "coefficients.json"), "utf-8");
  raw = JSON.parse(json) as Record<string, unknown>;
});

function num(key: string): number {
  return raw[key] as number;
}
function subnum(parent: string, key: string): number {
  return (raw[parent] as Record<string, unknown>)[key] as number;
}

describe("coefficients.json — structural completeness", () => {
  // Top-level scalar keys
  const SCALAR_KEYS: Array<keyof Coefficients> = [
    "ortgBase", "drtgBase", "offScale", "defScale", "pythK", "zCap",
    "defEstCap", "dwsShrinkK", "leagueDwsMean", "usageBudget", "overloadGamma",
    "noRimPenalty", "thinPerimeterPenalty",
  ];

  for (const key of SCALAR_KEYS) {
    it(`has numeric key: ${key}`, () => {
      expect(raw).toHaveProperty(key);
      expect(typeof raw[key]).toBe("number");
      expect(Number.isFinite(raw[key] as number)).toBe(true);
    });
  }

  // Nested object keys
  const OBJECT_KEYS: Array<keyof Coefficients> = [
    "eraStrength", "offModel", "defModel", "defModelEst", "usgModel", "spacing", "rim",
  ];

  for (const key of OBJECT_KEYS) {
    it(`has object key: ${key}`, () => {
      expect(raw).toHaveProperty(key);
      expect(typeof raw[key]).toBe("object");
      expect(raw[key]).not.toBeNull();
    });
  }
});

describe("coefficients.json — eraStrength shape", () => {
  it("has floor (number)", () => expect(typeof subnum("eraStrength", "floor")).toBe("number"));
  it("has gamma (number)", () => expect(typeof subnum("eraStrength", "gamma")).toBe("number"));
  it("has startYear (number)", () => expect(typeof subnum("eraStrength", "startYear")).toBe("number"));
  it("has fullYear (number)", () => expect(typeof subnum("eraStrength", "fullYear")).toBe("number"));
  it("floor in [0, 1]", () => {
    const v = subnum("eraStrength", "floor");
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
  it("startYear < fullYear", () =>
    expect(subnum("eraStrength", "startYear")).toBeLessThan(subnum("eraStrength", "fullYear")));
  it("fullYear <= current era", () =>
    expect(subnum("eraStrength", "fullYear")).toBeLessThanOrEqual(2000));
});

describe("coefficients.json — offModel shape", () => {
  const KEYS = ["intercept", "pts", "ast", "ts"] as const;
  for (const k of KEYS) {
    it(`offModel.${k} is number`, () => expect(typeof subnum("offModel", k)).toBe("number"));
  }
});

describe("coefficients.json — defModel shape", () => {
  // defModel is retained for reference but NOT used by the engine (defModelEst is used for pre-74).
  // We still require it to be structurally complete so the file stays in sync with the type.
  const KEYS = ["intercept", "dws", "trb", "posC", "posPF", "posSF", "posSG"] as const;
  for (const k of KEYS) {
    it(`defModel.${k} is number`, () => expect(typeof subnum("defModel", k)).toBe("number"));
  }
});

describe("coefficients.json — defModelEst shape", () => {
  const KEYS = ["intercept", "dws", "posC", "posPF", "posSF", "posSG"] as const;
  for (const k of KEYS) {
    it(`defModelEst.${k} is number`, () => expect(typeof subnum("defModelEst", k)).toBe("number"));
  }
});

describe("coefficients.json — usgModel shape", () => {
  const KEYS = ["intercept", "pts", "ast"] as const;
  for (const k of KEYS) {
    it(`usgModel.${k} is number`, () => expect(typeof subnum("usgModel", k)).toBe("number"));
  }
});

describe("coefficients.json — spacing shape", () => {
  const KEYS = ["perShooter", "diminish", "noneFloor", "baseline"] as const;
  for (const k of KEYS) {
    it(`spacing.${k} is number`, () => expect(typeof subnum("spacing", k)).toBe("number"));
  }
});

describe("coefficients.json — rim shape", () => {
  const KEYS = ["blkLo", "blkSpan", "trbProxyLo", "trbProxySpan"] as const;
  for (const k of KEYS) {
    it(`rim.${k} is number`, () => expect(typeof subnum("rim", k)).toBe("number"));
  }
});

describe("coefficients.json — numeric sanity bounds", () => {
  // ortgBase and drtgBase must be plausible NBA-era ratings (roughly 85–120)
  it("ortgBase in [90, 120]", () => {
    const v = num("ortgBase"); expect(v).toBeGreaterThanOrEqual(90); expect(v).toBeLessThanOrEqual(120);
  });
  it("drtgBase in [90, 120]", () => {
    const v = num("drtgBase"); expect(v).toBeGreaterThanOrEqual(90); expect(v).toBeLessThanOrEqual(120);
  });

  // Pythagorean exponent: typical NBA fit range 10..18
  it("pythK in [10, 20]", () => {
    const v = num("pythK"); expect(v).toBeGreaterThanOrEqual(10); expect(v).toBeLessThanOrEqual(20);
  });

  // zCap: reasonable z-score cap (2.5–4.5)
  it("zCap in [2, 5]", () => {
    const v = num("zCap"); expect(v).toBeGreaterThanOrEqual(2); expect(v).toBeLessThanOrEqual(5);
  });

  // offScale / defScale: BPM-to-rating multipliers (positive, roughly 0.3–1.5)
  it("offScale positive", () => expect(num("offScale")).toBeGreaterThan(0));
  it("defScale positive", () => expect(num("defScale")).toBeGreaterThan(0));
  it("offScale in [0.2, 2.0]", () => {
    const v = num("offScale"); expect(v).toBeGreaterThanOrEqual(0.2); expect(v).toBeLessThanOrEqual(2.0);
  });
  it("defScale in [0.2, 2.0]", () => {
    const v = num("defScale"); expect(v).toBeGreaterThanOrEqual(0.2); expect(v).toBeLessThanOrEqual(2.0);
  });

  // defEstCap: pre-1974 DBPM ceiling — should be positive and below ~10
  it("defEstCap in [2, 10]", () => {
    const v = num("defEstCap"); expect(v).toBeGreaterThanOrEqual(2); expect(v).toBeLessThanOrEqual(10);
  });

  // usageBudget: total usage for 5 players (5 * ~20 base = 100)
  it("usageBudget in [80, 120]", () => {
    const v = num("usageBudget"); expect(v).toBeGreaterThanOrEqual(80); expect(v).toBeLessThanOrEqual(120);
  });

  // overloadGamma: penalty per percentage point over budget (small positive)
  it("overloadGamma positive", () => expect(num("overloadGamma")).toBeGreaterThan(0));
  it("overloadGamma < 1", () => expect(num("overloadGamma")).toBeLessThan(1));

  // noRimPenalty: penalty for no interior presence (0–15 reasonable range)
  it("noRimPenalty in [0, 15]", () => {
    const v = num("noRimPenalty"); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(15);
  });

  // thinPerimeterPenalty: penalty for no perimeter defender (0–10)
  it("thinPerimeterPenalty in [0, 10]", () => {
    const v = num("thinPerimeterPenalty"); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(10);
  });

  // leagueDwsMean: typical DWS/g for an average player (small positive fraction)
  it("leagueDwsMean positive and small (< 0.1)", () => {
    const v = num("leagueDwsMean"); expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(0.1);
  });

  // dwsShrinkK: Bayesian prior weight (positive integer-ish)
  it("dwsShrinkK positive", () => expect(num("dwsShrinkK")).toBeGreaterThan(0));

  // spacing.noneFloor must be negative (it's a floor for no-spacing penalty)
  it("spacing.noneFloor is negative", () => expect(subnum("spacing", "noneFloor")).toBeLessThan(0));

  // rim spans must be positive
  it("rim.blkSpan positive", () => expect(subnum("rim", "blkSpan")).toBeGreaterThan(0));
  it("rim.trbProxySpan positive", () => expect(subnum("rim", "trbProxySpan")).toBeGreaterThan(0));
});

describe("coefficients.json — no unknown engine-read keys missing", () => {
  // This is the canonical list of keys the engine reads at runtime.
  // If a calibration script drops a key, this test catches it before the engine silently
  // falls back to DEFAULT_COEFFICIENTS (which would make the file's values meaningless).
  const REQUIRED: string[] = [
    "ortgBase", "drtgBase", "offScale", "defScale", "pythK", "zCap",
    "eraStrength", "offModel", "defModel", "defModelEst", "defEstCap",
    "dwsShrinkK", "leagueDwsMean", "usgModel", "usageBudget", "overloadGamma",
    "spacing", "rim", "noRimPenalty", "thinPerimeterPenalty",
  ];

  for (const key of REQUIRED) {
    it(`required key present: ${key}`, () => {
      expect(raw).toHaveProperty(key);
    });
  }
});
