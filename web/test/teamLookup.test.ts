import { describe, it, expect } from "vitest";
import { teamSeason } from "@/lib/teamLookup";
import { historyAnchor } from "@/lib/explain";

describe("teamLookup — real franchise-season ratings reader", () => {
  it("looks up a team-season by name + year", () => {
    const t = teamSeason("Chicago Bulls", 1996);
    expect(t).not.toBeNull();
    expect(t!.w).toBe(72);
    expect(t!.l).toBe(10);
    expect(t!.ortg).toBeCloseTo(115.2, 1);
    expect(t!.drtg).toBeCloseTo(101.8, 1);
    expect(t!.nrtg).toBeCloseTo(13.4, 1);
  });

  it("returns null for an unknown team-season", () => {
    expect(teamSeason("Nonexistent Team", 1999)).toBeNull();
  });

  it("every history anchor's embedded ratings match the real team_lookup record (single source of truth)", () => {
    // one representative win total per anchor band
    for (const wins of [73, 69, 65, 60, 57, 50, 47, 42]) {
      const a = historyAnchor(wins)!;
      const real = teamSeason(a.name, a.year);
      expect(real, `${a.name} ${a.year} missing from team_lookup.json`).not.toBeNull();
      expect(a.ortg).toBeCloseTo(real!.ortg!, 1);
      expect(a.drtg).toBeCloseTo(real!.drtg!, 1);
      expect(a.nrtg).toBeCloseTo(real!.nrtg!, 1);
    }
  });
});
