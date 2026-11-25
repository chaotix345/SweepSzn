import { describe, it, expect } from "vitest";
import { heroExample, HERO_IDS, HERO_SHORT_NAMES } from "./heroExample";

describe("heroExample — the landing page's live example five", () => {
  it("resolves all five players and a real engine result", () => {
    const h = heroExample();
    expect(h.players.map((p) => p.id)).toEqual(HERO_IDS);
    expect(h.result.wins + h.result.losses).toBe(82);
    expect(h.chips.map((c) => c.slot)).toEqual(["PG", "SG", "SF", "PF", "C"]);
    expect(HERO_SHORT_NAMES).toHaveLength(5);
  });

  it("reports the usage-overload penalty straight from the engine factors (negative, matches the card)", () => {
    const h = heroExample();
    const f = h.result.factors.find((x) => x.label.startsWith("Usage overload"));
    expect(h.usageOverload).toBe(f ? f.value : null);
    expect(h.usageOverload).not.toBeNull();
    expect(h.usageOverload!).toBeLessThan(0);
  });
});
