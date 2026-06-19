import type { Metadata } from "next";
import { SITE_NAME } from "./site";

// Per-page share identity for the static marketing routes. These four previously inherited the generic
// root OG card + the generic openGraph/twitter title+description (each page set only `metadata.title`,
// so Next merged the root's `openGraph` verbatim). Centralizing here gives one source of truth that
// both the page `metadata` (via marketingMetadata) and the co-located `opengraph-image` route (the
// rendered card) read, so they can't drift. All descriptive/marketing copy — §12-safe (no engine
// hints, no per-candidate signals).

export type MarketingOgCard = {
  eyebrow: string;   // small mode/section label by the wordmark
  title: string;     // the big headline on the card
  sub: string;       // one-line supporting description
  chips: string[];   // 1–4 short feature pills
  cta: string;       // bottom-right call to action
};

export type MarketingMeta = {
  title: string;        // document <title> (kept identical to the existing per-page title)
  description: string;  // meta description, reused for openGraph + twitter description
  ogTitle: string;      // shareable openGraph + twitter title (≤70 chars for Twitter)
  card: MarketingOgCard;
};

export type MarketingRoute = "about" | "how-it-works" | "leaderboards" | "dex";

export const MARKETING_ROUTES: readonly MarketingRoute[] = ["about", "how-it-works", "leaderboards", "dex"];

// Mirrors the root layout's twitter handle so per-page twitter cards keep attribution.
const X_HANDLE = "@SweepSeason";

export const MARKETING_META: Record<MarketingRoute, MarketingMeta> = {
  about: {
    title: "About SweepSzn",
    description:
      "SweepSzn is a free browser game: draft a five-player all-time NBA lineup and get a simulated 82-game record from an engine calibrated to real history — one that tells you why your five wins or loses.",
    ogTitle: "About SweepSzn — the honest NBA team builder",
    card: {
      eyebrow: "About",
      title: "The honest all-time NBA team builder",
      sub: "A free browser game: draft a five, simulate 82 games, and get the plain-English why behind every win and loss.",
      chips: ["Free · no account", "8 game modes", "Calibrated to real history"],
      cta: "Build your five →",
    },
  },
  "how-it-works": {
    title: "How SweepSzn works — the honest NBA lineup engine, explained",
    description:
      "How SweepSzn simulates an 82-game season for any all-time NBA starting five: finite possessions, usage overload, era normalization, defense at full weight, spacing and fit — calibrated to 1,170 real NBA team-seasons.",
    ogTitle: "How SweepSzn works — the engine, explained",
    card: {
      eyebrow: "How it works",
      title: "An engine that plays real basketball",
      sub: "Finite possessions, era normalization, defense at full weight, spacing and fit — then it tells you exactly what helped and hurt.",
      chips: ["Finite possessions", "Era-normalized", "Defense at full weight", "Spacing & fit"],
      cta: "See it in action →",
    },
  },
  leaderboards: {
    title: "SweepSzn leaderboards — Daily, Weekly, All-time",
    description:
      "Today's Daily leaderboard plus the Weekly and All-time boards. Everyone gets the same team and era spins each day — can you top the table?",
    ogTitle: "SweepSzn leaderboards — closest to 82-0?",
    card: {
      eyebrow: "Leaderboards",
      title: "Who's gone closest to 82-0?",
      sub: "Daily gives everyone the same spins — a pure test of judgment. Weekly sums your best; All-time is your career total.",
      chips: ["Daily", "Weekly", "All-time"],
      cta: "Play today's Daily →",
    },
  },
  dex: {
    title: "Drafted Dex · SweepSzn",
    description: "Every player you've fielded — your personal all-time collection, with milestones to chase.",
    ogTitle: "Drafted Dex — your all-time NBA collection",
    card: {
      eyebrow: "Drafted Dex",
      title: "Every legend you've fielded",
      sub: "Your personal all-time collection — every player you've drafted, with milestones and badges to chase.",
      chips: ["Collect every legend", "Badges to unlock"],
      cta: "Start your Dex →",
    },
  },
};

// Build the page `metadata` for a marketing route. IMPORTANT: a child page that sets `openGraph` (or
// `twitter`) REPLACES the root layout's whole object — it is not deep-merged (Next metadata is shallow
// per key). So this re-specifies siteName/type (openGraph) and card/site/creator (twitter) to avoid
// dropping them, while overriding only the title/description with the page-specific share text. The
// co-located opengraph-image route supplies the image; pages add their own `alternates.canonical`.
export function marketingMetadata(route: MarketingRoute): Metadata {
  const m = MARKETING_META[route];
  return {
    title: m.title,
    description: m.description,
    openGraph: { title: m.ogTitle, description: m.description, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary_large_image", title: m.ogTitle, description: m.description, site: X_HANDLE, creator: X_HANDLE },
  };
}
