import { describe, it, expect } from "vitest";
import { MARKETING_META, MARKETING_ROUTES, marketingMetadata } from "@/lib/marketingMeta";

// The four marketing routes that previously inherited the generic root OG card + title/description.
// Each now owns its share identity (per-page card + openGraph/twitter text); this pins that coverage
// and guards the share-card limits so a launch-seed link can't ship an empty or oversized card.
describe("MARKETING_META", () => {
  it("covers exactly the four inheriting marketing routes", () => {
    expect([...MARKETING_ROUTES].sort()).toEqual(["about", "dex", "how-it-works", "leaderboards"]);
    expect(Object.keys(MARKETING_META).sort()).toEqual(["about", "dex", "how-it-works", "leaderboards"]);
  });

  for (const route of MARKETING_ROUTES) {
    describe(route, () => {
      const meta = MARKETING_META[route];

      it("has a non-empty title, description, and shareable ogTitle", () => {
        expect(meta.title.trim().length).toBeGreaterThan(0);
        expect(meta.description.trim().length).toBeGreaterThan(20);
        expect(meta.ogTitle.trim().length).toBeGreaterThan(0);
      });

      it("keeps the ogTitle within Twitter's ~70-char title limit", () => {
        expect(meta.ogTitle.length).toBeLessThanOrEqual(70);
      });

      it("has a complete, sanely-sized OG card config", () => {
        const c = meta.card;
        expect(c.eyebrow.trim().length).toBeGreaterThan(0);
        expect(c.title.trim().length).toBeGreaterThan(0);
        expect(c.sub.trim().length).toBeGreaterThan(0);
        expect(c.cta.trim().length).toBeGreaterThan(0);
        expect(c.chips.length).toBeGreaterThanOrEqual(1);
        expect(c.chips.length).toBeLessThanOrEqual(4);
        for (const chip of c.chips) expect(chip.trim().length).toBeGreaterThan(0);
      });
    });
  }
});

describe("marketingMetadata", () => {
  for (const route of MARKETING_ROUTES) {
    describe(route, () => {
      const md = marketingMetadata(route);
      const meta = MARKETING_META[route];

      it("overrides title/description with the page-specific share text", () => {
        expect(md.title).toBe(meta.title);
        expect(md.description).toBe(meta.description);
        expect(md.openGraph?.title).toBe(meta.ogTitle);
        expect(md.openGraph?.description).toBe(meta.description);
        expect(md.twitter?.title).toBe(meta.ogTitle);
      });

      // A child openGraph/twitter REPLACES the root's object (Next shallow-merges per key), so the
      // helper must re-carry these or they'd silently drop on every marketing page.
      it("re-carries the root openGraph siteName/type so they aren't dropped", () => {
        const og = md.openGraph as { siteName?: string; type?: string };
        expect(og.siteName).toBe("SweepSzn");
        expect(og.type).toBe("website");
      });

      it("re-carries the root twitter card/site/creator so attribution isn't dropped", () => {
        const tw = md.twitter as { card?: string; site?: string; creator?: string };
        expect(tw.card).toBe("summary_large_image");
        expect(tw.site).toBe("@SweepSeason");
        expect(tw.creator).toBe("@SweepSeason");
      });
    });
  }
});
