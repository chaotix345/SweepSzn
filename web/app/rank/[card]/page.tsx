import type { Metadata } from "next";
import { X_HANDLE, SITE_NAME } from "@/lib/site";
import { notFound } from "next/navigation";
import { decodeRankCard, type RankCard } from "@/lib/rankShare";
import ShareHeader from "@/components/ShareHeader";
import SkipLink from "@/components/SkipLink";
import Beacon from "@/components/Beacon";

type Props = { params: Promise<{ card: string }> };

const where = (c: RankCard) => c.scope === "daily" ? "today's Daily board" : c.scope === "week" ? "this week's board" : "the all-time board";
const metric = (c: RankCard) => c.scope === "daily" ? `${c.wins}-${c.losses} · Net ${c.net > 0 ? "+" : ""}${c.net.toFixed(1)}` : `${c.wins.toLocaleString()} career wins`;
const scopeLabel = (c: RankCard) => c.scope === "daily" ? "Daily leaderboard" : c.scope === "week" ? "Weekly leaderboard" : "All-time leaderboard";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { card } = await params;
  const c = decodeRankCard(card);
  if (!c) return { title: "SweepSzn leaderboard", robots: { index: false } };
  const title = `#${c.rank} on ${where(c)} — ${c.name} · SweepSzn`;
  const description = `${c.name} is #${c.rank} of ${c.total.toLocaleString()} on ${where(c)} (${metric(c)}). Can you rank higher?`;
  return {
    title,
    description,
    robots: { index: false }, // shareable snapshot, not search content
    openGraph: { title, description, siteName: SITE_NAME, type: "website", url: `/rank/${card}` },
    twitter: { card: "summary_large_image", title, description, site: X_HANDLE, creator: X_HANDLE },
  };
}

export default async function RankPage({ params }: Props) {
  const { card } = await params;
  const c = decodeRankCard(card);
  if (!c) notFound();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <SkipLink href="#share-content" />
      {/* Share-loop close + first-arrival visit (feeds sourceSplit.visit; device key shared with home). */}
      <Beacon name="share_view" />
      <Beacon name="visit" dedupe={{ scope: "device", key: "szn:ev:visit" }} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ShareHeader tagline="a friend shared their rank" cta="Can you rank higher? →" />
        <div id="share-content" tabIndex={-1} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center outline-none">
          <h1>
            <span className="block text-xs font-semibold uppercase tracking-widest text-zinc-500">{scopeLabel(c)}</span>
            {/* #1 is the trophy spot: gold is reserved for it (DESIGN.md), every other rank stays orange */}
            <span className={`mt-2 block font-display text-7xl tabular-nums ${c.rank === 1 ? "text-gold" : "text-orange-500"}`}>#{c.rank}</span>
            <span className="mt-1 block text-sm font-normal tabular-nums text-zinc-400">of {c.total.toLocaleString()} players</span>
          </h1>
          <div className="mt-5 text-lg font-bold text-zinc-100">{c.name}</div>
          <div className="mt-1 font-mono tabular-nums text-zinc-300">{metric(c)}</div>
        </div>
      </div>
      <footer className="pb-10 text-center text-xs text-zinc-400">engine calibrated to real NBA team-seasons</footer>
    </main>
  );
}
