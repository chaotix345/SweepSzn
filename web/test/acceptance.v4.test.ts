import { describe, it, expect } from "vitest";
import { PLAYERS, spreadSD } from "./engineData";

// Pre-v4 baseline (2026-11-25): SD of wins over randomLineups(2000, 7) on the v3 engine.
const SPREAD_BASELINE = 10.9;

describe("v4 acceptance: spread", () => {
  it("random-lineup wins spread is not flattened", () => {
    const sd = spreadSD();
    console.log(`spreadSD=${sd.toFixed(3)}`);
    if (!Number.isNaN(SPREAD_BASELINE)) expect(sd).toBeGreaterThanOrEqual(SPREAD_BASELINE);
  });
});

describe("v4 acceptance: card identity and ratings", () => {
  it("card id set is unchanged from v3", async () => {
    const v3: string[] = (await import("./fixtures/card_ids_v3.json")).default;
    expect([...PLAYERS.map((p) => p.id)].sort()).toEqual(v3);
  });

  it("every card has finite off_rating and def_rating", () => {
    const bad = PLAYERS.filter((p) => !Number.isFinite(p.off_rating) || !Number.isFinite(p.def_rating));
    expect(bad.map((p) => p.id).slice(0, 5)).toEqual([]);
  });
});
