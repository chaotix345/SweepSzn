import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { spinPool, spin, primeSpin, getDraftablePool, getPlayersByIds, getAllPlayers, getLatestPlayers, getFranchisePool, getPersonVariants } from "@/lib/data";
import { verifyTrace } from "@/lib/dailyVerify";
import { evaluateLineup } from "@/lib/engine";
import { eligibleOf } from "@/lib/teams";
import { POOL_RELEASES, SEASON_2026_SINCE, LEGACY_AS_OF, isoDay, isIsoDay, seedDay, resolveAsOf, releaseDate, legacyResultAsOf } from "@/lib/poolDate";
import type { DraftStep, Player, Slot } from "@/lib/types";

// Pool by date (W5, DESIGN.md §12): the 2025-26 release adds `since` cards and retires superseded
// cards with `until`, both keyed to SEASON_2026_SINCE. Runs on the committed players.json.

const ALL = getAllPlayers();
const NEW = ALL.filter((p) => p.since);
const OLD = ALL.filter((p) => p.until);
const BEFORE = LEGACY_AS_OF;
const AFTER = SEASON_2026_SINCE;
// undated seeds never use a future pinned day, so tests that pin AFTER run with the clock past it
const afterRelease = () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(Date.UTC(2026, 11, 15))); });
  afterAll(() => { vi.useRealTimers(); });
};

describe("lib/poolDate", () => {
  it("dates parse strictly", () => {
    expect(isIsoDay("2026-11-27")).toBe(true);
    for (const bad of ["2026-2-30", "2026-02-30", "2026-11-7", "x", 20261127, null]) expect(isIsoDay(bad)).toBe(false);
    expect(isoDay(new Date(Date.UTC(2026, 0, 5, 23, 59)))).toBe("2026-01-05");
  });

  it("the legacy day is the day before the release", () => {
    expect(LEGACY_AS_OF < SEASON_2026_SINCE).toBe(true);
    const next = new Date(Date.parse(`${LEGACY_AS_OF}T00:00:00Z`) + 86_400_000);
    expect(isoDay(next)).toBe(SEASON_2026_SINCE);
  });

  it("dated seeds carry their day", () => {
    expect(seedDay("daily-2026-6-9")).toBe("2026-06-09");
    expect(seedDay("fh-2026-11-27")).toBe("2026-11-27");
    expect(seedDay("bp-2026-1-1")).toBe("2026-01-01");
    expect(seedDay("surgeon-2026-12-31")).toBe("2026-12-31");
    for (const s of ["classic-123", "h2h-abc12345", "prime-9", "hoopiq-1", "daily-2026-2-30", "daily-x"]) expect(seedDay(s)).toBeNull();
  });

  it("resolveAsOf: a dated seed wins, then a real past pinned day, else today", () => {
    const now = new Date(Date.UTC(2026, 11, 1));
    expect(resolveAsOf("daily-2026-6-9", "2026-11-30", now)).toBe("2026-06-09");
    expect(resolveAsOf("classic-1", "2026-11-20", now)).toBe("2026-11-20");
    expect(resolveAsOf("classic-1", "2026-12-01", now)).toBe("2026-12-01");
    expect(resolveAsOf("classic-1", "2026-12-02", now)).toBe("2026-12-01"); // no peeking at future pools
    expect(resolveAsOf("classic-1", "garbage", now)).toBe("2026-12-01");
    expect(resolveAsOf("classic-1", undefined, now)).toBe("2026-12-01");
  });

  it("legacyResultAsOf: a saved result without a pool date maps to the pool it was played on", () => {
    const now = new Date(Date.UTC(2026, 11, 3));
    const release = Date.parse(`${SEASON_2026_SINCE}T00:00:00Z`);
    expect(legacyResultAsOf(release - 1, now)).toBe(LEGACY_AS_OF);
    expect(legacyResultAsOf(release, now)).toBe("2026-12-03");
    expect(legacyResultAsOf(undefined, now)).toBe("2026-12-03");
  });

  it("every release key in players.json has a date", () => {
    const keys = new Set(ALL.flatMap((p) => [p.since, p.until]).filter((k): k is string => !!k));
    expect(keys.size).toBeGreaterThan(0);
    for (const k of keys) expect(releaseDate(k), k).toBe(POOL_RELEASES[k]);
  });
});

describe("players.json release cards", () => {
  it("adds 2025-26 cards and supersedes some 2020s cards, each by a new card in the same bucket", () => {
    expect(NEW.length).toBeGreaterThan(100);
    expect(OLD.length).toBeGreaterThan(0);
    const bucket = (p: Player) => `${p.person_id}|${p.team}|${p.decade}`;
    const newBuckets = new Set(NEW.map(bucket));
    for (const p of OLD) expect(newBuckets.has(bucket(p)), p.id).toBe(true);
    for (const p of NEW) expect(p.year).toBe(2026);
  });

  it("superseded cards still resolve by id with their original numbers", () => {
    const [p] = getPlayersByIds([OLD[0].id]);
    expect(p).toBe(OLD[0]);
    expect(p.until).toBeTruthy();
    expect(Number.isFinite(p.off_rating)).toBe(true);
  });

  it("the latest pool swaps superseded cards for their successors", () => {
    const latest = new Set(getLatestPlayers().map((p) => p.id));
    for (const p of OLD) expect(latest.has(p.id)).toBe(false);
    for (const p of NEW) expect(latest.has(p.id)).toBe(true);
    const teamPool = new Set(getFranchisePool(NEW[0].team).map((p) => p.id));
    expect(teamPool.has(NEW[0].id)).toBe(true);
  });
});

describe("draftable pool by date", () => {
  afterRelease();
  it("before the release: exactly the pre-release pool (no new cards, every superseded card)", () => {
    const pool = getDraftablePool(false, 1e6, BEFORE);
    const ids = new Set(pool.map((p) => p.id));
    expect(NEW.some((p) => ids.has(p.id))).toBe(false);
    expect(OLD.every((p) => ids.has(p.id))).toBe(true);
    expect(pool.length).toBe(getDraftablePool(false, 1e6, "2020-01-01").length);
  });

  it("from the release day: new cards in, superseded cards out", () => {
    const ids = new Set(getDraftablePool(false, 1e6, AFTER).map((p) => p.id));
    expect(NEW.every((p) => ids.has(p.id))).toBe(true);
    expect(OLD.some((p) => ids.has(p.id))).toBe(false);
  });

  it("indexes are cached per pool epoch, not per day", () => {
    expect(getDraftablePool(false, 250, "2026-01-01")).toBe(getDraftablePool(false, 250, BEFORE));
    expect(getDraftablePool(false, 250, AFTER)).toBe(getDraftablePool(false, 250, "2027-06-01"));
    expect(getDraftablePool(true, 250, AFTER)).not.toBe(getDraftablePool(true, 250, BEFORE));
  });

  it("dated seeds use their own day; undated seeds use the pinned day", () => {
    const newIds = new Set(NEW.map((p) => p.id));
    const oldIds = new Set(OLD.map((p) => p.id));
    let sawNew = false;
    for (let d = 1; d <= 30; d++) {
      for (let r = 0; r < 5; r++) {
        const before = spinPool(`daily-2026-10-${d}`, r, { asOf: AFTER }); // pinned day is ignored for dated seeds
        expect(before.ids.some((id) => newIds.has(id))).toBe(false);
        const after = spinPool(`daily-2027-1-${d}`, r);
        expect(after.ids.some((id) => oldIds.has(id))).toBe(false);
        if (after.ids.some((id) => newIds.has(id))) sawNew = true;
      }
    }
    expect(sawNew).toBe(true);
    const a = spin("classic-77", 0, { asOf: BEFORE });
    expect(a.candidates.some((c) => newIds.has(c.id))).toBe(false);
    const prime = primeSpin("prime-77", 0, { asOf: AFTER });
    expect(prime.candidates.some((c) => oldIds.has(c.id))).toBe(false);
  });
});

describe("career journey variants follow the pool date", () => {
  // a person who gains a brand-new bucket in 2025-26 and also has older cards
  const fresh = NEW.find((n) => !n.until && ALL.some((p) => p.person_id === n.person_id && !p.since))!;
  const superseded = OLD[0];

  it("a 2025-26 stint is hidden before the release and shown from it", () => {
    expect(fresh).toBeTruthy();
    const pid = fresh.person_id!;
    expect(getPersonVariants(pid, BEFORE).some((p) => p.id === fresh.id)).toBe(false);
    expect(getPersonVariants(pid, BEFORE).length).toBeGreaterThan(0);
    expect(getPersonVariants(pid, AFTER).some((p) => p.id === fresh.id)).toBe(true);
  });

  it("superseded cards drop out of the journey from the release", () => {
    const pid = superseded.person_id!;
    expect(getPersonVariants(pid, BEFORE).some((p) => p.id === superseded.id)).toBe(true);
    expect(getPersonVariants(pid, AFTER).some((p) => p.id === superseded.id)).toBe(false);
  });

  it("defaults to today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(`${BEFORE}T12:00:00Z`));
      expect(getPersonVariants(fresh.person_id!).some((p) => p.id === fresh.id)).toBe(false);
      vi.setSystemTime(new Date(`${AFTER}T00:00:00Z`));
      expect(getPersonVariants(fresh.person_id!).some((p) => p.id === fresh.id)).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});

// Draft a legal five by taking the first eligible candidate each round on `asOf`'s pool.
function draft(seed: string, asOf: string): DraftStep[] {
  const trace: DraftStep[] = [];
  const used = new Set<Slot>();
  const exclude: string[] = [];
  for (let r = 0; r < 5; r++) {
    const { ids } = spinPool(seed, r, { exclude, asOf });
    let step: DraftStep | null = null;
    for (const id of ids) {
      const slot = eligibleOf(getPlayersByIds([id])[0]).find((s) => !used.has(s));
      if (slot) { step = { slot, pickedId: id, respins: [] }; break; }
    }
    if (!step) return [];
    used.add(step.slot); exclude.push(step.pickedId); trace.push(step);
  }
  return trace;
}

describe("verifyTrace replays the pool date it is given", () => {
  afterRelease();
  const deps = {
    spinPool,
    getPlayer: (id: string) => getPlayersByIds([id])[0],
    evaluate: (ps: Player[]) => evaluateLineup(ps),
  };
  const newIds = new Set(NEW.map((p) => p.id));

  it("a five drafted with new cards verifies on its day and is rejected on the pre-release pool", () => {
    let found = false;
    for (let i = 0; i < 400 && !found; i++) {
      const seed = `h2h-pool${i}`;
      const trace = draft(seed, AFTER);
      if (trace.length !== 5 || !trace.some((s) => newIds.has(s.pickedId))) continue;
      found = true;
      expect(verifyTrace(seed, trace, deps, AFTER).ok).toBe(true);
      expect(verifyTrace(seed, trace, deps, BEFORE).ok).toBe(false);
    }
    expect(found).toBe(true);
  });

  it("a pre-release five still verifies on its own day after the release", () => {
    const trace = draft("classic-legacy", BEFORE);
    expect(trace).toHaveLength(5);
    expect(verifyTrace("classic-legacy", trace, deps, BEFORE).ok).toBe(true);
  });
});
