import "server-only";
import type { Metadata } from "next";
import type { Player, Slot } from "./types";
import { getCoefficients, getFranchisePool } from "./data";
import { evaluateLineup } from "./engine";
import type { MarketingOgCard } from "./marketingMeta";
import { accoladeLine, accoladesFor } from "./playerMeta";
import { compareSzn } from "./prime";
import { encodeLineup } from "./share";
import { baseUrl, SITE_NAME, X_HANDLE } from "./site";
import { DECADES, FRANCHISES, SLOTS, displayName, eligibleOf, teamName } from "./teams";

// Franchise pages (/teams, /teams/<abbr>): answers to "all-time <team> starting five" searches built
// from real history. DESCRIPTIVE only (DESIGN.md §12): real box stats + real accolades, ordered by the
// draft board's public "Top" sort, plus the engine's verdict on one FIXED, fully-committed five — the
// same thing any /r/ permalink shows. Never fit grades, per-candidate deltas, or per-slot engine picks.

export const STARTER_MPG = 30;
export const LEGENDS_PER_DECADE = 5;

const CITY: Record<string, string> = {
  ATL: "Atlanta", BOS: "Boston", BKN: "Brooklyn", CHA: "Charlotte", CHI: "Chicago", CLE: "Cleveland",
  DAL: "Dallas", DEN: "Denver", DET: "Detroit", GSW: "Golden State", HOU: "Houston", IND: "Indiana",
  LAC: "Los Angeles", LAL: "Los Angeles", MEM: "Memphis", MIA: "Miami", MIL: "Milwaukee", MIN: "Minnesota",
  NOP: "New Orleans", NYK: "New York", OKC: "Oklahoma City", ORL: "Orlando", PHI: "Philadelphia",
  PHX: "Phoenix", POR: "Portland", SAC: "Sacramento", SAS: "San Antonio", TOR: "Toronto", UTA: "Utah",
  WAS: "Washington",
};

// Earlier homes whose seasons the data files under the current franchise (players carry the
// current-franchise `team`), so the Thunder page can honestly feature Seattle SuperSonics.
const FORMERLY: Record<string, string> = {
  ATL: "St. Louis Hawks", BKN: "New Jersey Nets", CHA: "Charlotte Bobcats",
  GSW: "Philadelphia and San Francisco Warriors", HOU: "San Diego Rockets",
  LAC: "Buffalo Braves and San Diego Clippers", MEM: "Vancouver Grizzlies", NOP: "New Orleans Hornets",
  OKC: "Seattle SuperSonics", PHI: "Syracuse Nationals", SAC: "Cincinnati Royals and Kansas City Kings",
  UTA: "New Orleans Jazz", WAS: "Baltimore and Washington Bullets",
};

export function franchisePath(team: string): string {
  return `/teams/${team.toLowerCase()}`;
}

export function franchiseFromSlug(slug: string): string | null {
  const team = slug.toUpperCase();
  return slug === team.toLowerCase() && FRANCHISES.includes(team) ? team : null;
}

export function franchiseStaticParams(): { team: string }[] {
  return FRANCHISES.map((t) => ({ team: t.toLowerCase() }));
}

export function franchiseFullName(team: string): string {
  return `${CITY[team] ?? team} ${teamName(team)}`;
}

export function franchiseFormerly(team: string): string | null {
  return FORMERLY[team] ?? null;
}

export function franchiseHeadline(team: string): string {
  return `All-time ${franchiseFullName(team)} starting five`;
}

const isFranchise = (team: string) => FRANCHISES.includes(team);
const personOf = (p: Player) => p.person_id ?? p.id;
const isStarter = (p: Player) => (p.mp ?? STARTER_MPG) >= STARTER_MPG;

// Franchise order: full-time starters (30+ mpg that season) first, so a famous player's cameo stint
// can't outrank the franchise's own stars; then the draft board's public "Top" sort; then id.
export function compareFranchiseRank(a: Player, b: Player): number {
  return Number(isStarter(b)) - Number(isStarter(a)) || compareSzn(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export interface SeatedCard { slot: Slot; card: Player }

// Seat people (each = their cards, best-ranked first) at distinct slots. Of every legal seating, use each
// person's highest-ranked eligible card, then prefer players at their listed position; null if none.
function seat(people: Player[][]): SeatedCard[] | null {
  let best = null as SeatedCard[] | null;
  let bestScore = -Infinity;
  const cur: SeatedCard[] = [];
  const used = new Set<Slot>();
  const go = (i: number, score: number) => {
    if (i === people.length) {
      if (score > bestScore) { bestScore = score; best = [...cur]; }
      return;
    }
    for (const slot of SLOTS) {
      if (used.has(slot)) continue;
      const k = people[i].findIndex((c) => eligibleOf(c).includes(slot));
      if (k < 0) continue;
      const card = people[i][k];
      used.add(slot); cur.push({ slot, card });
      go(i + 1, score - 10 * k + (card.pos === slot ? 1 : 0));
      cur.pop(); used.delete(slot);
    }
  };
  go(0, 0);
  return best && [...best].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
}

// Rule: walk people in franchise order (best card first) and keep each one who can still be seated with
// those already kept — greedy over a slot matching, so it never strands an open position while any legal
// five exists. Returns the five in PG,SG,SF,PF,C order, or null if the pool has no slot-legal five.
export function pickAllTimeFive(pool: Player[]): SeatedCard[] | null {
  const people = new Map<string, Player[]>();
  for (const p of [...pool].sort(compareFranchiseRank)) {
    const k = personOf(p);
    if (!people.has(k)) people.set(k, []);
    people.get(k)!.push(p);
  }
  const kept: Player[][] = [];
  for (const cards of people.values()) {
    if (kept.length === SLOTS.length) break;
    if (seat([...kept, cards])) kept.push(cards);
  }
  return kept.length === SLOTS.length ? seat(kept) : null;
}

export interface DecadeCards { decade: string; cards: Player[] }

// Per draftable decade (chronological), the top N distinct people in franchise order.
export function rankLegends(pool: Player[], perDecade = LEGENDS_PER_DECADE): DecadeCards[] {
  const out: DecadeCards[] = [];
  for (const decade of DECADES) {
    const seen = new Set<string>();
    const cards: Player[] = [];
    for (const p of pool.filter((x) => x.decade === decade).sort(compareFranchiseRank)) {
      if (cards.length === perDecade) break;
      if (seen.has(personOf(p))) continue;
      seen.add(personOf(p));
      cards.push(p);
    }
    if (cards.length) out.push({ decade, cards });
  }
  return out;
}

export interface FranchisePlayer {
  id: string;
  personId: string;
  name: string;
  year: number;
  season: string;      // "1987–88"
  decade: string;
  positions: Slot[];
  pts: number | null;
  trb: number | null;
  ast: number | null;
  accolades: string;   // real career honors line, "" when none
}

function toFranchisePlayer(p: Player): FranchisePlayer {
  const acc = accoladesFor(personOf(p));
  return {
    id: p.id, personId: personOf(p), name: p.name, year: p.year,
    season: `${p.year - 1}–${String(p.year).slice(-2)}`, decade: p.decade, positions: eligibleOf(p),
    pts: p.pts ?? null, trb: p.trb ?? null, ast: p.ast ?? null, accolades: acc ? accoladeLine(acc) : "",
  };
}

export interface FranchiseFive {
  team: string;
  slots: { slot: Slot; player: FranchisePlayer }[];
  ids: string[];  // slot order — the /r/ permalink's lineup
  record: { wins: number; losses: number; grade: string; label: string };
  href: string;
}

export function franchiseAllTimeFive(team: string): FranchiseFive | null {
  if (!isFranchise(team)) return null;
  const seated = pickAllTimeFive(getFranchisePool(team));
  if (!seated) return null;
  const ids = seated.map((s) => s.card.id);
  const r = evaluateLineup(seated.map((s) => s.card), getCoefficients());
  return {
    team,
    slots: seated.map((s) => ({ slot: s.slot, player: toFranchisePlayer(s.card) })),
    ids,
    record: { wins: r.wins, losses: r.losses, grade: r.grade, label: r.label },
    href: `/r/${encodeLineup(ids)}`,
  };
}

export interface FranchiseDecade { decade: string; players: FranchisePlayer[] }

export function franchiseLegends(team: string, perDecade = LEGENDS_PER_DECADE): FranchiseDecade[] | null {
  if (!isFranchise(team)) return null;
  return rankLegends(getFranchisePool(team), perDecade).map((d) => ({ decade: d.decade, players: d.cards.map(toFranchisePlayer) }));
}

export interface FranchiseIndexEntry { team: string; name: string; path: string; five: FranchiseFive | null }

const franchisesByName = () =>
  [...FRANCHISES].sort((a, b) => franchiseFullName(a).localeCompare(franchiseFullName(b), "en"));

// All 30 franchises, alphabetical by full name, with their all-time five — the /teams grid.
export function franchiseIndex(): FranchiseIndexEntry[] {
  return franchisesByName().map((team) => ({ team, name: franchiseFullName(team), path: franchisePath(team), five: franchiseAllTimeFive(team) }));
}

// --- metadata / share card / JSON-LD (marketingMeta conventions) ---

const INDEX_TITLE = "All-time starting fives for every NBA franchise";
const INDEX_DESCRIPTION =
  "The all-time starting five for all 30 NBA franchises — picked by career accolades, one per position — with each five's projected 82-game record from the SweepSzn engine and every franchise's legends by decade.";

// A page-level openGraph/twitter REPLACES the root's whole object (Next metadata merges shallowly per
// key), so re-carry siteName/type and card/site/creator alongside the page-specific text.
function shareMetadata(title: string, ogTitle: string, description: string, canonical: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title: ogTitle, description, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary_large_image", title: ogTitle, description, site: X_HANDLE, creator: X_HANDLE },
  };
}

export function teamsIndexMetadata(): Metadata {
  return shareMetadata(`${INDEX_TITLE} · ${SITE_NAME}`, INDEX_TITLE, INDEX_DESCRIPTION, "/teams");
}

const nameList = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");

export function franchiseMetadata(team: string): Metadata | null {
  if (!isFranchise(team)) return null;
  const full = franchiseFullName(team);
  const headline = franchiseHeadline(team);
  const five = franchiseAllTimeFive(team);
  const description = five
    ? `The all-time ${full} starting five: ${nameList(five.slots.map((s) => s.player.name))} — projected ${five.record.wins}-${five.record.losses} by the SweepSzn engine. Plus ${teamName(team)} legends by decade, with real stats and accolades.`
    : `${full} legends by decade, with real stats and accolades — then draft your own all-time five on SweepSzn.`;
  return shareMetadata(`${headline} · ${SITE_NAME}`, headline, description, franchisePath(team));
}

export const TEAMS_INDEX_CARD: MarketingOgCard = {
  eyebrow: "Franchises",
  title: "Every NBA franchise's all-time starting five",
  sub: "30 franchises, one five each — picked by career accolades, one per position, then simulated over 82 games.",
  chips: ["30 franchises", "Legends by decade", "Real stats & accolades"],
  cta: "Draft your own →",
};

export function franchiseOgCard(team: string): MarketingOgCard | null {
  if (!isFranchise(team)) return null;
  const five = franchiseAllTimeFive(team);
  return {
    eyebrow: "All-time five",
    title: franchiseHeadline(team),
    sub: five
      ? `${five.slots.map((s) => displayName(s.player.name)).join(" · ")} — projected ${five.record.wins}-${five.record.losses} (${five.record.grade}) by the SweepSzn engine.`
      : `${teamName(team)} legends by decade, with real stats and accolades.`,
    chips: ["Picked by career accolades", "One per position", "Legends by decade"],
    cta: "Can you beat it? →",
  };
}

// Escape the characters that could break out of the <script> context (same pattern as the home page).
const jsonLdHtml = (o: unknown) =>
  JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

export function franchiseJsonLdHtml(team: string): string | null {
  if (!isFranchise(team)) return null;
  const url = `${baseUrl}${franchisePath(team)}`;
  const five = franchiseAllTimeFive(team);
  const graph: object[] = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
        { "@type": "ListItem", position: 2, name: "Teams", item: `${baseUrl}/teams` },
        { "@type": "ListItem", position: 3, name: franchiseFullName(team), item: url },
      ],
    },
  ];
  if (five) {
    graph.push({
      "@type": "ItemList",
      name: franchiseHeadline(team),
      url,
      numberOfItems: five.slots.length,
      itemListElement: five.slots.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.player.name })),
    });
  }
  return jsonLdHtml({ "@context": "https://schema.org", "@graph": graph });
}

export function teamsIndexJsonLdHtml(): string {
  const teams = franchisesByName();
  return jsonLdHtml({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: INDEX_TITLE,
    numberOfItems: teams.length,
    itemListElement: teams.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: franchiseHeadline(t), url: `${baseUrl}${franchisePath(t)}` })),
  });
}
