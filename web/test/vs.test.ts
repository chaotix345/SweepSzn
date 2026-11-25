import { describe, it, expect } from "vitest";
import { getPlayersByIds } from "@/lib/data";
import { teamSeason } from "@/lib/teamLookup";
import { SLOTS } from "@/lib/teams";
import { VS_MATCHUPS, sideLabel } from "@/lib/vs";
import { vsView, vsStaticParams, vsMetadata, vsJsonLd, vsIndexJsonLd, vsVerdict, vsOgCard, type VsSideView } from "@/lib/vsServer";
import * as indexPage from "@/app/(site)/vs/page";
import * as matchupPage from "@/app/(site)/vs/[slug]/page";
import sitemap from "@/app/sitemap";
import { baseUrl } from "@/lib/site";

describe("curated /vs matchups", () => {
  it("has 10-20 matchups with unique, url-safe slugs", () => {
    expect(VS_MATCHUPS.length).toBeGreaterThanOrEqual(10);
    expect(VS_MATCHUPS.length).toBeLessThanOrEqual(20);
    const slugs = VS_MATCHUPS.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z]+-\d{4}-vs-[a-z]+-\d{4}$/);
  });

  for (const m of VS_MATCHUPS) {
    describe(m.slug, () => {
      for (const side of [m.a, m.b]) {
        it(`${sideLabel(side)}: 5 existing cards, one per real person, each eligible at its slot`, () => {
          expect(side.ids).toHaveLength(5);
          const players = getPlayersByIds(side.ids);
          const missing = side.ids.filter((id) => !players.some((p) => p.id === id));
          expect(missing, `missing card ids: ${missing.join(", ")}`).toEqual([]);
          expect(new Set(players.map((p) => p.person_id ?? p.id)).size).toBe(5);
          side.ids.forEach((id, i) => {
            const p = players.find((x) => x.id === id)!;
            expect(p.team, id).toBe(side.team);
            expect(p.eligible ?? [p.pos], `${id} at ${SLOTS[i]}`).toContain(SLOTS[i]);
          });
        });

        it(`${sideLabel(side)}: real record matches team_lookup.json`, () => {
          const t = teamSeason(side.teamName, side.year);
          expect(t, `${side.teamName} ${side.year}`).not.toBeNull();
          expect(`${t!.w}-${t!.l}`).toBe(side.record);
        });
      }

      it("both sides evaluate to a full 82-game record", () => {
        const v = vsView(m.slug)!;
        expect(v).not.toBeNull();
        for (const s of [v.a, v.b]) {
          expect(s.result.wins + s.result.losses).toBe(82);
          expect(s.result.factors.length).toBeGreaterThan(0);
          expect(s.slots.map((x) => x.slot)).toEqual(SLOTS);
        }
        expect(v.verdict).toContain(`${v.a.result.wins}-${v.a.result.losses}`);
        expect(v.verdict).toContain(`${v.b.result.wins}-${v.b.result.losses}`);
      });
    });
  }

  it("returns null for an unknown slug", () => {
    expect(vsView("nope-2000-vs-nada-2001")).toBeNull();
    expect(vsMetadata("nope-2000-vs-nada-2001")).toBeNull();
    expect(vsOgCard("nope-2000-vs-nada-2001")).toBeNull();
  });
});

describe("vsVerdict", () => {
  const side = (label: string, wins: number, netRtg: number) =>
    ({ label, result: { wins, losses: 82 - wins, netRtg } }) as unknown as VsSideView;
  it("names the five with more projected wins and the margin", () => {
    expect(vsVerdict(side("A", 70, 12), side("B", 67, 10))).toMatch(/so the A five rates 3 wins better\.$/);
    expect(vsVerdict(side("A", 60, 5), side("B", 61, 6))).toMatch(/so the B five rates 1 win better\.$/);
  });
  it("breaks a wins tie on net rating, and calls an exact tie even", () => {
    expect(vsVerdict(side("A", 70, 12.4), side("B", 70, 12.9))).toMatch(/B five ahead on net rating \(\+12\.9 vs \+12\.4\)/);
    expect(vsVerdict(side("A", 70, 12), side("B", 70, 12))).toMatch(/dead even/);
  });
});

describe("/vs pages", () => {
  it("statically generates exactly the curated slugs and 404s the rest", async () => {
    const params = await matchupPage.generateStaticParams();
    expect(params).toEqual(vsStaticParams());
    expect(params.map((p) => p.slug)).toEqual(VS_MATCHUPS.map((m) => m.slug));
    expect(matchupPage.dynamicParams).toBe(false);
  });

  it("builds per-matchup metadata with canonical, siteName and both records", async () => {
    const m = VS_MATCHUPS[0];
    const md = await matchupPage.generateMetadata({ params: Promise.resolve({ slug: m.slug }) });
    const v = vsView(m.slug)!;
    expect(md.alternates?.canonical).toBe(`/vs/${m.slug}`);
    expect((md.openGraph as { siteName?: string }).siteName).toBe("SweepSzn");
    expect(String(md.description)).toContain(v.verdict);
    expect(String(md.title)).toMatch(/1995-96 Bulls vs 2015-16 Warriors/);
    expect(await matchupPage.generateMetadata({ params: Promise.resolve({ slug: "xyz" }) })).toEqual({});
  });

  it("index has canonical metadata", () => {
    expect(indexPage.metadata.alternates?.canonical).toBe("/vs");
  });

  it("sitemap lists /vs and every matchup", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(`${baseUrl}/vs`);
    for (const m of VS_MATCHUPS) expect(urls).toContain(`${baseUrl}/vs/${m.slug}`);
  });

  it("JSON-LD: breadcrumb + WebPage about two SportsTeams with five athletes each", () => {
    const ld = vsJsonLd(VS_MATCHUPS[0].slug) as { "@graph": Record<string, unknown>[] };
    const page = ld["@graph"].find((n) => n["@type"] === "WebPage") as { about: { "@type": string; athlete: unknown[] }[] };
    expect(page.about).toHaveLength(2);
    for (const t of page.about) {
      expect(t["@type"]).toBe("SportsTeam");
      expect(t.athlete).toHaveLength(5);
    }
    const list = (vsIndexJsonLd() as { "@graph": Record<string, unknown>[] })["@graph"].find((n) => n["@type"] === "ItemList") as { numberOfItems: number; itemListElement: { position: number; url: string }[] };
    expect(list.numberOfItems).toBe(VS_MATCHUPS.length);
    expect(list.itemListElement.map((x) => x.position)).toEqual(VS_MATCHUPS.map((_, i) => i + 1));
  });
});
