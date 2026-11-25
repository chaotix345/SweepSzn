import "server-only";
import type { Metadata } from "next";
import { getCoefficients, getPlayersByIds } from "./data";
import { evaluateLineup } from "./engine";
import { fmtNet } from "./explain";
import type { MarketingOgCard } from "./marketingMeta";
import { getEngineMeta } from "./receipts";
import { encodeLineup } from "./share";
import { baseUrl, SITE_NAME, X_HANDLE } from "./site";
import { SLOTS } from "./teams";
import type { LineupResult, Player, Slot } from "./types";
import { breadcrumbLd, jsonLdHtml } from "./jsonLd";
import {
  VS_MATCHUPS, matchupShort, matchupTitle, seasonLabel, sideLabel, sideShort, vsMatchup, vsPath,
  type VsMatchup, type VsSide,
} from "./vs";

// Server side of the /vs pages: each side's exact five scored by the real engine. Read at build time
// only (the pages are generateStaticParams with dynamicParams=false). Descriptive and post-commit
// like /teams and /r/: fixed, fully-drafted fives (DESIGN.md §12).

export interface VsSideView {
  side: VsSide;
  label: string;
  short: string;
  slots: { slot: Slot; player: Player }[];
  result: LineupResult;
  href: string; // the same five as a /r/ result card
}
export interface VsView { m: VsMatchup; title: string; short: string; a: VsSideView; b: VsSideView; verdict: string }

function sideView(side: VsSide): VsSideView | null {
  const players = getPlayersByIds(side.ids);
  if (players.length !== 5) return null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const ordered = side.ids.map((id) => byId.get(id)!);
  return {
    side,
    label: sideLabel(side),
    short: sideShort(side),
    slots: ordered.map((player, i) => ({ slot: SLOTS[i], player })),
    result: evaluateLineup(ordered, getCoefficients()),
    href: `/r/${encodeLineup(side.ids)}`,
  };
}

const rec = (r: LineupResult) => `${r.wins}-${r.losses}`;

// The quotable one-line answer: both projections and which five the engine rates higher.
export function vsVerdict(a: VsSideView, b: VsSideView): string {
  const head = `SweepSzn's engine projects the ${a.label} starting five at ${rec(a.result)} and the ${b.label} at ${rec(b.result)} over an 82-game season`;
  const diff = a.result.wins - b.result.wins;
  if (diff !== 0) {
    const [hi, n] = diff > 0 ? [a, diff] : [b, -diff];
    return `${head}, so the ${hi.label} five rates ${n} ${n === 1 ? "win" : "wins"} better.`;
  }
  const net = a.result.netRtg - b.result.netRtg;
  if (Math.abs(net) < 0.05) return `${head}: dead even, down to the net rating.`;
  const [hi, lo] = net > 0 ? [a, b] : [b, a];
  return `${head}: level on wins, with the ${hi.label} five ahead on net rating (${fmtNet(hi.result.netRtg)} vs ${fmtNet(lo.result.netRtg)}).`;
}

const views = new Map<string, VsView | null>();
export function vsView(slug: string): VsView | null {
  if (views.has(slug)) return views.get(slug)!;
  const m = vsMatchup(slug);
  const a = m && sideView(m.a);
  const b = m && sideView(m.b);
  const v = m && a && b ? { m, title: matchupTitle(m), short: matchupShort(m), a, b, verdict: vsVerdict(a, b) } : null;
  views.set(slug, v);
  return v;
}

export function vsStaticParams(): { slug: string }[] {
  return VS_MATCHUPS.map((m) => ({ slug: m.slug }));
}

export function fantasyNote(): string {
  const meta = getEngineMeta();
  return `A fantasy simulation, not a replay of history. Each side is that team's real starting five, drafted as SweepSzn cards: a card is the player's season with that franchise in that decade, so its year can differ from the matchup season. The engine projects each five's 82-game record on its own; it does not play them against each other. Its published accuracy (about ${meta.cv_wins_rmse.toFixed(1)} wins on ${meta.team_seasons.toLocaleString("en-US")} real team-seasons) is measured on real rosters with their actual seasons, which is a different test from this one.`;
}

// --- metadata / OG card / JSON-LD ---

function share(title: string, ogTitle: string, description: string, canonical: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title: ogTitle, description, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary_large_image", title: ogTitle, description, site: X_HANDLE, creator: X_HANDLE },
  };
}

const INDEX_TITLE = "Famous NBA team debates, settled by an engine";
const INDEX_DESCRIPTION =
  `${VS_MATCHUPS.length} famous NBA matchups, from the '96 Bulls vs the '16 Warriors to Russell's Celtics vs Wilt's 76ers: each real starting five scored over 82 games by the SweepSzn engine, with the factors behind each record. A fantasy simulation.`;

export function vsIndexMetadata(): Metadata {
  return share(`${INDEX_TITLE} · ${SITE_NAME}`, INDEX_TITLE, INDEX_DESCRIPTION, "/vs");
}

export function vsMetadata(slug: string): Metadata | null {
  const v = vsView(slug);
  if (!v) return null;
  const title = `${v.title}: who wins? · ${SITE_NAME}`;
  const ogTitle = `${v.short}: ${rec(v.a.result)} vs ${rec(v.b.result)}`;
  return share(title, ogTitle, `${v.verdict} A fantasy sim with the factors behind each record.`, vsPath(slug));
}

export const VS_INDEX_CARD: MarketingOgCard = {
  eyebrow: "Head to head",
  title: "Famous NBA team debates, settled",
  sub: "Real starting fives from the greatest teams, each scored over 82 games by the SweepSzn engine.",
  chips: [`${VS_MATCHUPS.length} matchups`, "Real starting fives", "Fantasy sim"],
  cta: "Pick a side →",
};

export function vsOgCard(slug: string): MarketingOgCard | null {
  const v = vsView(slug);
  if (!v) return null;
  const line = (s: VsSideView) => `${s.short} ${rec(s.result)} (${s.result.grade})`;
  return {
    eyebrow: "Head to head · fantasy sim",
    title: v.short,
    sub: `${line(v.a)} vs ${line(v.b)}: each real starting five scored over 82 games by the SweepSzn engine.`,
    chips: [`Real: ${v.a.side.record} vs ${v.b.side.record}`, "Factor breakdown"],
    cta: "Who wins? →",
  };
}

const teamLd = (s: VsSideView) => ({
  "@type": "SportsTeam",
  name: s.side.teamName,
  sport: "Basketball",
  description: `${seasonLabel(s.side.year)} starting five (real record ${s.side.record})`,
  athlete: s.slots.map(({ player }) => ({ "@type": "Person", name: player.name })),
});

export function vsJsonLd(slug: string): object | null {
  const v = vsView(slug);
  if (!v) return null;
  return {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([["Home", ""], ["Head to head", "/vs"], [v.title, vsPath(slug)]]),
      { "@type": "WebPage", name: v.title, url: `${baseUrl}${vsPath(slug)}`, description: v.verdict, about: [teamLd(v.a), teamLd(v.b)] },
    ],
  };
}
export const vsJsonLdHtml = (slug: string) => {
  const o = vsJsonLd(slug);
  return o ? jsonLdHtml(o) : null;
};

export function vsIndexJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([["Home", ""], ["Head to head", "/vs"]]),
      {
        "@type": "ItemList",
        name: INDEX_TITLE,
        numberOfItems: VS_MATCHUPS.length,
        itemListElement: VS_MATCHUPS.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: matchupTitle(m), url: `${baseUrl}${vsPath(m.slug)}` })),
      },
    ],
  };
}
