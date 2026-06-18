import { describe, it, expect } from "vitest";
import { accoladeLine, careerJourney, accoladesFor } from "@/lib/playerMeta";
import type { Player } from "@/lib/types";

// Player dossier data: real accolade counts + career arc. All descriptive biography — who the player
// was — never an engine/fit signal (DESIGN.md §12).
describe("accoladeLine", () => {
  it("orders MVP, All-Star, All-NBA, All-Defense and notes first-team count", () => {
    expect(accoladeLine({ as: 14, mvp: 5, anba: 11, anba1: 10, adef: 9 }))
      .toBe("5× MVP · 14× All-Star · 11× All-NBA (10 1st) · 9× All-Defense");
  });
  it("omits empty categories and the 1st-team note when zero", () => {
    expect(accoladeLine({ as: 1, mvp: 0, anba: 2, anba1: 0, adef: 0 }))
      .toBe("1× All-Star · 2× All-NBA");
  });
  it("returns empty string when there are no accolades", () => {
    expect(accoladeLine({ as: 0, mvp: 0, anba: 0, anba1: 0, adef: 0 })).toBe("");
  });
});

describe("careerJourney", () => {
  const v = (team: string, decade: string, id: string, vorp = 0): Player =>
    ({ id, person_id: "x", name: "X", year: 2000, decade, tier: "complete", team, pos: "SF", vorp } as Player);
  it("lists unique team+decade stints chronologically and marks the single peak", () => {
    const j = careerJourney([
      v("MIA", "2010s", "a", 5), v("CLE", "2000s", "b", 8), v("CLE", "2000s", "b2", 3), v("LAL", "2010s", "c", 4),
    ]);
    expect(j.map((s) => `${s.team} ${s.decade}`)).toEqual(["CLE 2000s", "MIA 2010s", "LAL 2010s"]);
    expect(j.find((s) => s.team === "CLE")!.peak).toBe(true);
    expect(j.filter((s) => s.peak)).toHaveLength(1);
  });
  it("returns empty for no variants", () => {
    expect(careerJourney([])).toEqual([]);
  });
});

describe("accoladesFor (reads accolades.json)", () => {
  it("returns real counts for a famous person", () => {
    const a = accoladesFor("michael_jordan");
    expect(a).not.toBeNull();
    expect(a!.mvp).toBeGreaterThanOrEqual(4);
    expect(a!.as).toBeGreaterThanOrEqual(10);
  });
  it("returns null for an unknown person", () => {
    expect(accoladesFor("nobody_unknown_xyz")).toBeNull();
  });
});
