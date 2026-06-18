import { describe, it, expect } from "vitest";
import { decadeEraContext } from "@/lib/leagueContext";

// decadeEraContext reads the real public/data/league_context.json (no runtime reader existed before).
// It aggregates the per-season league averages into one descriptive snapshot per draftable decade.
describe("decadeEraContext (reads league_context.json)", () => {
  it("returns a populated snapshot for a modern decade", () => {
    const c = decadeEraContext("2010s");
    expect(c).not.toBeNull();
    expect(c!.decade).toBe("2010s");
    expect(c!.label).toContain("2010s");
    expect(typeof c!.pace).toBe("number");
    expect(c!.pace as number).toBeGreaterThan(80);
  });

  it("classifies the 3pt era from the decade midpoint year", () => {
    expect(decadeEraContext("1960s")!.era3pt.key).toBe("pre");
    expect(decadeEraContext("1980s")!.era3pt.key).toBe("early");
    expect(decadeEraContext("1990s")!.era3pt.key).toBe("modern");
    expect(decadeEraContext("2010s")!.era3pt.key).toBe("three_ball");
  });

  it("exposes a scoring-environment number (decade-average qualified PPG)", () => {
    const c = decadeEraContext("1980s");
    expect(c!.ppgEnv).not.toBeNull();
    expect(c!.ppgEnv as number).toBeGreaterThan(0);
  });

  it("returns null for a decade with no league data", () => {
    expect(decadeEraContext("PRIME")).toBeNull();
    expect(decadeEraContext("1800s")).toBeNull();
  });
});
