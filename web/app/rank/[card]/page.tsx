import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decodeRankCard, type RankCard } from "@/lib/rankShare";
import { ButtonLink } from "@/components/ui/Button";
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
    openGraph: { title, description, type: "website", url: `/rank/${card}` },
    twitter: { card: "summary_large_image", title, description, site: "@SweepSeason", creator: "@SweepSeason" },
  };
}

export default async function RankPage({ params }: Props) {
  const { card } = await params;
  const c = decodeRankCard(card);
  if (!c) notFound();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Share-loop close + first-arrival visit (feeds sourceSplit.visit; device key shared with home). */}
      <Beacon name="share_view" />
      <Beacon name="visit" dedupe={{ scope: "device", key: "szn:ev:visit" }} />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/" className="flex items-baseline text-2xl tracking-tight">
          <span className="font-display">Sweep<span className="text-orange-500">Szn</span></span>
          <span className="ml-3 text-sm font-semibold text-zinc-500">a friend shared their rank</span>
        </Link>
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{scopeLabel(c)}</div>
          <div className="mt-2 font-display text-7xl tabular-nums text-orange-500">#{c.rank}</div>
          <div className="mt-1 text-sm text-zinc-400">of {c.total.toLocaleString()} players</div>
          <div className="mt-5 text-lg font-bold text-zinc-100">{c.name}</div>
          <div className="mt-1 text-zinc-300">{metric(c)}</div>
          <ButtonLink href="/play?mode=daily" size="md" className="mt-7">Build your five →</ButtonLink>
        </div>
      </div>
      <footer className="pb-10 text-center text-xs text-zinc-600">engine calibrated to real NBA team-seasons</footer>
    </main>
  );
}
