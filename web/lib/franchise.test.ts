import { describe, it, expect } from "vitest";
import type { Player } from "./types";
import {
  STARTER_MPG, LEGENDS_PER_DECADE,
  compareFranchiseRank, pickAllTimeFive, rankLegends,
  franchiseAllTimeFive, franchiseLegends, franchiseFromSlug, franchisePath, franchiseFullName,
  teamsIndexMetadata, franchiseMetadata, franchiseOgCard, franchiseJsonLdHtml, teamsIndexJsonLdHtml,
} from "./franchise";
import { getPlayersByIds } from "./data";
import { compareSzn } from "./prime";
import { encodeLineup } from "./share";
import { resolveSharedLineup } from "./sharedLineup";
import { DECADES, FRANCHISES, SLOTS, eligibleOf } from "./teams";
import { WIN_GRADES } from "./engine";

const mk = (over: Partial<Player>): Player => ({
  id: "x", person_id: "x", name: "X", year: 2000, decade: "2000s", tier: "complete", team: "CHI", pos: "SF",
  eligible: ["SF"], mp: 36, fame: 0, peak_score: 0, ...over,
} as Player);

// Descriptive franchise pages (DESIGN.md §12): real stats + accolades + the engine's verdict on a FIXED
// five. The ordering reuses the draft board's public "Top" sort (compareSzn), starters first.
describe("compareFranchiseRank", () => {
  it("puts full-time starters ahead of a more famous cameo", () => {
    const cameo = mk({ id: "cameo", fame: 90, peak_score: 1, mp: STARTER_MPG - 5 });
    const starter = mk({ id: "starter", fame: 5, peak_score: 3, mp: STARTER_MPG + 2 });
    expect([cameo, starter].sort(compareFranchiseRank).map((p) => p.id)).toEqual(["starter", "cameo"]);
  });
  it("orders starters by the draft board's Top sort (compareSzn)", () => {
    const a = mk({ id: "a", fame: 10, peak_score: 2 });
    const b = mk({ id: "b", fame: 30, peak_score: 1 });
    const c = mk({ id: "c", fame: 5, peak_score: 9 });
    const sorted = [a, b, c].sort(compareFranchiseRank);
    expect(sorted.map((p) => p.id)).toEqual([a, b, c].sort(compareSzn).map((p) => p.id));
  });
  it("breaks exact ties by id so the order is total", () => {
    const x = mk({ id: "b_card" }), y = mk({ id: "a_card" });
    expect([x, y].sort(compareFranchiseRank).map((p) => p.id)).toEqual(["a_card", "b_card"]);
  });
});

describe("pickAllTimeFive (pure)", () => {
  const five = () => [
    mk({ id: "pg", person_id: "pg", pos: "PG", eligible: ["PG"], fame: 50 }),
    mk({ id: "sg", person_id: "sg", pos: "SG", eligible: ["SG"], fame: 40 }),
    mk({ id: "sf", person_id: "sf", pos: "SF", eligible: ["SF"], fame: 30 }),
    mk({ id: "pf", person_id: "pf", pos: "PF", eligible: ["PF"], fame: 20 }),
    mk({ id: "c", person_id: "c", pos: "C", eligible: ["C"], fame: 10 }),
  ];

  it("returns five cards in PG,SG,SF,PF,C order, each eligible at its slot", () => {
    const out = pickAllTimeFive([...five()].reverse())!;
    expect(out.map((s) => s.slot)).toEqual(SLOTS);
    expect(out.map((s) => s.card.id)).toEqual(["pg", "sg", "sf", "pf", "c"]);
  });

  it("uses one card per person (the higher-ranked variant)", () => {
    const pool = [
      ...five(),
      mk({ id: "pg_2010s", person_id: "pg", decade: "2010s", pos: "PG", eligible: ["PG"], fame: 50, peak_score: 9 }),
      mk({ id: "pg2", person_id: "pg2", pos: "PG", eligible: ["PG"], fame: 1 }),
    ];
    const ids = pickAllTimeFive(pool)!.map((s) => s.card.id);
    expect(ids).toContain("pg_2010s");
    expect(ids).not.toContain("pg");
    expect(new Set(pickAllTimeFive(pool)!.map((s) => s.card.person_id)).size).toBe(5);
  });

  it("skips a higher-ranked player whose only slot is already filled", () => {
    const pool = [...five(), mk({ id: "pg_b", person_id: "pg_b", pos: "PG", eligible: ["PG"], fame: 45 })];
    const ids = pickAllTimeFive(pool)!.map((s) => s.card.id);
    expect(ids).toEqual(["pg", "sg", "sf", "pf", "c"]);
  });

  it("re-seats a multi-position star so a lesser specialist still fits (no greedy dead end)", () => {
    // the top player can play PG or C; the only other C-eligible player ranks below a PG-only star
    const pool = [
      mk({ id: "big", person_id: "big", pos: "C", eligible: ["PG", "C"], fame: 99 }),
      mk({ id: "pg", person_id: "pg", pos: "PG", eligible: ["PG"], fame: 80 }),
      mk({ id: "sg", person_id: "sg", pos: "SG", eligible: ["SG"], fame: 40 }),
      mk({ id: "sf", person_id: "sf", pos: "SF", eligible: ["SF"], fame: 30 }),
      mk({ id: "pf", person_id: "pf", pos: "PF", eligible: ["PF"], fame: 20 }),
    ];
    const out = pickAllTimeFive(pool)!;
    expect(out.map((s) => `${s.slot}:${s.card.id}`)).toEqual(["PG:pg", "SG:sg", "SF:sf", "PF:pf", "C:big"]);
  });

  it("falls back to a person's other card when their top card can't be seated", () => {
    // person "two" ranks first via a PG-only card, but PG is taken by a better-fitting lineup; their
    // second card (C-only) is the only way to fill C — the five must still come out legal
    const pool = [
      mk({ id: "two_pg", person_id: "two", pos: "PG", eligible: ["PG"], fame: 99 }),
      mk({ id: "two_c", person_id: "two", pos: "C", eligible: ["C"], fame: 99, mp: STARTER_MPG - 1 }),
      mk({ id: "pg", person_id: "pg", pos: "PG", eligible: ["PG"], fame: 90 }),
      mk({ id: "sg", person_id: "sg", pos: "SG", eligible: ["SG"], fame: 40 }),
      mk({ id: "sf", person_id: "sf", pos: "SF", eligible: ["SF"], fame: 30 }),
      mk({ id: "pf", person_id: "pf", pos: "PF", eligible: ["PF"], fame: 20 }),
    ];
    const out = pickAllTimeFive(pool)!;
    expect(out.map((s) => s.slot)).toEqual(SLOTS);
    expect(out.find((s) => s.slot === "C")!.card.id).toBe("two_c");
    expect(out.find((s) => s.slot === "PG")!.card.id).toBe("pg");
  });

  it("prefers seating a player at his listed position when either slot works", () => {
    // the higher-ranked player is the SG, so naive first-fit would seat him at PG
    const pool = [
      mk({ id: "sg", person_id: "sg", pos: "SG", eligible: ["PG", "SG"], fame: 50 }),
      mk({ id: "pg", person_id: "pg", pos: "PG", eligible: ["PG", "SG"], fame: 40 }),
      ...five().slice(2),
    ];
    const out = pickAllTimeFive(pool)!;
    expect(out.slice(0, 2).map((s) => s.card.id)).toEqual(["pg", "sg"]);
  });

  it("returns null when no slot-legal five exists in the pool", () => {
    expect(pickAllTimeFive(five().slice(0, 4))).toBeNull();
    expect(pickAllTimeFive(five().map((p) => ({ ...p, eligible: ["PG"] as Player["eligible"] })))).toBeNull();
    expect(pickAllTimeFive([])).toBeNull();
  });
});

describe("rankLegends (pure)", () => {
  it("groups by decade in chronological order, top N distinct people by rank", () => {
    const pool = [
      mk({ id: "a90", person_id: "a", decade: "1990s", fame: 9 }),
      mk({ id: "b90", person_id: "b", decade: "1990s", fame: 50 }),
      mk({ id: "c70", person_id: "c", decade: "1970s", fame: 5 }),
      mk({ id: "d90", person_id: "d", decade: "1990s", fame: 20, mp: 10 }),
    ];
    const out = rankLegends(pool, 2);
    expect(out.map((d) => d.decade)).toEqual(["1970s", "1990s"]);
    expect(out[1].cards.map((p) => p.id)).toEqual(["b90", "a90"]);
  });
  it("drops non-draftable decades and empty decades", () => {
    const out = rankLegends([mk({ id: "old", decade: "1950s" })]);
    expect(out).toEqual([]);
  });
});

describe("slugs and names", () => {
  it("round-trips every franchise through its lowercase /teams path", () => {
    for (const t of FRANCHISES) {
      expect(franchisePath(t)).toBe(`/teams/${t.toLowerCase()}`);
      expect(franchiseFromSlug(t.toLowerCase())).toBe(t);
    }
  });
  it("rejects unknown or non-canonical slugs", () => {
    expect(franchiseFromSlug("xyz")).toBeNull();
    expect(franchiseFromSlug("CHI")).toBeNull();
    expect(franchiseFromSlug("")).toBeNull();
  });
  it("has a city + nickname for all 30 franchises", () => {
    expect(franchiseFullName("CHI")).toBe("Chicago Bulls");
    expect(franchiseFullName("POR")).toBe("Portland Trail Blazers");
    expect(franchiseFullName("PHI")).toBe("Philadelphia 76ers");
    for (const t of FRANCHISES) expect(franchiseFullName(t).split(" ").length).toBeGreaterThanOrEqual(2);
  });
});

describe("franchiseAllTimeFive (real data)", () => {
  it("covers all 30 franchises", () => {
    expect(FRANCHISES).toHaveLength(30);
  });

  for (const team of FRANCHISES) {
    it(`${team}: five slot-legal, distinct-person, draftable players + a reproducible verdict`, () => {
      const five = franchiseAllTimeFive(team)!;
      expect(five).not.toBeNull();
      expect(five.team).toBe(team);
      expect(five.slots.map((s) => s.slot)).toEqual(SLOTS);
      expect(five.ids).toEqual(five.slots.map((s) => s.player.id));

      const cards = getPlayersByIds(five.ids);
      expect(cards).toHaveLength(5);
      expect(new Set(cards.map((p) => p.person_id)).size).toBe(5);
      cards.forEach((p, i) => {
        expect(p.team).toBe(team);
        expect(DECADES as readonly string[]).toContain(p.decade);
        expect(eligibleOf(p)).toContain(SLOTS[i]);
      });

      expect(five.record.wins + five.record.losses).toBe(82);
      expect(WIN_GRADES.map((g) => g.grade)).toContain(five.record.grade);
      expect(five.href).toBe(`/r/${encodeLineup(five.ids)}`);
      // the same verdict any visitor sees on the /r/ permalink
      const shared = resolveSharedLineup(five.href.slice("/r/".length))!;
      expect(shared.result.wins).toBe(five.record.wins);
      expect(shared.result.grade).toBe(five.record.grade);
    });
  }

  it("is deterministic", () => {
    expect(franchiseAllTimeFive("LAL")).toEqual(franchiseAllTimeFive("LAL"));
  });

  it("returns null for an unknown team", () => {
    expect(franchiseAllTimeFive("XYZ")).toBeNull();
    expect(franchiseAllTimeFive("chi")).toBeNull();
  });

  it("reads like real franchise history (Jordan starts for Chicago; no cameo stints)", () => {
    expect(franchiseAllTimeFive("CHI")!.ids.some((id) => id.startsWith("michael_jordan_chi"))).toBe(true);
    // Hakeem's 2001-02 Toronto season (22.6 mpg) is a cameo, not Raptors history
    expect(franchiseAllTimeFive("TOR")!.ids.some((id) => id.startsWith("hakeem"))).toBe(false);
  });

  it("carries display fields for each card (season, stats, accolade line)", () => {
    const mj = franchiseAllTimeFive("CHI")!.slots.find((s) => s.player.personId === "michael_jordan")!.player;
    expect(mj.name).toBe("Michael Jordan");
    expect(mj.season).toMatch(/^\d{4}–\d{2}$/);
    expect(mj.pts).toBeGreaterThan(0);
    expect(mj.accolades).toMatch(/MVP/);
  });
});

describe("franchiseLegends (real data)", () => {
  for (const team of FRANCHISES) {
    it(`${team}: per-decade lists of distinct people in rank order`, () => {
      const legends = franchiseLegends(team)!;
      expect(legends.length).toBeGreaterThan(0);
      const order = DECADES as readonly string[];
      const idx = legends.map((d) => order.indexOf(d.decade));
      expect(idx.every((v) => v >= 0)).toBe(true);
      expect(idx).toEqual([...idx].sort((a, b) => a - b));

      for (const d of legends) {
        expect(d.players.length).toBeGreaterThan(0);
        expect(d.players.length).toBeLessThanOrEqual(LEGENDS_PER_DECADE);
        expect(new Set(d.players.map((p) => p.personId)).size).toBe(d.players.length);
        const cards = getPlayersByIds(d.players.map((p) => p.id));
        expect(cards).toHaveLength(d.players.length);
        for (const c of cards) {
          expect(c.team).toBe(team);
          expect(c.decade).toBe(d.decade);
        }
        for (let i = 1; i < cards.length; i++) expect(compareFranchiseRank(cards[i - 1], cards[i])).toBeLessThan(0);
      }
    });
  }

  it("returns null for an unknown team", () => {
    expect(franchiseLegends("XYZ")).toBeNull();
  });
});

describe("metadata", () => {
  it("index: title, canonical, and re-carried openGraph/twitter identity", () => {
    const md = teamsIndexMetadata();
    expect(String(md.title)).toMatch(/all-time starting fives for every NBA franchise/i);
    expect(md.alternates?.canonical).toBe("/teams");
    const og = md.openGraph as { siteName?: string; type?: string; title?: string };
    expect(og.siteName).toBe("SweepSzn");
    expect(og.type).toBe("website");
    const tw = md.twitter as { card?: string; site?: string; creator?: string };
    expect(tw.card).toBe("summary_large_image");
    expect(tw.site).toBe("@SweepSeason");
    expect(tw.creator).toBe("@SweepSeason");
  });

  it("team: title, canonical, description naming the five, re-carried identity", () => {
    const md = franchiseMetadata("CHI")!;
    expect(String(md.title)).toContain("All-time Chicago Bulls starting five");
    expect(md.alternates?.canonical).toBe("/teams/chi");
    expect(md.description).toContain("Michael Jordan");
    const og = md.openGraph as { siteName?: string; type?: string };
    expect(og.siteName).toBe("SweepSzn");
    expect(og.type).toBe("website");
    const tw = md.twitter as { card?: string; site?: string; creator?: string };
    expect(tw.card).toBe("summary_large_image");
    expect(tw.site).toBe("@SweepSeason");
    expect(tw.creator).toBe("@SweepSeason");
  });

  it("keeps every team's share title within Twitter's ~70-char limit", () => {
    for (const t of FRANCHISES) {
      const og = franchiseMetadata(t)!.openGraph as { title?: string };
      expect(og.title!.length).toBeLessThanOrEqual(70);
    }
  });

  it("returns null metadata/card for an unknown team", () => {
    expect(franchiseMetadata("XYZ")).toBeNull();
    expect(franchiseOgCard("XYZ")).toBeNull();
  });

  it("builds a complete OG card per team", () => {
    const c = franchiseOgCard("CHI")!;
    expect(c.title).toContain("Chicago Bulls");
    expect(c.sub).toContain("Michael Jordan");
    expect(c.chips.length).toBeGreaterThanOrEqual(1);
    expect(c.chips.length).toBeLessThanOrEqual(4);
    expect(c.cta.trim().length).toBeGreaterThan(0);
  });
});

describe("JSON-LD", () => {
  it("team page: an escaped ItemList of the five plus a breadcrumb", () => {
    const html = franchiseJsonLdHtml("CHI")!;
    expect(html).not.toMatch(/[<>&]/);
    const ld = JSON.parse(html) as { "@graph": { "@type": string; itemListElement: { position: number; name: string }[] }[] };
    const list = ld["@graph"].find((n) => n["@type"] === "ItemList")!;
    expect(list.itemListElement).toHaveLength(5);
    expect(list.itemListElement.map((i) => i.position)).toEqual([1, 2, 3, 4, 5]);
    expect(ld["@graph"].some((n) => n["@type"] === "BreadcrumbList")).toBe(true);
    expect(franchiseJsonLdHtml("XYZ")).toBeNull();
  });

  it("index page: an escaped ItemList of all 30 franchise pages", () => {
    const html = teamsIndexJsonLdHtml();
    expect(html).not.toMatch(/[<>&]/);
    const ld = JSON.parse(html) as { "@type": string; itemListElement: { url: string }[] };
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.itemListElement).toHaveLength(30);
    expect(ld.itemListElement.some((i) => i.url.endsWith("/teams/chi"))).toBe(true);
  });
});
