import { describe, it, expect, vi } from "vitest";

// A release key with no date in POOL_RELEASES (e.g. a players.json shipped ahead of its go-live
// constant): its `since` cards stay out of every pool, but its `until` cards are never retired.
vi.mock("@/lib/poolDate", async (orig) => ({
  ...(await orig<typeof import("@/lib/poolDate")>()),
  releaseDate: () => null,
}));

import { getAllPlayers, getDraftablePool, getLatestPlayers, getPersonVariants } from "@/lib/data";
import { FRANCHISES, DECADES } from "@/lib/teams";

const ALL = getAllPlayers();
const NEW = ALL.filter((p) => p.since);
const OLD = ALL.filter((p) => p.until && FRANCHISES.includes(p.team) && (DECADES as readonly string[]).includes(p.decade));

describe("unknown release keys", () => {
  it.each(["2020-01-01", "2026-11-26", "2026-11-27", "2030-01-01"])("on %s: no since cards, every until card", (asOf) => {
    const ids = new Set(getDraftablePool(false, 1e6, asOf).map((p) => p.id));
    expect(OLD.length).toBeGreaterThan(0);
    expect(OLD.every((p) => ids.has(p.id))).toBe(true);
    expect(NEW.some((p) => ids.has(p.id))).toBe(false);
  });

  it("the latest pool and person variants keep the legacy cards", () => {
    const latest = new Set(getLatestPlayers().map((p) => p.id));
    expect(OLD.every((p) => latest.has(p.id))).toBe(true);
    expect(NEW.some((p) => latest.has(p.id))).toBe(false);
    expect(getPersonVariants(OLD[0].person_id!).some((p) => p.id === OLD[0].id)).toBe(true);
  });
});
