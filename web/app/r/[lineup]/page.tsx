import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { decodeShare } from "@/lib/share";
import { SLOTS, displayName } from "@/lib/teams";
import ResultCard from "@/components/ResultCard";

type Props = { params: Promise<{ lineup: string }> };

// cache() dedupes the lookup+evaluate across generateMetadata and the page render (same request).
const loadLineup = cache((lineup: string) => {
  const { ids, hinted, prime } = decodeShare(lineup);
  // reject crafted URLs with the wrong count or duplicate ids (5 of the same player would otherwise
  // pass the length check and render a nonsensical fabricated record) — mirrors verifyTrace's guard
  if (ids.length !== 5 || new Set(ids).size !== 5) return null;
  const players = getPlayersByIds(ids);
  if (players.length !== 5) return null;
  return { players, result: evaluateLineup(players, getCoefficients()), hinted, prime };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lineup } = await params;
  const data = loadLineup(lineup);
  // Per-lineup pages are noindex: they're shareable permalinks, not search content.
  if (!data) return { title: "SweepSzn — all-time NBA lineup", robots: { index: false } };
  const { result, players } = data;
  const names = players.map((p) => displayName(p.name)).join(", ");
  const net = `${result.netRtg > 0 ? "+" : ""}${result.netRtg.toFixed(1)}`;
  const title = `${result.wins}-${result.losses} (${result.grade}) — ${names} · SweepSzn`;
  const description = `${names} project to ${result.wins}-${result.losses} (${result.label}) — Net ${net}. Can you build a better all-time five?`;
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: "website", url: `/r/${lineup}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedResult({ params }: Props) {
  const { lineup } = await params;
  const data = loadLineup(lineup);
  if (!data) notFound();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/" className="flex items-baseline text-2xl tracking-tight">
          <span className="font-display">Sweep<span className="text-orange-500">Szn</span></span>
          <span className="ml-3 text-sm font-semibold text-zinc-500">a friend shared their five</span>
        </Link>
        <ResultCard result={data.result} players={data.players} slots={SLOTS} mode="shared" usedHints={data.hinted} shared prime={data.prime} />
      </div>
      <footer className="pb-10 text-center text-xs text-zinc-600">
        engine calibrated to real NBA team-seasons
      </footer>
    </main>
  );
}
