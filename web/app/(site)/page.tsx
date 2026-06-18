import type { Metadata } from "next";
import LandingSection from "@/components/LandingSection";
import Beacon from "@/components/Beacon";
import { baseUrl } from "@/lib/site";

// Canonical lives here (homepage only) — NOT in the shared root layout, so the noindex
// /r/[lineup] permalinks don't inherit a canonical pointing back to "/".
export const metadata: Metadata = {
  title: "SweepSzn — Can you build an undefeated all-time NBA five?",
  alternates: { canonical: "/" },
};

// Crawlable SEO body copy (server-rendered, visible). Sits below the LandingSection on the home
// page and adds keyword-dense basketball terminology for search.
const SEO_COPY =
  "SweepSzn is a browser-based all-time NBA lineup simulator where you draft a five-player starting " +
  "five by spinning a franchise reel and a decade reel, then simulate a full 82-game NBA season. " +
  "The simulation engine is calibrated to 1,170 real NBA team-seasons (1985–2025) across 24,687 " +
  "player-seasons, with out-of-sample accuracy of about 5.6 wins RMSE against luck-adjusted " +
  "Pythagorean win totals in year-grouped cross-validation (6.1 against raw win totals). " +
  "Unlike lineup tools that simply add up box-score averages, SweepSzn models finite possessions and " +
  "usage overload (too many ball-dominant stars costs wins), era normalization via per-season " +
  "z-scores (so Wilt Chamberlain's pace-inflated 1962 numbers are not compared directly to modern " +
  "stats), floor spacing, rim protection, and lineup fit and redundancy. Every result includes a " +
  "plain-English “Why this record” breakdown — a two-column helping/hurting factor list and a " +
  "per-player role label (Lead creator, Rim protector, 3&D wing, Floor spacer) — so you understand " +
  "exactly what is working and what is costing wins. Daily mode gives every player the same spins " +
  "each day and ranks results on a verified server-side leaderboard with streak tracking. Classic " +
  "mode shows player statistics during the draft; HoopIQ mode hides them so you draft entirely from " +
  "memory. Factor Hunt mode asks you to predict which engine factor matters most before the reveal; " +
  "Prime Draft drops the era reel so you can build cross-era fives with every player at his peak; " +
  "Blueprint mode has you commit to a tactical objective before the spin and grades your execution; " +
  "and Surgeon mode diagnoses your lineup's worst factor and gives you one targeted swap to fix it. " +
  "You can also challenge a friend to the same spins. Every result generates a unique shareable " +
  "permalink and result card. The goal: can you build an all-time NBA five that goes 82-0, " +
  "undefeated over a full season? Nobody has — the best draftable five projects 79-3, better than " +
  "the 73-9 Warriors, and the engine is brutally honest about why.";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "SweepSzn",
  url: baseUrl,
  description:
    "All-time NBA lineup simulator. Draft a starting five by spinning team and era reels. Engine calibrated to 1,170 real NBA team-seasons — and it tells you why your lineup wins or loses.",
  applicationCategory: "GameApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  genre: "Sports simulation",
  keywords:
    "NBA lineup simulator, all-time NBA team builder, best NBA starting five, NBA fantasy draft game, NBA team builder game",
  sameAs: ["https://x.com/SweepSeason"],
};

// Escape the three characters that could break out of the <script> context (defense-in-depth;
// the payload is fully static today, but this keeps the pattern safe if it ever takes dynamic data).
const jsonLdHtml = JSON.stringify(jsonLd)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026");

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />
      {/* Top-of-funnel: one visit beacon per device (visitor → first-play denominator). Device-scoped
          to match first_play's per-device identity, so rates.firstPlay is a clean new-device rate. */}
      <Beacon name="visit" dedupe={{ scope: "device", key: "szn:ev:visit" }} />
      <LandingSection />
      {/* Calibration proof, scoreboard-style, plus the keyword-dense SEO prose kept crawlable inside
          a <details> (rendered in the DOM, just collapsed) so the page reads premium, not like a wall. */}
      <section className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat n="1,170" label="real NBA team-seasons" />
          <Stat n="24,687" label="player-seasons" />
          <Stat n="5.6" label="win RMSE, out-of-sample" />
          <Stat n="8" label="ways to play" />
        </div>
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-orange-400 hover:text-orange-300">
            More about the engine
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">{SEO_COPY}</p>
        </details>
      </section>
    </>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-center">
      <div className="font-mono text-2xl font-black tabular-nums text-zinc-100">{n}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">{label}</div>
    </div>
  );
}
